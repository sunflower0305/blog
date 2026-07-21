import { getRouteEnvWithDb, jsonError, jsonOk, readJsonBody } from "@/lib/server/route-helpers";
import { normalizePostSlug } from "@/lib/post-utils";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const parsed = await readJsonBody<{ slug?: unknown }>(req);
    if (!parsed.ok) return parsed.response;
    const { slug } = parsed.body;
    const normalizedSlug = typeof slug === "string" ? normalizePostSlug(slug) : "";

    if (!normalizedSlug || normalizedSlug !== slug) {
      return jsonError("Invalid slug", 400);
    }

    const route = await getRouteEnvWithDb("DB unavailable");
    if (!route.ok) return route.response;

    await route.db
      .prepare(`
        UPDATE posts
        SET view_count = view_count + 1
        WHERE slug = ?
          AND status = 'published'
          AND is_hidden = 0
          AND password IS NULL
          AND deleted_at IS NULL
      `)
      .bind(normalizedSlug)
      .run();

    return jsonOk({ success: true });
  } catch (error) {
    console.error("Track view error:", error);
    return jsonError("浏览量记录失败", 500);
  }
}
