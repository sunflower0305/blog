import OpenAI from "openai";
import type { ImagesResponse } from "openai/resources/images";
import { normalizeBaseUrl, buildWorkersAiRunUrl } from "@/lib/ai-provider-profiles";
import { decodeBase64Image, parseImageApiErrorMessage } from "@/lib/ai-image-workers";

export interface GeneratedImagePayload {
  bytes: Uint8Array;
  contentType: string;
  extension: string;
  revisedPrompt: string;
}

interface OpenAiImageTransportConfig {
  apiKey: string;
  baseURL: string;
  providerType?: string;
  model: string;
}

export interface OpenAiImageRequest {
  prompt: string;
  size: string;
  quality: string;
  referenceImageUrl?: string;
}

function shouldRetryWithMultipartFallback(error: Error | null, providerType?: string) {
  if ((providerType || "").trim() === "openai_images") return true;
  if (!error) return false;
  const normalized = error.message.toLowerCase();
  return (
    normalized.includes("multipart") ||
    normalized.includes("form-data") ||
    normalized.includes("required properties at '/' are 'multipart'")
  );
}

function buildSdkAttempts(
  config: OpenAiImageTransportConfig,
  params: OpenAiImageRequest,
  image?: File,
): Array<Record<string, unknown>> {
  const base = image
    ? { model: config.model, prompt: params.prompt, image }
    : { model: config.model, prompt: params.prompt, n: 1 };
  return [
    {
      ...base,
      size: params.size,
      quality: params.quality,
      ...(image ? { input_fidelity: "high" } : {}),
      output_format: "webp",
      background: "auto",
    },
    { ...base, size: params.size, quality: params.quality },
    { ...base, size: params.size },
    base,
  ];
}

async function runGenerateWithFallback(
  client: OpenAI,
  config: OpenAiImageTransportConfig,
  params: OpenAiImageRequest,
): Promise<ImagesResponse> {
  let lastError: Error | null;
  try {
    return await runImageAttempts(buildSdkAttempts(config, params), (attempt) =>
      client.images.generate(attempt as never),
    );
  } catch (error) {
    lastError = error instanceof Error ? error : new Error(String(error));
  }
  if (shouldRetryWithMultipartFallback(lastError, config.providerType)) {
    return runGenerateMultipartFallback(config, params, lastError);
  }
  throw lastError || new Error("图片生成失败");
}

async function runEditWithFallback(
  client: OpenAI,
  config: OpenAiImageTransportConfig,
  params: OpenAiImageRequest,
) {
  const image = await fetchReferenceImageFile(params.referenceImageUrl || "");
  return runImageAttempts(buildSdkAttempts(config, params, image), (attempt) =>
    client.images.edit(attempt as never),
  );
}

async function runImageAttempts(
  attempts: Array<Record<string, unknown>>,
  execute: (attempt: Record<string, unknown>) => Promise<unknown>,
): Promise<ImagesResponse> {
  let lastError: Error | null = null;
  for (const attempt of attempts) {
    try {
      return (await execute(attempt)) as ImagesResponse;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError || new Error("参考图生成失败");
}

function createMultipartFields(config: OpenAiImageTransportConfig, params: OpenAiImageRequest) {
  const base = { model: config.model, prompt: params.prompt, n: "1" };
  return [
    {
      ...base,
      size: params.size,
      quality: params.quality,
      response_format: "b64_json",
      output_format: "webp",
      background: "auto",
    },
    { ...base, size: params.size, quality: params.quality, response_format: "b64_json" },
    { ...base, size: params.size, quality: params.quality },
    { ...base, size: params.size },
    base,
  ];
}

async function postMultipart(endpoint: string, apiKey: string, fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value.trim()) formData.append(key, value);
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
    signal: AbortSignal.timeout(120000),
  });
  const rawBody = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(parseImageApiErrorMessage(response.status, response.statusText, rawBody));
  }
  const parsed = rawBody ? JSON.parse(rawBody) : null;
  if (!parsed || !Array.isArray(parsed.data) || parsed.data.length === 0) {
    throw new Error("图片接口未返回结果");
  }
  return parsed as ImagesResponse;
}

