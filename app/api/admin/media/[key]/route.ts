import { NextRequest, NextResponse } from "next/server";
import { getAppCloudflareEnv } from "@/lib/cloudflare";
import { authenticateRequest } from "@/lib/admin-auth";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const env = await getAppCloudflareEnv();
  const isAuthenticated = await authenticateRequest(req, env?.DB);
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!env?.DB || !env?.IMAGES) {
    return NextResponse.json({ error: "Storage not available" }, { status: 500 });
  }

  // key is double-encoded in URL: decode once from route param
  const { key: encodedKey } = await params;
  const r2Key = decodeURIComponent(encodedKey);

  try {
    await env.IMAGES.delete(r2Key);
  } catch {
    // ignore R2 delete errors (file may already be gone)
  }

  await env.DB.prepare("DELETE FROM media WHERE key = ?").bind(r2Key).run();

  return NextResponse.json({ success: true });
}
