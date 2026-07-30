import { createPost, POST_STATUS_VALUES, updatePostBySlug } from "@/lib/db";
import { invalidatePublicContentCache } from "@/lib/cache";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { nanoid } from "nanoid";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";
import { buildAutoDescription, normalizePostSlug } from "@/lib/post-utils";
import {
  ensureAuthenticatedRequest,
  getRouteContextWithDb,
  jsonError,
  jsonOk,
  readJsonBody,
} from "@/lib/server/route-helpers";
import { asOptionalEnum, asStringArray } from "@/lib/server/input-coerce";
import type { NextRequest } from "next/server";

type PostPayload = Record<string, unknown>;

interface CreatePostPayload {
  title: string;
  content: string;
  rawHtml: string;
  category: string;
  customSlug: string;
  status: "draft" | "published";
  password: string | null;
  isHidden: number;
  description: string;
  tags: string[];
  coverImage: string | null;
}

function trimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildCreatePostPayload(payload: PostPayload): CreatePostPayload {
  const content = trimmedString(payload.content);
  return {
    title: trimmedString(payload.title),
    content,
    rawHtml: trimmedString(payload.html),
    category: trimmedString(payload.category),
    customSlug: typeof payload.slug === "string" ? normalizePostSlug(payload.slug) : "",
    status: payload.status === "draft" ? "draft" : "published",
    password: trimmedString(payload.password) || null,
    isHidden: payload.is_hidden === 1 ? 1 : 0,
    description: trimmedString(payload.description) || buildAutoDescription(content),
    tags: asStringArray(payload.tags),
    coverImage: trimmedString(payload.cover_image) || null,
  };
}

function createPostSlug(customSlug: string) {
  if (customSlug) return customSlug;
  const date = new Date().toISOString().split("T")[0];
  return `${date}-${nanoid(6)}`;
}

async function renderPostHtml(rawHtml: string, content: string) {
  if (rawHtml) return rawHtml;
  return (
    await remark().use(remarkGfm).use(remarkHtml, { sanitize: false }).process(content)
  ).toString();
}

function resolvePatchSlugs(payload: PostPayload) {
  const currentSlug =
    typeof payload.current_slug === "string"
      ? payload.current_slug.trim()
      : trimmedString(payload.slug);
  const nextSlug = typeof payload.new_slug === "string" ? normalizePostSlug(payload.new_slug) : "";
  return { currentSlug, nextSlug };
}

function buildPostUpdates(payload: PostPayload, currentSlug: string, nextSlug: string) {
  const updates: Record<string, unknown> = {};
  if (nextSlug && nextSlug !== currentSlug) updates.slug = nextSlug;
  if (payload.title !== undefined) updates.title = payload.title;
  if (payload.content !== undefined) updates.content = payload.content;
  if (payload.html !== undefined) updates.html = payload.html;
  if (payload.description !== undefined) {
    const rawDescription = trimmedString(payload.description);
    const rawContent = typeof payload.content === "string" ? payload.content : "";
    updates.description = rawDescription || buildAutoDescription(rawContent);
  }
  if (payload.category !== undefined) updates.category = payload.category;
  if (payload.tags !== undefined) updates.tags = asStringArray(payload.tags);
  if (payload.cover_image !== undefined) updates.cover_image = payload.cover_image;

  const status = asOptionalEnum(payload.status, POST_STATUS_VALUES);
  if (status !== undefined) updates.status = status;
  return updates;
}

function postWriteError(error: unknown, action: "Save" | "Auto-save") {
  if (error instanceof Error && /UNIQUE constraint failed: posts\.slug/i.test(error.message)) {
    return jsonError("slug 已存在，请换一个", 409);
  }
  console.error(`${action} error:`, error);
  const message = action === "Save" ? "保存失败: " : "自动保存失败: ";
  return jsonError(message + (error as Error).message, 500);
}

export async function POST(req: NextRequest) {
  try {
    const route = await getRouteContextWithDb("数据库未配置");
    if (!route.ok) return route.response;
    const { env, db, ctx } = route;

    // 2. 统一认证：Cookie OR Bearer Token
    const authError = await ensureAuthenticatedRequest(req, db);
    if (authError) return authError;

    const parsed = await readJsonBody<PostPayload>(req);
    if (!parsed.ok) return parsed.response;
    const payload = buildCreatePostPayload(parsed.body);
    if (!payload.title || !payload.content) {
      return jsonError("标题和内容不能为空", 400);
    }

    const slug = createPostSlug(payload.customSlug);
    const htmlContent = await renderPostHtml(payload.rawHtml, payload.content);

    // 4. 立即保存到 D1（不等 AI）
    const postId = await createPost(db, {
      slug,
      title: payload.title,
      content: payload.content,
      html: htmlContent,
      description: payload.description,
      category: payload.category || "未分类",
      tags: payload.tags,
      status: payload.status,
      password: payload.password,
      is_hidden: payload.isHidden,
      cover_image: payload.coverImage,
    });

    // 6. 清除缓存
    await invalidatePublicContentCache(env);

    await enqueueBackgroundJob(
      env,
      {
        type: "process-post-ai",
        postId,
      },
      {
        waitUntil: ctx?.waitUntil.bind(ctx),
      },
    );

    await enqueueBackgroundJob(
      env,
      {
        type: "sync-post-related-index",
        postId,
      },
      {
        waitUntil: ctx?.waitUntil.bind(ctx),
      },
    );

    return jsonOk({
      success: true,
      slug,
      id: postId,
      category: payload.category || "未分类",
      tags: payload.tags,
      description: payload.description,
      cover_image: payload.coverImage,
    });
  } catch (error) {
    return postWriteError(error, "Save");
  }
}

// PATCH: 自动保存（只更新变化的字段）
export async function PATCH(req: NextRequest) {
  try {
    const route = await getRouteContextWithDb("数据库未配置");
    if (!route.ok) return route.response;
    const { env, db } = route;

    const authError = await ensureAuthenticatedRequest(req, db);
    if (authError) return authError;

    const parsed = await readJsonBody<PostPayload>(req);
    if (!parsed.ok) return parsed.response;
    const payload = parsed.body;
    const { currentSlug, nextSlug } = resolvePatchSlugs(payload);

    if (!currentSlug) {
      return jsonError("slug 不能为空", 400);
    }

    const updates = buildPostUpdates(payload, currentSlug, nextSlug);
    if (Object.keys(updates).length === 0) {
      return jsonOk({ success: true, slug: currentSlug });
    }

    await updatePostBySlug(db, currentSlug, updates);

    // 清除缓存
    await invalidatePublicContentCache(env);

    return jsonOk({ success: true, slug: nextSlug || currentSlug });
  } catch (error) {
    return postWriteError(error, "Auto-save");
  }
}
