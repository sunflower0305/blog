import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAppCloudflareEnv: vi.fn(),
  isAdminAuthenticated: vi.fn(),
  generateApiToken: vi.fn(() => "blog_generated"),
  run: vi.fn(),
}));

vi.mock("@/lib/cloudflare", () => ({
  getAppCloudflareEnv: mocks.getAppCloudflareEnv,
}));

vi.mock("@/lib/admin-auth", () => ({
  COOKIE_NAME: "blog_admin",
  isAdminAuthenticated: mocks.isAdminAuthenticated,
  generateApiToken: mocks.generateApiToken,
}));

import { POST, DELETE } from "@/app/api/admin/tokens/route";

function makeDb() {
  return {
    prepare: () => ({
      run: () => mocks.run(),
      bind: () => ({ run: () => mocks.run() }),
      all: async () => ({ results: [] }),
    }),
  };
}

// A request whose body is not valid JSON — .json() rejects like the platform does.
function malformedRequest() {
  return {
    cookies: { get: () => ({ value: "token" }) },
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON");
    },
  } as never;
}

function jsonRequest(body: unknown) {
  return {
    cookies: { get: () => ({ value: "token" }) },
    json: async () => body,
  } as never;
}

describe("/api/admin/tokens — malformed body handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAppCloudflareEnv.mockResolvedValue({ DB: makeDb() });
    mocks.isAdminAuthenticated.mockResolvedValue(true);
    mocks.run.mockResolvedValue({ success: true });
  });

  it("POST returns 400 (not 500) when the body is not valid JSON", async () => {
    const response = await POST(malformedRequest());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "请求体不是有效 JSON" });
    // No token was generated — parsing bailed out before the INSERT.
    expect(mocks.generateApiToken).not.toHaveBeenCalled();
  });

  it("DELETE returns 400 (not 500) when the body is not valid JSON", async () => {
    const response = await DELETE(malformedRequest());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "请求体不是有效 JSON" });
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("POST still creates a token on a valid body", async () => {
    const response = await POST(jsonRequest({ name: "my token" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      token: "blog_generated",
      name: "my token",
    });
  });
});
