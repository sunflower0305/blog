import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/admin-auth";
import { getAppCloudflareEnv } from "@/lib/cloudflare";
import {
  ensureAiImageConfigInfrastructure,
  resolveAiImageProfileConfig,
} from "@/lib/ai-image-config";
import { AI_IMAGE_PROVIDER_MAP } from "@/lib/ai-image-provider-presets";
import { normalizeBaseUrl, resolveAiConfigSecret } from "@/lib/ai-provider-profiles";
import {
  buildPresetModels,
  errorMessage,
  fetchProviderModelItems,
  type RawProviderModelItem,
} from "@/lib/provider-model-discovery";

interface RawImageProfile {
  id: number;
  provider: string;
  base_url: string;
  api_key_encrypted: string;
}

interface ImageModelRequestConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  fallbackModels: string[];
  storedKeyUnavailable: boolean;
}

interface ImageModelQuery {
  provider: string;
  baseUrl: string;
  apiKey: string;
  profileId: number;
}

type ResolvedImageProfile = Awaited<ReturnType<typeof resolveAiImageProfileConfig>>;

function readModelQuery(req: NextRequest): ImageModelQuery {
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

async function resolveStoredProfile(
  db: D1Database,
  secret: string,
  profileId: number,
  rawProfile: RawImageProfile | null,
) {
  return rawProfile ? await resolveAiImageProfileConfig(db, secret, profileId) : null;
}

function isStoredKeyUnavailable(
  queryApiKey: string,
  rawProfile: RawImageProfile | null,
  profile: ResolvedImageProfile,
) {
  return !queryApiKey && Boolean(rawProfile?.api_key_encrypted?.trim()) && !profile?.api_key;
}

async function loadRawProfile(db: D1Database, profileId: number) {
  if (!Number.isFinite(profileId) || profileId <= 0) return null;
  return db
    .prepare(`
      SELECT id, provider, base_url, api_key_encrypted
      FROM ai_image_provider_profiles
      WHERE id = ?
      LIMIT 1
    `)
    .bind(profileId)
    .first<RawImageProfile>();
}

async function resolveModelRequest(
  req: NextRequest,
  db: D1Database,
  secret: string,
): Promise<ImageModelRequestConfig> {
  const query = readModelQuery(req);
  const rawProfile = await loadRawProfile(db, query.profileId);
  const profile = await resolveStoredProfile(db, secret, query.profileId, rawProfile);
  const provider = firstValue([query.provider, profile?.provider, rawProfile?.provider], "custom");

  return {
    provider,
    baseUrl: normalizeBaseUrl(firstValue([query.baseUrl, profile?.base_url, rawProfile?.base_url])),
    apiKey: firstValue([query.apiKey, profile?.api_key]),
    fallbackModels: AI_IMAGE_PROVIDER_MAP[provider]?.quickModels || [],
    storedKeyUnavailable: isStoredKeyUnavailable(query.apiKey, rawProfile, profile),
  };
}

function missingKeyResponse(config: ImageModelRequestConfig) {
  const warning = config.storedKeyUnavailable
    ? "已保存 API Key 无法解密，请重新输入 API Key，或检查 AI_CONFIG_ENCRYPTION_SECRET / ADMIN_TOKEN_SALT 是否与保存时一致"
    : "未提供 API Key，返回预设模型列表";
  if (config.fallbackModels.length > 0) {
    return fallbackResponse(config.fallbackModels, warning);
  }
  return NextResponse.json(
    { error: config.storedKeyUnavailable ? warning : "缺少 API Key" },
    { status: 400 },
  );
}

function buildModels(items: RawProviderModelItem[]) {
  const ids = new Set(items.map(resolveModelId).filter(Boolean));
  return buildPresetModels(Array.from(ids).sort((a, b) => a.localeCompare(b, "zh-CN")));
}

function resolveModelId(item: RawProviderModelItem) {
  if (typeof item === "string") return item.trim();
  return (item.id || item.model || item.slug || item.name || "").trim();
}

function fallbackResponse(models: string[], warning: string) {
  return NextResponse.json({ models: buildPresetModels(models), source: "preset", warning });
}

async function providerResponse(config: ImageModelRequestConfig) {
  const result = await fetchProviderModelItems<RawProviderModelItem>({
    urls: [`${config.baseUrl}/models`],
    apiKey: config.apiKey,
  });
  const models = buildModels(result.items);
  if (models.length > 0) return NextResponse.json({ models, source: "provider" });
  return emptyProviderResponse(result.warnings[0], config.fallbackModels);
}

function emptyProviderResponse(warning: string | undefined, fallbackModels: string[]) {
  if (fallbackModels.length > 0) {
    return fallbackResponse(
      fallbackModels,
      warning ? `接口拉取失败，已回退预设：${warning}` : "接口返回为空，已回退预设模型",
    );
  }
  return NextResponse.json(
    { error: warning ? `获取模型列表失败：${warning}` : undefined },
    { status: warning ? 502 : 200 },
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

  await ensureAiImageConfigInfrastructure(db);
  const config = await resolveModelRequest(req, db, resolveAiConfigSecret(env));
  if (!config.baseUrl) return NextResponse.json({ error: "缺少 base_url 参数" }, { status: 400 });
  if (!config.apiKey) return missingKeyResponse(config);

  try {
    return await providerResponse(config);
  } catch (error) {
    return networkErrorResponse(error, config.fallbackModels);
  }
}
