import { nanoid } from "nanoid";
import {
  ensureAiImageConfigInfrastructure,
  getDefaultImageActionSeed,
  resolveAiImageProfileConfig,
} from "@/lib/ai-image-config";
import {
  normalizeAiImageAspectRatio,
  normalizeAiImageResolution,
  type AIImageAspectRatio,
  type AIImageResolution,
} from "@/lib/ai-image-options";
import {
  buildAltText,
  buildFinalImagePrompt,
  resolveRequestedQuality,
  resolveRequestedSize,
} from "@/lib/ai-image-prompt";
import {
  requestOpenAiCompatibleImage,
  runWorkersAiCompatImageRequest,
  type GeneratedImagePayload,
} from "@/lib/ai-image-transport";
import {
  extractWorkersAiImageAsset,
  resolveWorkersAiImageSize,
  workersAssetToBytes,
} from "@/lib/ai-image-workers";
import { isWorkersAiBaseUrl, resolveAiConfigSecret } from "@/lib/ai-provider-profiles";

export {
  extractWorkersAiImageAsset,
  resolveWorkersAiImageSize,
  runWorkersAiCompatImageRequest,
};

type ImageBucket = {
  put: (
    key: string,
    value: File | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
      customMetadata?: Record<string, string>;
    },
  ) => Promise<void>;
};

interface AIImageEnv {
  AI_CONFIG_ENCRYPTION_SECRET?: string;
  ADMIN_TOKEN_SALT?: string;
  ENABLE_CF_IMAGE_PIPELINE?: string;
}

interface GenerateEditorImageInput {
  action: string;
  actionPrompt?: string;
  actionLabel?: string;
  userPrompt?: string;
  articleTitle?: string;
  contextText?: string;
  referenceImageUrl?: string;
  aspectRatio?: string;
  resolution?: string;
  profileId?: number | null;
  db: D1Database;
  env?: AIImageEnv;
  images: ImageBucket;
}

interface ResolvedImageAction {
  action_key: string;
  label: string;
  prompt: string;
  aspect_ratio: AIImageAspectRatio;
  resolution: AIImageResolution;
  size: string;
  quality: string;
  profile_id: number | null;
}

export interface GeneratedEditorImage {
  key: string;
  url: string;
  variants: { raw: string; content: string; thumb: string; cover: string };
  prompt: string;
  revisedPrompt: string;
  alt: string;
  actionLabel: string;
  aspectRatio: AIImageAspectRatio;
  resolution: AIImageResolution;
  size: string;
  profileName: string;
  model: string;
}

type ResolvedImageProfile = NonNullable<Awaited<ReturnType<typeof resolveAiImageProfileConfig>>>;
type DefaultImageActionSeed = NonNullable<ReturnType<typeof getDefaultImageActionSeed>>;

interface ImageGenerationContext {
  action: ResolvedImageAction | null;
  seeded: DefaultImageActionSeed | null;
  aspectRatio: AIImageAspectRatio;
  resolution: AIImageResolution;
  profile: ResolvedImageProfile;
  finalPrompt: string;
  referenceImageUrl: string;
}

function readFlag(value: unknown): boolean {
  return (
    typeof value === "string" && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase())
  );
}

function sanitizeFilename(filename: string) {
  const safe = filename
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return safe || "image";
}

function buildAssetUrls(encodedKey: string, cloudflareEnabled: boolean) {
  const baseUrl = `/api/images/${encodedKey}`;
  return {
    raw: baseUrl,
    content: cloudflareEnabled ? `${baseUrl}?w=1600&q=85&format=webp` : baseUrl,
    thumb: cloudflareEnabled ? `${baseUrl}?w=960&q=82&format=webp` : baseUrl,
    cover: cloudflareEnabled ? `${baseUrl}?w=1600&h=900&fit=cover&q=84&format=webp` : baseUrl,
  };
}

function getNowPrefix() {
  const now = new Date();
  return {
    yyyy: now.getUTCFullYear(),
    mm: String(now.getUTCMonth() + 1).padStart(2, "0"),
  };
}

async function resolveImageAction(db: D1Database, action: string) {
  if (action === "custom") return null;
  const row = await db
    .prepare(`
    SELECT action_key, label, prompt, aspect_ratio, resolution, size, quality, profile_id
    FROM ai_image_actions
    WHERE action_key = ? AND is_enabled = 1
  `)
    .bind(action)
    .first<ResolvedImageAction>();
  if (!row) throw new Error("不支持的图片快捷提示");
  return row;
}

function resolveSelectedProfileId(
  requestedProfileId: number | null | undefined,
  action: ResolvedImageAction | null,
) {
  return Number.isFinite(requestedProfileId) && Number(requestedProfileId) > 0
    ? Number(requestedProfileId)
    : (action?.profile_id ?? undefined);
}

