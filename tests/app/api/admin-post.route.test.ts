import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPostBySlug: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
  isAdminAuthenticated: vi.fn(),
  invalidatePublicContentCache: vi.fn(),
  enqueueBackgroundJob: vi.fn(),
  getRouteContextWithDb: vi.fn(),
  readJsonBody: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  deletePost: mocks.deletePost,
  getPostBySlug: mocks.getPostBySlug,
  updatePost: mocks.updatePost,
  POST_STATUS_VALUES: ["draft", "published", "deleted"],
}));

vi.mock("@/lib/admin-auth", () => ({
  COOKIE_NAME: "blog_admin",
  isAdminAuthenticated: mocks.isAdminAuthenticated,
}));

vi.mock("@/lib/cache", () => ({
  invalidatePublicContentCache: mocks.invalidatePublicContentCache,
}));

vi.mock("@/lib/background-jobs", () => ({
  enqueueBackgroundJob: mocks.enqueueBackgroundJob,
}));

vi.mock("@/lib/server/route-helpers", () => ({
  getRouteContextWithDb: mocks.getRouteContextWithDb,
  jsonError: (message: string, status = 500) => Response.json({ error: message }, { status }),
  jsonOk: (data: unknown, status = 200) => Response.json(data, { status }),
  readJsonBody: async () => ({ ok: true, body: await mocks.readJsonBody() }),
}));

import { PUT } from "@/app/api/admin/posts/[slug]/route";

describe("/api/admin/posts/[slug] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdminAuthenticated.mockResolvedValue(true);
    mocks.getRouteContextWithDb.mockResolvedValue({
      ok: true,
      env: { CACHE: {} },
      db: { kind: "db" },
      ctx: { waitUntil: vi.fn() },
    });
    mocks.getPostBySlug.mockResolvedValue({
      id: 7,
      slug: "old-slug",
      content: "已有正文",
      description: "已有摘要",
    });
    mocks.readJsonBody.mockResolvedValue({
      slug: "next_slug",
      title: "文章标题",
      content: "更新后的正文",
      html: "<p>更新后的正文</p>",
      description: "   ",
      tags: ["AI", "写作"],
      cover_image: "/covers/admin.webp",
    });
    mocks.invalidatePublicContentCache.mockRejectedValue(new Error("cache down"));
    mocks.enqueueBackgroundJob.mockResolvedValue(undefined);
  });

  it("updates a post, falls back description, and tolerates cache invalidation failures", async () => {
    const request = {
      cookies: {
        get: vi.fn(() => ({ value: "token" })),
      },
    } as never;

    const response = await PUT(request, {
      params: Promise.resolve({ slug: "old-slug" }),
    });
    const body = await response.json();

    expect(mocks.updatePost).toHaveBeenCalledWith(
      { kind: "db" },
      7,
      expect.objectContaining({
        slug: "next_slug",
        title: "文章标题",
        content: "更新后的正文",
        description: "更新后的正文",
        tags: ["AI", "写作"],
        cover_image: "/covers/admin.webp",
      }),
    );
    expect(mocks.enqueueBackgroundJob).toHaveBeenCalledTimes(1);
    expect(body).toEqual({ success: true, slug: "next_slug" });
  });

  it("preserves the description when a partial update only changes publication status", async () => {
    mocks.readJsonBody.mockResolvedValue({ status: "published" });

    const request = {
      cookies: {
        get: vi.fn(() => ({ value: "token" })),
      },
    } as never;

    const response = await PUT(request, {
      params: Promise.resolve({ slug: "old-slug" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.updatePost).toHaveBeenCalledWith(
      { kind: "db" },
      7,
      expect.objectContaining({
        status: "published",
        description: undefined,
      }),
    );
  });

  it("coerces illegal status/bit/tags fields before they reach updatePost", async () => {
    mocks.readJsonBody.mockResolvedValue({
      title: "标题",
      status: "not-a-status",
      is_pinned: "yes",
      is_hidden: 1,
      tags: "notanarray",
    });

    const request = {
      cookies: { get: vi.fn(() => ({ value: "token" })) },
    } as never;

    await PUT(request, { params: Promise.resolve({ slug: "old-slug" }) });

    const [, , data] = mocks.updatePost.mock.calls[0];
    // illegal enum → dropped (undefined) so the column is left untouched
    expect(data.status).toBeUndefined();
    // "yes" is not 1/true → 0; a real 1 stays 1
    expect(data.is_pinned).toBe(0);
    expect(data.is_hidden).toBe(1);
    // non-array tags become [] instead of a raw string reaching JSON.stringify
    expect(data.tags).toEqual([]);
  });

  it("leaves omitted bit/tags fields undefined so a partial update skips them", async () => {
    mocks.readJsonBody.mockResolvedValue({ title: "只改标题" });

    const request = {
      cookies: { get: vi.fn(() => ({ value: "token" })) },
    } as never;

    await PUT(request, { params: Promise.resolve({ slug: "old-slug" }) });

    const [, , data] = mocks.updatePost.mock.calls[0];
    expect(data.is_pinned).toBeUndefined();
    expect(data.is_hidden).toBeUndefined();
    expect(data.tags).toBeUndefined();
    expect(data.status).toBeUndefined();
  });
});