async function runGenerateMultipartFallback(
  config: OpenAiImageTransportConfig,
  params: OpenAiImageRequest,
  previousError: Error | null,
) {
  const endpoint = `${normalizeBaseUrl(config.baseURL)}/images/generations`;
  let lastError = previousError;
  for (const fields of createMultipartFields(config, params)) {
    try {
      return await postMultipart(endpoint, config.apiKey, fields);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError || new Error("图片生成失败");
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

function inferExtensionFromContentType(contentType: string | null) {
  const normalized = (contentType || "").toLowerCase();
  if (normalized.includes("png")) return "png";
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("webp")) return "webp";
  return "png";
}

async function fetchReferenceImageFile(referenceImageUrl: string) {
  const response = await fetch(referenceImageUrl, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error("参考图读取失败");

  const blob = await response.blob();
  const urlFileName =
    referenceImageUrl.split("/").pop()?.split("?")[0]?.split("#")[0] || "reference-image";
  const extension = inferExtensionFromContentType(blob.type);
  const baseName = sanitizeFilename(urlFileName.replace(/\.[^.]+$/, "") || "reference-image");
  return new File([blob], `${baseName}.${extension}`, {
    type: blob.type || `image/${extension}`,
    lastModified: Date.now(),
  });
}

export async function extractGeneratedImagePayload(
  response: ImagesResponse,
): Promise<GeneratedImagePayload> {
  const payload = response.data?.[0];
  if (!payload) throw new Error("图片接口未返回结果");

  if (payload.b64_json) {
    const bytes = decodeBase64Image(payload.b64_json);
    if (bytes.length === 0) throw new Error("图片数据为空");
    return {
      bytes,
      contentType: "image/webp",
      extension: "webp",
      revisedPrompt: (payload.revised_prompt || "").trim(),
    };
  }

  if (payload.url) {
    const response = await fetch(payload.url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`拉取生成图片失败：HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "image/png";
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      contentType,
      extension: inferExtensionFromContentType(contentType),
      revisedPrompt: (payload.revised_prompt || "").trim(),
    };
  }
  throw new Error("图片接口未返回可用内容");
}

export async function requestOpenAiCompatibleImage(
  config: OpenAiImageTransportConfig,
  request: OpenAiImageRequest,
) {
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: normalizeBaseUrl(config.baseURL) });
  const response = request.referenceImageUrl
    ? await runEditWithFallback(client, config, request)
    : await runGenerateWithFallback(client, config, request);
  return extractGeneratedImagePayload(response);
}

function shouldRetryWorkersAiMultipart(error: Error | null, model: string) {
  if (model.trim().toLowerCase().includes("flux-2-dev")) return true;
  if (!error) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("multipart") ||
    message.includes("form-data") ||
    message.includes("required properties at '/' are 'multipart'")
  );
}

async function parseWorkersAiRunResponse(response: Response) {
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (contentType.startsWith("image/")) return response;

  const rawBody = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(parseImageApiErrorMessage(response.status, response.statusText, rawBody));
  }
  try {
    return rawBody ? JSON.parse(rawBody) : null;
  } catch {
    throw new Error("Workers AI 图片接口返回了无法解析的内容");
  }
}

export async function runWorkersAiCompatImageRequest(
  config: { apiKey: string; baseURL: string; model: string },
  input: { prompt: string; width: number; height: number },
) {
  const endpoint = buildWorkersAiRunUrl(config.baseURL, config.model);
  let lastError: Error | null = null;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(120000),
    });
    return await parseWorkersAiRunResponse(response);
  } catch (error) {
    lastError = error instanceof Error ? error : new Error(String(error));
  }

  if (!shouldRetryWorkersAiMultipart(lastError, config.model)) {
    throw lastError || new Error("Workers AI 图片接口请求失败");
  }
  const formData = new FormData();
  formData.append("prompt", input.prompt);
  formData.append("width", String(input.width));
  formData.append("height", String(input.height));
  return parseWorkersAiRunResponse(
    await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(120000),
    }),
  );
}
