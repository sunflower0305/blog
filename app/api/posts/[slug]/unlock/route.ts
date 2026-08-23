import { getPostBySlug, isPubliclyAccessiblePost } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { getRenderedPostHtml } from "@/lib/post-render";
import { getRouteContextWithDb, jsonError, jsonOk, readJsonBody } from "@/lib/server/route-helpers";
import type { NextRequest } from "next/server";

type Ctx = { params: Promise<{ slug: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const parsed = await readJsonBody<{ password?: string }>(req);
  if (!parsed.ok) return parsed.response;

  const password = parsed.body.password?.trim();
  if (!password) return jsonError("请输入密码", 400);

  const { slug } = await params;
  const route = await getRouteContextWithDb("DB not configured");
  if (!route.ok) return route.response;

  const post = await getPostBySlug(route.db, slug).catch(() => null);
  if (!post || !isPubliclyAccessiblePost(post) || !post.password) {
    return jsonError("文章不存在", 404);
  }
  if (!(await verifyPassword(password, post.password))) {
    return jsonError("密码错误，请重试", 401);
  }

  const rendered = await getRenderedPostHtml(route.env, post);
  const response = jsonOk({
    slug: post.slug,
    title: post.title,
    category: post.category,
    publishedAt: post.published_at,
    viewCount: post.view_count,
    html: rendered.html,
    headings: rendered.headings,
  });
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
}
