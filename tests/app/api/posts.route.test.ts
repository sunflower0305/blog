import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPost: vi.fn(),
  updatePostBySlug: vi.fn(),
  ensureAuthenticatedRequest: vi.fn(),
  getRouteContextWithDb: vi.fn(),
  readJsonBody: vi.fn(),
  invalidatePublicContentCache: vi.fn(),
  enqueueBackgroundJob: vi.fn(),
  nanoid: vi.fn(() => "abc123"),
}));

vi.mock("@/lib/db", () => ({
  createPost: mocks.createPost,
  updatePostBySlug: mocks.updatePostBySlug,
  POST_STATUS_VALUES: ["draft", "published", "deleted"],
}));

vi.mock("@/lib/server/route-helpers", () => ({
  ensureAuthenticatedRequest: mocks.ensureAuthenticatedRequest,
  getRouteContextWithDb: mocks.getRouteContextWithDb,
  jsonError: (message: string, status = 500) => Response.json({ error: message }, { status }),
  jsonOk: (data: unknown, status = 200) => Response.json(data, { status }),
  readJsonBody: async () => ({ ok: true, body: await mocks.readJsonBody() }),
}));

vi.mock("@/lib/cache", () => ({
  invalidatePublicContentCache: mocks.invalidatePublicContentCache,
}));

vi.mock("@/lib/background-jobs", () => ({
  enqueueBackgroundJob: mocks.enqueueBackgroundJob,
}));

vi.mock("nanoid", () => ({
  nanoid: mocks.nanoid,
}));

import { PATCH, POST } from "@/app/api/posts/route";

describe("/api/posts route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRouteContextWithDb.mockResolvedValue({
      ok: true,
      env: { AI_QUEUE: {} },
      db: { kind: "db" },
      ctx: { waitUntil: vi.fn() },
    });
    mocks.ensureAuthenticatedRequest.mockResolvedValue(null);
    mocks.invalidatePublicContentCache.mockResolvedValue(undefined);
    mocks.enqueueBackgroundJob.mockResolvedValue(undefined);
  });

  it("creates a post with normalized payload fields and enqueues follow-up jobs", async () => {
    mocks.readJsonBody.mockResolvedValue({
      title: "  Ask AI 标题  ",
      content: "  正文内容  ",
      html: "<p>正文</p>",
      category: "  AI  ",
      tags: [
        " AI ",
        "",
        "提示词",
        "编辑器",
        "产品",
        "设计",
        "测试",
        "额外",
        "更多",
        "仍然",
        "超出",
      ],
      description: "",
      cover_image: " /covers/test.webp ",
      slug: "custom_slug",
      status: "draft",
      password: " secret ",
      is_hidden: 1,
    });
    mocks.createPost.mockResolvedValue(42);

    const response = await POST({} as never);
    const body = await response.json();

    expect(mocks.createPost).toHaveBeenCalledWith(
      { kind: "db" },
      expect.objectContaining({
        slug: "custom_slug",
        title: "Ask AI 标题",
        content: "正文内容",
        html: "<p>正文</p>",
        category: "AI",
        status: "draft",
        password: "secret",
        is_hidden: 1,
        description: "正文内容",
        tags: ["AI", "提示词", "编辑器", "产品", "设计", "测试", "额外", "更多", "仍然", "超出"],
        cover_image: "/covers/test.webp",
      }),
    );
    expect(mocks.invalidatePublicContentCache).toHaveBeenCalled();
    expect(mocks.enqueueBackgroundJob).toHaveBeenCalledTimes(2);
    expect(body).toEqual(
      expect.objectContaining({
        success: true,
        id: 42,
        slug: "custom_slug",
        category: "AI",
      }),
    );
  });

  it("patches a post with fallback description and normalized next slug", async () => {
    mocks.readJsonBody.mockResolvedValue({
      current_slug: "old-slug",
      new_slug: "new_slug",
      title: "  新标题  ",
      content: "  新正文  ",
      description: "   ",
      status: "draft",
      cover_image: "/covers/next.webp",
    });

    const response = await PATCH({} as never);
    const body = await response.json();

    expect(mocks.updatePostBySlug).toHaveBeenCalledWith(
      { kind: "db" },
      "old-slug",
      expect.objectContaining({
        slug: "new_slug",
        title: "  新标题  ",
        content: "  新正文  ",
        description: "新正文",
        status: "draft",
        cover_image: "/covers/next.webp",
      }),
    );
    expect(body).toEqual({ success: true, slug: "new_slug" });
  });

  it("coerces a non-array tags payload to [] before it reaches updatePostBySlug", async () => {
    mocks.readJsonBody.mockResolvedValue({
      current_slug: "old-slug",
      tags: "notanarray",
    });

    await PATCH({} as never);

    const [, , updates] = mocks.updatePostBySlug.mock.calls[0];
    expect(updates.tags).toEqual([]);
  });

  it("trims and filters a valid tags array on the patch path", async () => {
    mocks.readJsonBody.mockResolvedValue({
      current_slug: "old-slug",
      tags: [" a ", "", "b", 3, null],
    });

    await PATCH({} as never);

    const [, , updates] = mocks.updatePostBySlug.mock.calls[0];
    expect(updates.tags).toEqual(["a", "b"]);
  });

  it("returns success without writing or invalidating cache when a patch has no updates", async () => {
    mocks.readJsonBody.mockResolvedValue({ current_slug: "same-slug" });

    const response = await PATCH({} as never);

    await expect(response.json()).resolves.toEqual({ success: true, slug: "same-slug" });
    expect(mocks.updatePostBySlug).not.toHaveBeenCalled();
    expect(mocks.invalidatePublicContentCache).not.toHaveBeenCalled();
  });

  it("does not fall back to slug when current_slug is explicitly empty", async () => {
    mocks.readJsonBody.mockResolvedValue({ current_slug: "", slug: "fallback-slug" });

    const response = await PATCH({} as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "slug 不能为空" });
    expect(mocks.updatePostBySlug).not.toHaveBeenCalled();
  });

  it("maps duplicate post slugs to a conflict response", async () => {
    mocks.readJsonBody.mockResolvedValue({
      title: "Title",
      content: "Content",
      html: "<p>Content</p>",
      slug: "duplicate",
    });
    mocks.createPost.mockRejectedValue(new Error("UNIQUE constraint failed: posts.slug"));

    const response = await POST({} as never);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "slug 已存在，请换一个" });
  });
});
