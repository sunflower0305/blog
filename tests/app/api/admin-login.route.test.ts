import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminAuthConfigError: vi.fn(),
  getSessionToken: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({
  COOKIE_NAME: "blog_admin",
  COOKIE_MAX_AGE: 60 * 60 * 24 * 30,
  getAdminAuthConfigError: mocks.getAdminAuthConfigError,
  getSessionToken: mocks.getSessionToken,
  verifyPassword: mocks.verifyPassword,
}));

import { POST } from "@/app/api/admin/login/route";

function jsonRequest(body: unknown) {
  return {
    json: async () => body,
  } as never;
}

function malformedRequest() {
  return {
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON");
    },
  } as never;
}

describe("/api/admin/login route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminAuthConfigError.mockResolvedValue(null);
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getSessionToken.mockResolvedValue("session-token");
  });

  it("returns 503 before reading the request when admin auth is not configured", async () => {
    mocks.getAdminAuthConfigError.mockResolvedValue(
      "管理员鉴权未配置完成：缺少 ADMIN_PASSWORD、ADMIN_TOKEN_SALT",
    );
    const request = jsonRequest({ password: "correct" });

    const response = await POST(request);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "管理员鉴权未配置完成：缺少 ADMIN_PASSWORD、ADMIN_TOKEN_SALT",
    });
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
    expect(mocks.getSessionToken).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await POST(malformedRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "请求格式错误" });
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
    expect(mocks.getSessionToken).not.toHaveBeenCalled();
  });

  it("rejects an empty password without invoking password verification", async () => {
    const response = await POST(jsonRequest({ password: "" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "密码错误" });
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
    expect(mocks.getSessionToken).not.toHaveBeenCalled();
  });

  it("returns 401 for an incorrect password", async () => {
    mocks.verifyPassword.mockResolvedValue(false);

    const response = await POST(jsonRequest({ password: "wrong" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "密码错误" });
    expect(mocks.verifyPassword).toHaveBeenCalledWith("wrong");
    expect(mocks.getSessionToken).not.toHaveBeenCalled();
  });

  it("returns 503 when a valid password cannot produce a session token", async () => {
    mocks.getSessionToken.mockResolvedValue("");

    const response = await POST(jsonRequest({ password: "correct" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "管理员鉴权初始化失败，请检查环境变量配置",
    });
  });

  it("sets the hardened admin session cookie after a successful login", async () => {
    const response = await POST(jsonRequest({ password: "correct" }));
    const setCookie = response.headers.get("set-cookie");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.verifyPassword).toHaveBeenCalledWith("correct");
    expect(mocks.getSessionToken).toHaveBeenCalledOnce();
    expect(setCookie).toContain("blog_admin=session-token");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=2592000");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=lax");
  });
});
