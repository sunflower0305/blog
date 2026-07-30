import { NextRequest, NextResponse } from "next/server";
import {
  ensureAiImageConfigInfrastructure,
  resolveAiImageProfileConfig,
} from "@/lib/ai-image-config";
import { AI_IMAGE_PROVIDER_MAP } from "@/lib/ai-image-provider-presets";
import { normalizeBaseUrl, resolveAiConfigSecret } from "@/lib/ai-provider-profiles";
import {
  buildPresetModels,
  fetchProviderModelItems,
  type RawProviderModelItem,
} from "@/lib/provider-model-discovery";
import {
  emptyProviderModelResponse,
  firstDefinedValue,
  missingProviderKeyResponse,
  providerModelNetworkError,
  readProviderModelQuery,
  type ProviderModelConfig,
} from "@/lib/server/provider-model-route";
import { getAuthenticatedRoute } from "@/lib/server/route-helpers";

interface RawImageProfile {
  id: number;
  provider: string;
  base_url: string;
  api_key_encrypted: string;
}

type ResolvedImageProfile = Awaited<ReturnType<typeof resolveAiImageProfileConfig>>;

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
): Promise<ProviderModelConfig> {
  const query = readProviderModelQuery(req);
  const rawProfile = await loadRawProfile(db, query.profileId);
  const profile = await resolveStoredProfile(db, secret, query.profileId, rawProfile);
  const provider = firstDefinedValue(
    [query.provider, profile?.provider, rawProfile?.provider],
    "custom",
  );

  return {
    provider,
    baseUrl: normalizeBaseUrl(
      firstDefinedValue([query.baseUrl, profile?.base_url, rawProfile?.base_url]),
    ),
    apiKey: firstDefinedValue([query.apiKey, profile?.api_key]),
    fallbackModels: AI_IMAGE_PROVIDER_MAP[provider]?.quickModels || [],
    storedKeyUnavailable: isStoredKeyUnavailable(query.apiKey, rawProfile, profile),
  };
}

function buildModels(items: RawProviderModelItem[]) {
  const ids = new Set(items.map(resolveModelId).filter(Boolean));
  return buildPresetModels(Array.from(ids).sort((a, b) => a.localeCompare(b, "zh-CN")));
}

function resolveModelId(item: RawProviderModelItem) {
  if (typeof item === "string") return item.trim();
  return (item.id || item.model || item.slug || item.name || "").trim();
}

async function providerResponse(config: ProviderModelConfig) {
  const result = await fetchProviderModelItems<RawProviderModelItem>({
    urls: [`${config.baseUrl}/models`],
    apiKey: config.apiKey,
  });
  const models = buildModels(result.items);
  if (models.length > 0) return NextResponse.json({ models, source: "provider" });
  return emptyProviderModelResponse(result.warnings[0], config.fallbackModels);
}

export async function GET(req: NextRequest) {
  const route = await getAuthenticatedRoute(req);
  if (!route.ok) return route.response;

  await ensureAiImageConfigInfrastructure(route.db);
  const config = await resolveModelRequest(req, route.db, resolveAiConfigSecret(route.env));
  if (!config.baseUrl) return NextResponse.json({ error: "缺少 base_url 参数" }, { status: 400 });
  if (!config.apiKey) return missingProviderKeyResponse(config);

  try {
    return await providerResponse(config);
  } catch (error) {
    return providerModelNetworkError(error, config.fallbackModels);
  }
}
