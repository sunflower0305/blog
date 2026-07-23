import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/admin-auth";
import { getAppCloudflareEnv } from "@/lib/cloudflare";
import {
  decryptApiKey,
  ensureAiConfigInfrastructure,
  normalizeBaseUrl,
  resolveAiConfigSecret,
} from "@/lib/ai-provider-profiles";
import { AI_PROVIDER_MAP } from "@/lib/ai-provider-presets";
import {
  buildPresetModels,
  errorMessage,
  fetchProviderModelItems,
} from "@/lib/provider-model-discovery";
import {
  buildWorkersAiModelOptions,
  extractCloudflareAccountId,
  fetchWorkersAiModels,
  type RawWorkersAiModelItem,
} from "@/lib/workers-ai-models";

interface ProviderProfile {
  id: number;
  provider: string;
  base_url: string;
  api_key_encrypted: string;
}

interface ModelRequestConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  fallbackModels: string[];
  storedKeyUnavailable: boolean;
}

interface ModelQuery {
  provider: string;
  baseUrl: string;
  apiKey: string;
  profileId: number;
}

function readModelQuery(req: NextRequest): ModelQuery {
  const params = new URL(req.url).searchParams;
  return {
    provider: readQueryParam(params, "provider"),
    baseUrl: readQueryParam(params, "base_url"),
    apiKey: readQueryParam(params, "api_key"),
    profileId: Number(params.get("profile_id") || ""),
  };
}

function readQueryParam(params: URLSearchParams, name: string) {
  return params.get(name)?.trim() || "";
}

function firstValue(values: Array<string | null | undefined>, fallback = "") {
  return values.find((value) => Boolean(value)) || fallback;
}

async function decryptProfileKey(profile: ProviderProfile | null, secret: string) {
  return profile?.api_key_encrypted ? await decryptApiKey(profile.api_key_encrypted, secret) : "";
}

function isStoredKeyUnavailable(
  queryApiKey: string,
  profile: ProviderProfile | null,
  profileApiKey: string,
) {
  return !queryApiKey && Boolean(profile?.api_key_encrypted?.trim()) && !profileApiKey;
}

async function loadProviderProfile(db: D1Database, profileId: number) {
  if (!Number.isFinite(profileId) || profileId <= 0) return null;
  return db
    .prepare(`
      SELECT id, provider, base_url, api_key_encrypted
      FROM ai_provider_profiles
      WHERE id = ?
      LIMIT 1
    `)
    .bind(profileId)
    .first<ProviderProfile>();
}

async function resolveModelRequest(
  req: NextRequest,
  db: D1Database,
  secret: string,
): Promise<ModelRequestConfig> {
  const query = readModelQuery(req);
  const profile = await loadProviderProfile(db, query.profileId);
  const provider = firstValue([query.provider, profile?.provider], "custom");
  const profileApiKey = await decryptProfileKey(profile, secret);

  return {
    provider,
    baseUrl: normalizeBaseUrl(firstValue([query.baseUrl, profile?.base_url])),
    apiKey: firstValue([query.apiKey, profileApiKey]),
    fallbackModels: AI_PROVIDER_MAP[provider]?.quickModels || [],
    storedKeyUnavailable: isStoredKeyUnavailable(query.apiKey, profile, profileApiKey),
  };
}

function missingKeyResponse(config: ModelRequestConfig) {
  const warning = config.storedKeyUnavailable
    ? "已保存 API Key 无法解密，请重新输入 API Key，或检查 AI_CONFIG_ENCRYPTION_SECRET / ADMIN_TOKEN_SALT 是否与保存时一致"
    : "未提供 API Key，返回预设模型列表";
  if (config.fallbackModels.length > 0) {
    return NextResponse.json({
      models: buildPresetModels(config.fallbackModels),
      source: "preset",
      warning,
    });
  }
  return NextResponse.json(
    { error: config.storedKeyUnavailable ? warning : "缺少 API Key" },
    { status: 400 },
  );
}

function isSiliconFlowProvider(provider: string, baseUrl: string) {
  return provider === "siliconflow" || /siliconflow\.(cn|com)/i.test(baseUrl);
}

function isWorkersAiProvider(provider: string, baseUrl: string) {
  return (
    provider === "workers_ai" ||
    /api\.cloudflare\.com\/client\/v4\/accounts\/[^/]+\/ai\//i.test(baseUrl)
  );
}