async function resolveImageGenerationContext(
  input: GenerateEditorImageInput,
): Promise<ImageGenerationContext> {
  await ensureAiImageConfigInfrastructure(input.db);
  const action = await resolveImageAction(input.db, input.action);
  const seeded = getDefaultImageActionSeed(action?.action_key);
  const aspectRatio = normalizeAiImageAspectRatio(
    input.aspectRatio || action?.aspect_ratio || seeded?.aspect_ratio,
  );
  const resolution = normalizeAiImageResolution(
    input.resolution || action?.resolution || seeded?.resolution,
  );
  const secret = resolveAiConfigSecret(input.env as Record<string, unknown> | undefined);
  const profile = await resolveAiImageProfileConfig(
    input.db,
    secret,
    resolveSelectedProfileId(input.profileId, action),
  );
  if (!profile) throw new Error("请先在后台配置图片模型");

  return {
    action,
    seeded,
    aspectRatio,
    resolution,
    profile,
    finalPrompt: buildFinalImagePrompt({
      actionPrompt: input.actionPrompt || action?.prompt,
      userPrompt: input.userPrompt,
      articleTitle: input.articleTitle,
      contextText: input.contextText,
      aspectRatio,
      resolution,
    }),
    referenceImageUrl:
      typeof input.referenceImageUrl === "string" ? input.referenceImageUrl.trim() : "",
  };
}

async function generateWorkersImagePayload(
  context: ImageGenerationContext,
): Promise<GeneratedImagePayload> {
  if (context.referenceImageUrl) {
    throw new Error("当前图片模型通道暂不支持参考图生成，请切换到 OpenAI 兼容图片模型");
  }
  const { width, height } = resolveWorkersAiImageSize(context.aspectRatio, context.resolution);
  const rawResult = await runWorkersAiCompatImageRequest(
    {
      apiKey: context.profile.api_key,
      baseURL: context.profile.base_url,
      model: context.profile.model,
    },
    { prompt: context.finalPrompt, width, height },
  );
  const asset = await extractWorkersAiImageAsset(rawResult, context.profile.model);
  return {
    bytes: await workersAssetToBytes(asset.data),
    contentType: asset.contentType,
    extension: asset.extension,
    revisedPrompt: context.finalPrompt,
  };
}

async function generateCompatibleImagePayload(
  context: ImageGenerationContext,
): Promise<GeneratedImagePayload> {
  const size = resolveRequestedSize(
    context.aspectRatio,
    context.action?.size || context.seeded?.size,
  );
  const quality = resolveRequestedQuality(
    context.resolution,
    context.action?.quality || context.seeded?.quality,
  );
  return requestOpenAiCompatibleImage(
    {
      apiKey: context.profile.api_key,
      baseURL: context.profile.base_url,
      providerType: context.profile.provider_type,
      model: context.profile.model,
    },
    {
      prompt: context.finalPrompt,
      size,
      quality,
      referenceImageUrl: context.referenceImageUrl || undefined,
    },
  );
}

function usesWorkersAi(profile: ResolvedImageProfile) {
  return profile.provider === "workers_ai" || isWorkersAiBaseUrl(profile.base_url);
}

async function generateImagePayload(context: ImageGenerationContext) {
  return usesWorkersAi(context.profile)
    ? generateWorkersImagePayload(context)
    : generateCompatibleImagePayload(context);
}

async function storeGeneratedImage(
  input: GenerateEditorImageInput,
  context: ImageGenerationContext,
  payload: GeneratedImagePayload,
): Promise<GeneratedEditorImage> {
  const actionLabel = input.actionLabel || context.action?.label || "自定义生成";
  const alt = buildAltText(payload.revisedPrompt, input.userPrompt, input.articleTitle, actionLabel);
  const { yyyy, mm } = getNowPrefix();
  const baseName = sanitizeFilename(alt).slice(0, 48);
  const key = `image/${yyyy}/${mm}/ai-${nanoid(10)}-${baseName}.${payload.extension}`;
  await input.images.put(key, payload.bytes, {
    httpMetadata: {
      contentType: payload.contentType,
      cacheControl: "public, max-age=31536000, immutable",
    },
    customMetadata: { originalName: `${baseName}.${payload.extension}`, source: "ai-image" },
  });
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return {
    key,
    url: `/api/images/${encodedKey}`,
    variants: buildAssetUrls(encodedKey, readFlag(input.env?.ENABLE_CF_IMAGE_PIPELINE)),
    prompt: context.finalPrompt,
    revisedPrompt: payload.revisedPrompt,
    alt,
    actionLabel,
    aspectRatio: context.aspectRatio,
    resolution: context.resolution,
    size: resolveRequestedSize(context.aspectRatio, context.action?.size || context.seeded?.size),
    profileName: context.profile.name,
    model: context.profile.model,
  };
}

export async function generateEditorImage(
  input: GenerateEditorImageInput,
): Promise<GeneratedEditorImage> {
  const context = await resolveImageGenerationContext(input);
  return storeGeneratedImage(input, context, await generateImagePayload(context));
}
