import { nanoid } from "nanoid";

export interface ImageBucket {
  put: (
    key: string,
    value: File | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
      customMetadata?: Record<string, string>;
    },
  ) => Promise<void>;
  get: (key: string) => Promise<{ customMetadata?: Record<string, string> } | null>;
}

export interface UploadRuntimeEnv {
  DB?: D1Database;
  IMAGES?: ImageBucket;
  ENABLE_CF_IMAGE_PIPELINE?: string;
}

interface UploadTarget {
  key: string;
  category: string;
  cloudflareImagePipeline: boolean;
  deduplicated: boolean;
}

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const HASH_THRESHOLD = 5 * 1024 * 1024;
const KNOWN_EXTENSIONS = new Set([
  "zip",
  "rar",
  "7z",
  "epub",
  "mobi",
  "azw",
  "azw3",
  "pdf",
  "txt",
  "mp3",
  "mp4",
  "wav",
  "ogg",
  "webm",
  "mov",
  "flac",
  "aac",
]);

const ALLOWED_TYPES: Record<string, string[]> = {
  image: ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/avif"],
  audio: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/aac", "audio/flac", "audio/mp4"],
  video: ["video/mp4", "video/webm", "video/ogg", "video/quicktime"],
  document: [
    "application/pdf",
    "application/zip",
    "application/x-zip-compressed",
    "application/x-rar-compressed",
    "application/x-rar",
    "application/x-7z-compressed",
    "application/epub+zip",
    "application/x-mobipocket-ebook",
    "application/vnd.amazon.ebook",
    "text/plain",
    "application/octet-stream",
  ],
};

const ALL_ALLOWED_TYPES = new Set(Object.values(ALLOWED_TYPES).flat());
const MIME_BY_EXTENSION: Record<string, string> = {
  mov: "video/quicktime",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  pdf: "application/pdf",
  zip: "application/zip",
  rar: "application/x-rar-compressed",
  "7z": "application/x-7z-compressed",
  epub: "application/epub+zip",
  mobi: "application/x-mobipocket-ebook",
  azw: "application/vnd.amazon.ebook",
  azw3: "application/vnd.amazon.ebook",
  txt: "text/plain",
};

export function validateUploadFile(file: File): string | null {
  if (!isAllowedFile(file)) return `不支持的文件类型: ${file.type}`;
  return file.size > MAX_FILE_SIZE ? "文件不能超过 100MB" : null;
}

function isAllowedFile(file: File) {
  return (
    ALL_ALLOWED_TYPES.has(file.type) ||
    file.type.startsWith("image/") ||
    KNOWN_EXTENSIONS.has(fileExtension(file.name))
  );
}

function fileExtension(filename: string) {
  return filename.split(".").pop()?.toLowerCase() || "";
}

function getFileCategory(mimeType: string): string {
  return (
    Object.entries(ALLOWED_TYPES).find(([, types]) => types.includes(mimeType))?.[0] || "document"
  );
}

function sanitizeFilename(filename: string) {
  const safe = filename
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-");
  return safe || "file";
}

function readFlag(value: unknown): boolean {
  return (
    typeof value === "string" && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase())
  );
}

async function calculateHash(file: File): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

export async function resolveUploadTarget(
  file: File,
  bucket: ImageBucket,
  pipelineFlag: unknown,
): Promise<UploadTarget> {
  const category = getFileCategory(file.type);
  const date = new Date();
  const prefix = `${category}/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  const cloudflareImagePipeline = category === "image" && readFlag(pipelineFlag);
  if (file.size > HASH_THRESHOLD) {
    return {
      key: `${prefix}/${nanoid(10)}-${sanitizeFilename(file.name)}`,
      category,
      cloudflareImagePipeline,
      deduplicated: false,
    };
  }

  const key = `${prefix}/${await calculateHash(file)}-${sanitizeFilename(file.name)}`;
  return {
    key,
    category,
    cloudflareImagePipeline,
    deduplicated: Boolean(await bucket.get(key)),
  };
}

export function resolveUploadContentType(file: File) {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  return MIME_BY_EXTENSION[fileExtension(file.name)] || file.type;
}

export async function storeUpload(
  bucket: ImageBucket,
  target: UploadTarget,
  file: File,
  contentType: string,
) {
  await bucket.put(target.key, file, {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
    },
    customMetadata: { originalName: file.name },
  });
}

export async function recordUpload(
  db: D1Database | undefined,
  target: UploadTarget,
  file: File,
  contentType: string,
) {
  if (!db) return;
  const url = buildAssetUrl(target.key);
  await db
    .prepare(
      "INSERT OR IGNORE INTO media (key, url, filename, original_name, file_type, category, size) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      target.key,
      url,
      sanitizeFilename(file.name),
      file.name,
      contentType,
      target.category,
      file.size,
    )
    .run();
}

function encodeStorageKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

function buildAssetUrl(key: string) {
  return `/api/images/${encodeStorageKey(key)}`;
}

function buildAssetVariants(key: string, cloudflareEnabled: boolean) {
  const baseUrl = buildAssetUrl(key);
  return {
    raw: baseUrl,
    content: cloudflareEnabled ? `${baseUrl}?w=1600&q=85&format=webp` : baseUrl,
    thumb: cloudflareEnabled ? `${baseUrl}?w=960&q=82&format=webp` : baseUrl,
    cover: cloudflareEnabled ? `${baseUrl}?w=1600&h=900&fit=cover&q=84&format=webp` : baseUrl,
  };
}

export function buildUploadResponse(target: UploadTarget, file: File) {
  return {
    success: true,
    key: target.key,
    url: buildAssetUrl(target.key),
    type: target.category,
    name: file.name,
    size: file.size,
    ...(target.deduplicated ? { deduplicated: true } : {}),
    delivery: target.cloudflareImagePipeline ? "cloudflare" : "origin",
    variants:
      target.category === "image"
        ? buildAssetVariants(target.key, target.cloudflareImagePipeline)
        : undefined,
  };
}