function filterCompatibleModels(items: RawWorkersAiModelItem[], provider: string, baseUrl: string) {
  if (!isSiliconFlowProvider(provider, baseUrl)) return items;
  const filtered = items.filter(isTextModel);
  return filtered.length > 0 ? filtered : items;
}

function isTextModel(item: RawWorkersAiModelItem) {
  if (typeof item === "string") return true;
  const subType = `${item.sub_type || item.subType || ""}`.toLowerCase();
  const type = `${item.type || item.category || ""}`.toLowerCase();
  if (subType) return /(chat|text|language|llm)/.test(subType);
  return type ? /(text|language|llm)/.test(type) : true;
}

function fallbackResponse(models: string[], warning: string) {
  return NextResponse.json({ models: buildPresetModels(models), source: "preset", warning });
}

async function workersAiResponse(config: ModelRequestConfig) {
  const accountId = extractCloudflareAccountId(config.baseUrl);
  if (!accountId || /<account_id>/i.test(accountId)) {
    return invalidWorkersAccountResponse(config.fallbackModels);
  }

  const models = await fetchWorkersAiModels(
    accountId,
    config.apiKey,
    "text",
    config.fallbackModels,
  );
  if (models.length === 0 && config.fallbackModels.length > 0) {
    return fallbackResponse(config.fallbackModels, "Workers AI 接口返回为空，已回退预设模型");
  }
  return NextResponse.json({ models, source: "provider" });
}

function invalidWorkersAccountResponse(fallbackModels: string[]) {
  if (fallbackModels.length > 0) {
    return fallbackResponse(
      fallbackModels,
      "Workers AI 需要把 Base URL 里的 <ACCOUNT_ID> 替换成真实 Cloudflare Account ID 后才能拉取完整模型列表",
    );
  }
  return NextResponse.json(
    { error: "请先在 Base URL 中填写真实的 Cloudflare Account ID" },
    { status: 400 },
  );
}

async function compatibleProviderResponse(config: ModelRequestConfig) {
  const urls = isSiliconFlowProvider(config.provider, config.baseUrl)
    ? [`${config.baseUrl}/models?sub_type=chat`, `${config.baseUrl}/models`]
    : [`${config.baseUrl}/models`];
  const result = await fetchProviderModelItems<RawWorkersAiModelItem>({
    urls,
    apiKey: config.apiKey,
    includeNestedResult: true,
    transformItems: (items) => filterCompatibleModels(items, config.provider, config.baseUrl),
  });
  const models = buildWorkersAiModelOptions(
    filterCompatibleModels(result.items, config.provider, config.baseUrl),
  );
  return modelResultResponse(models, result.warnings, config.fallbackModels);
}

function modelResultResponse(
  models: Array<{ id: string; name: string }>,
  warnings: string[],
  fallbackModels: string[],
) {
  if (models.length > 0) {
    return NextResponse.json({
      models,
      source: "provider",
      ...(warnings.length > 0 ? { warning: warnings[0] } : {}),
    });
  }
  if (fallbackModels.length > 0) {
    const warning = warnings.length
      ? `接口拉取失败，已回退预设：${warnings[0]}`
      : "接口返回为空，已回退预设模型";
    return fallbackResponse(fallbackModels, warning);
  }
  const message = warnings[0];
  return NextResponse.json(
    { error: message ? `获取模型列表失败：${message}` : undefined },
    { status: message ? 502 : 200 },
  );
}

function networkErrorResponse(error: unknown, fallbackModels: string[]) {
  const message = errorMessage(error, "获取模型列表失败");
  if (fallbackModels.length > 0) {
    return fallbackResponse(fallbackModels, `网络异常，已回退预设：${message}`);
  }
  return NextResponse.json({ error: message }, { status: 502 });
}

export async function GET(req: NextRequest) {
  const env = await getAppCloudflareEnv();
  const db = env?.DB as D1Database | undefined;
  if (!(await authenticateRequest(req, db))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const secret = resolveAiConfigSecret(env);
  await ensureAiConfigInfrastructure(db, secret);
  const config = await resolveModelRequest(req, db, secret);
  if (!config.baseUrl) return NextResponse.json({ error: "缺少 base_url 参数" }, { status: 400 });
  if (!config.apiKey && config.provider !== "openrouter") return missingKeyResponse(config);

  try {
    return isWorkersAiProvider(config.provider, config.baseUrl)
      ? await workersAiResponse(config)
      : await compatibleProviderResponse(config);
  } catch (error) {
    return networkErrorResponse(error, config.fallbackModels);
  }
}
