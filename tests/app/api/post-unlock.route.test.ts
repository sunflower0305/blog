import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPostBySlug: vi.fn(),
  isPubliclyAccessiblePost: vi.fn(),
  verifyPassword: vi.fn(),
  getRenderedPostHtml: vi.fn(),
  getRouteContextWithDb: vi.fn(),
  readJsonBody: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getPostBySlug: mocks.getPostBySlug,
  isPubliclyAccessiblePost: mocks.isPubliclyAccessiblePost,
}));

vi.mock("@/lib/password", () => ({ verifyPassword: mocks.verifyPassword }));
vi.mock("@/lib/post-render", () => ({ getRenderedPostHtml: mocks.getRenderedPostHtml }));
vi.mock("@/lib/server/route-helpers", () => ({
  getRouteContextWithDb: mocks.getRouteContextWithDb,
  jsonError: (message: string, status = 500) => Response.json({ error: message }, { status }),
  jsonOk: (data: unknown, status = 200) => Response.json(data, { status }),
  readJsonBody: async () => ({ ok: true, body: await mocks.readJsonBody() }),
}));

import { POST } from "@/app/api/posts/[slug]/unlock/route";

describe("POST /api/posts/[slug]/unlock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readJsonBody.mockResolvedValue({ password: "secret" });
    mocks.getRouteContextWithDb.mockResolvedValue({
      ok: true,
      env: { CACHE: {} },
      db: { kind: "db" },
    });
    mocks.getPostBySlug.mockResolvedValue({
      slug: "protected-post",
      title: "加密文章",
      html: "<p>正文</p>",
      password: "stored-password",
      category: "AI",
      published_at: 123,
      updated_at: 456,
      view_count: 7,
    });
    mocks.isPubliclyAccessiblePost.mockReturnValue(true);
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getRenderedPostHtml.mockResolvedValue({
      html: '<h2 id="intro">正文</h2>',
      headings: [{ id: "intro", text: "正文", level: 2 }],
    });
  });

  it("returns rendered content only after password verification and disables caching", async () => {
    const response = await POST({} as never, {
      params: Promise.resolve({ slug: "protected-post" }),
    });
    const body = (await response.json()) as { html: string };

    expect(mocks.verifyPassword).toHaveBeenCalledWith("secret", "stored-password");
    expect(body.html).toBe('<h2 id="intro">正文</h2>');
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0, must-revalidate",
    );
  });

  it("does not render or expose content when the password is wrong", async () => {
    mocks.verifyPassword.mockResolvedValue(false);

    const response = await POST({} as never, {
      params: Promise.resolve({ slug: "protected-post" }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "密码错误，请重试" });
    expect(mocks.getRenderedPostHtml).not.toHaveBeenCalled();
  });
});
