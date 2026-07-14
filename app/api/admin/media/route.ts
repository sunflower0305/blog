import { NextRequest, NextResponse } from "next/server";
import { getAppCloudflareEnv } from "@/lib/cloudflare";
import { authenticateRequest } from "@/lib/admin-auth";

const PAGE_SIZE = 24;

export async function GET(req: NextRequest) {
  const env = await getAppCloudflareEnv();
  const isAuthenticated = await authenticateRequest(req, env?.DB);
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!env?.DB) {
    return NextResponse.json({ error: "DB not available" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const q = searchParams.get("q")?.trim() ?? "";
  const category = searchParams.get("category") ?? "";

  const offset = (page - 1) * PAGE_SIZE;

  let where = "WHERE 1=1";
  const binds: unknown[] = [];

  if (q) {
    where += " AND (filename LIKE ? OR original_name LIKE ?)";
    binds.push(`%${q}%`, `%${q}%`);
  }
  if (category && category !== "all") {
    where += " AND category = ?";
    binds.push(category);
  }

  const countRow = await env.DB.prepare(`SELECT COUNT(*) as total FROM media ${where}`)
    .bind(...binds)
    .first<{ total: number }>();

  const items = await env.DB.prepare(
    `SELECT id, key, url, filename, original_name, file_type, category, size, created_at FROM media ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, PAGE_SIZE, offset)
    .all<{
      id: number;
      key: string;
      url: string;
      filename: string;
      original_name: string;
      file_type: string;
      category: string;
      size: number;
      created_at: number;
    }>();

  return NextResponse.json({
    items: items.results,
    total: countRow?.total ?? 0,
    page,
    pageSize: PAGE_SIZE,
  });
}
