import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/admin-auth";
import { getAppCloudflareEnv } from "@/lib/cloudflare";
import {
  buildUploadResponse,
  recordUpload,
  resolveUploadContentType,
  resolveUploadTarget,
  storeUpload,
  type UploadRuntimeEnv,
  validateUploadFile,
} from "@/lib/server/upload-service";

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

async function readUploadFile(req: NextRequest) {
  const file = (await req.formData()).get("file");
  return file instanceof File ? file : null;
}

export async function POST(req: NextRequest) {
  try {
    const env = (await getAppCloudflareEnv()) as UploadRuntimeEnv;
    if (!(await authenticateRequest(req, env?.DB))) return errorResponse("Unauthorized", 401);
    if (!env?.IMAGES) {
      return errorResponse("图片存储未配置，请用 Cloudflare preview/runtime 启动。", 500);
    }

    const file = await readUploadFile(req);
    if (!file) return errorResponse("缺少文件", 400);
    const validationError = validateUploadFile(file);
    if (validationError) return errorResponse(validationError, 400);

    const target = await resolveUploadTarget(file, env.IMAGES, env.ENABLE_CF_IMAGE_PIPELINE);
    const contentType = target.deduplicated ? file.type : resolveUploadContentType(file);
    if (!target.deduplicated) await storeUpload(env.IMAGES, target, file, contentType);
    await recordUpload(env.DB, target, file, contentType);
    return NextResponse.json(buildUploadResponse(target, file));
  } catch (error) {
    console.error("Upload error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(`文件上传失败: ${message}`, 500);
  }
}
