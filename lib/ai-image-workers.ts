import {
  normalizeAiImageAspectRatio,
  type AIImageAspectRatio,
  type AIImageResolution,
} from "@/lib/ai-image-options";

export interface WorkersAiImageAsset {
  data: ReadableStream | Uint8Array;
  contentType: string;
  extension: string;
}

export function decodeBase64Image(input: string): Uint8Array {
  const normalized = input.trim();
  if (!normalized) return new Uint8Array();

  const BufferCtor = (
    globalThis as unknown as {
      Buffer?: { from: (input: string, encoding: string) => Uint8Array };
    }
  ).Buffer;

  if (BufferCtor) return new Uint8Array(BufferCtor.from(normalized, "base64"));

  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function parseImageApiErrorMessage(
  responseStatus: number,
  responseStatusText: string,
  rawBody: string,
) {
  try {
    if (rawBody) {
      const parsed = JSON.parse(rawBody) as {
        errors?: Array<{ message?: string }>;
        error?: { message?: string } | string;
        message?: string;
      };
      const firstError = parsed.errors?.find(
        (item) => typeof item?.message === "string" && item.message.trim(),
      );
      if (firstError?.message) return firstError.message.trim();
      if (typeof parsed.error === "object" && parsed.error?.message) {
        return parsed.error.message.trim();
      }
      if (typeof parsed.error === "string" && parsed.error.trim()) return parsed.error.trim();
      if (typeof parsed.message === "string" && parsed.message.trim()) {
        return parsed.message.trim();
      }
    }
  } catch {
    // Fall through to the raw response when a provider does not return JSON.
  }

  const fallbackRaw = rawBody.trim();
  if (fallbackRaw) return fallbackRaw.slice(0, 500);
  return `HTTP ${responseStatus}: ${responseStatusText}`;
}

export function resolveWorkersAiImageSize(
  aspectRatio: AIImageAspectRatio,
  resolution: AIImageResolution,
) {
  const sizeTier = resolution === "4k" ? 1536 : resolution === "2k" ? 1344 : 1024;
  const normalizedAspectRatio = normalizeAiImageAspectRatio(aspectRatio);
  const [ratioWidth, ratioHeight] = (
    normalizedAspectRatio === "auto" ? "16:9" : normalizedAspectRatio
  )
    .split(":")
    .map(Number);

  if (
    !Number.isFinite(ratioWidth) ||
    !Number.isFinite(ratioHeight) ||
    ratioWidth <= 0 ||
    ratioHeight <= 0
  ) {
    return { width: sizeTier, height: Math.round((sizeTier * 9) / 16) };
  }

  if (ratioWidth >= ratioHeight) {
    return {
      width: sizeTier,
      height: Math.max(512, Math.round((sizeTier * ratioHeight) / ratioWidth)),
    };
  }

  return {
    width: Math.max(512, Math.round((sizeTier * ratioWidth) / ratioHeight)),
    height: sizeTier,
  };
}

function inferImageTypeFromBytes(bytes: Uint8Array) {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { contentType: "image/png", extension: "png" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { contentType: "image/webp", extension: "webp" };
  }
  return { contentType: "image/png", extension: "png" };
}

function getDefaultWorkersImageType(model: string) {
  return /phoenix/i.test(model)
    ? { contentType: "image/jpeg", extension: "jpg" }
    : { contentType: "image/png", extension: "png" };
}

function typeFromContentType(contentType: string) {
  return {
    contentType,
    extension: contentType.includes("jpeg")
      ? "jpg"
      : contentType.includes("webp")
        ? "webp"
        : "png",
  };
}

function isReadableStreamLike(value: unknown): value is ReadableStream {
  return Boolean(value && typeof value === "object" && "getReader" in value);
}

export async function extractWorkersAiImageAsset(
  result: unknown,
  model: string,
): Promise<WorkersAiImageAsset> {
  const directAsset = extractDirectWorkersAsset(result, model);
  if (directAsset) return directAsset;
  return extractStructuredWorkersAsset(result, model);
}

function extractDirectWorkersAsset(
  result: unknown,
  model: string,
): WorkersAiImageAsset | null {
  if (result instanceof Response) {
    if (!result.body) throw new Error("Workers AI 未返回图片内容");
    const fallback = getDefaultWorkersImageType(model);
    const type = typeFromContentType(result.headers.get("content-type") || fallback.contentType);
    return { data: result.body, ...type };
  }

  if (isReadableStreamLike(result)) {
    return { data: result, ...getDefaultWorkersImageType(model) };
  }

  if (result instanceof ArrayBuffer) {
    const bytes = new Uint8Array(result);
    return { data: bytes, ...inferImageTypeFromBytes(bytes) };
  }

  if (ArrayBuffer.isView(result)) {
    const bytes = new Uint8Array(
      result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength),
    );
    return { data: bytes, ...inferImageTypeFromBytes(bytes) };
  }

  return null;
}

async function extractStructuredWorkersAsset(
  result: unknown,
  model: string,
): Promise<WorkersAiImageAsset> {
  const payload =
    result && typeof result === "object"
      ? (result as { image?: string; result?: { image?: string; url?: string }; url?: string })
      : null;
  const base64Image = payload?.image || payload?.result?.image || "";
  if (base64Image) {
    const bytes = decodeBase64Image(base64Image);
    return { data: bytes, ...inferImageTypeFromBytes(bytes) };
  }

  const remoteUrl = payload?.url || payload?.result?.url || "";
  if (remoteUrl) {
    const response = await fetch(remoteUrl, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`拉取 Workers AI 图片失败：HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const fallback = getDefaultWorkersImageType(model);
    const type = typeFromContentType(
      response.headers.get("content-type") || fallback.contentType,
    );
    return { data: bytes, ...type };
  }

  throw new Error("Workers AI 图片模型未返回可用内容");
}

export async function workersAssetToBytes(input: ReadableStream | Uint8Array) {
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(await new Response(input).arrayBuffer());
}
