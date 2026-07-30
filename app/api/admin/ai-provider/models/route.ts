import { NextRequest, NextResponse } from "next/server";
import {
  decryptApiKey,
  ensureAiConfigInfrastructure,
  normalizeBaseUrl,
  resolveAiConfigSecret,
} from "@/lib/ai-provider-profiles";
import { AI_PROVIDER_MAP } from "@/lib/ai-provider-presets";
import { fetchProviderModelItems } from "@/lib/provider-model-discovery";
import {
  emptyProviderModelResponse,
  firstDefinedValue,
  missingProviderKeyResponse,
  presetModelResponse,
  providerModelNetworkError,
  readProviderModelQuery,
  type ProviderModelConfig,
} from "@/lib/server/provider-model-route";
import { getAuthenticatedRoute } from "@/lib/server/route-helpers";
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
): Promise<ProviderModelConfig> {
  const query = readProviderModelQuery(req);
  const profile = await loadProviderProfile(db, query.profileId);
  const provider = firstDefinedValue([query.provider, profile?.provider], "custom");
  const profileApiKey = await decryptProfileKey(profile, secret);

  return {
    provider,
    baseUrl: normalizeBaseUrl(firstDefinedValue([query.baseUrl, profile?.base_url])),
    apiKey: firstDefinedValue([query.apiKey, profileApiKey]),
    fallbackModels: AI_PROVIDER_MAP[provider]?.quickModels || [],
    storedKeyUnavailable: isStoredKeyUnavailable(query.apiKey, profile, profileApiKey),
  };
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

async function workersAiResponse(config: ProviderModelConfig) {
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
    return presetModelResponse(config.fallbackModels, "Workers AI 接口返回为空，已回退预设模型");
  }
  return NextResponse.json({ models, source: "provider" });
}

function invalidWorkersAccountResponse(fallbackModels: string[]) {
  if (fallbackModels.length > 0) {
    return presetModelResponse(
      fallbackModels,
      "Workers AI 需要把 Base URL 里的 <ACCOUNT_ID> 替换成真实 Cloudflare Account ID 后才能拉取完整模型列表",
    );
  }
  return NextResponse.json(
    { error: "请先在 Base URL 中填写真实的 Cloudflare Account ID" },
    { status: 400 },
  );
}

async function compatibleProviderResponse(config: ProviderModelConfig) {
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
  return emptyProviderModelResponse(warnings[0], fallbackModels);
}

export async function GET(req: NextRequest) {
  const route = await getAuthenticatedRoute(req);
  if (!route.ok) return route.response;

  const secret = resolveAiConfigSecret(route.env);
  await ensureAiConfigInfrastructure(route.db, secret);
  const config = await resolveModelRequest(req, route.db, secret);
  if (!config.baseUrl) return NextResponse.json({ error: "缺少 base_url 参数" }, { status: 400 });
  if (!config.apiKey && config.provider !== "openrouter") return missingProviderKeyResponse(config);

  try {
    return isWorkersAiProvider(config.provider, config.baseUrl)
      ? await workersAiResponse(config)
      : await compatibleProviderResponse(config);
  } catch (error) {
    return providerModelNetworkError(error, config.fallbackModels);
  }
}
