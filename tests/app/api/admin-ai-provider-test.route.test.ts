import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getAppCloudflareEnv: vi.fn(),
  ensureInfrastructure: vi.fn(),
  decryptApiKey: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ authenticateRequest: mocks.authenticateRequest }));
vi.mock("@/lib/cloudflare", () => ({ getAppCloudflareEnv: mocks.getAppCloudflareEnv }));
vi.mock("@/lib/ai-provider-profiles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-provider-profiles")>();
  return {
    ...actual,
    ensureAiConfigInfrastructure: mocks.ensureInfrastructure,
    decryptApiKey: mocks.decryptApiKey,
    resolveAiConfigSecret: () => "secret",
  };
});

import { POST } from "@/app/api/admin/ai-provider/test/route";

function db(profile: unknown = null) {
  return {
    prepare: () => ({
      bind: () => ({ first: async () => profile }),
    }),
  };
}

function request(body: unknown) {
  return new Request("https://example.com/api/admin/ai-provider/test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  }) as never;
}

describe("/api/admin/ai-provider/test route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.authenticateRequest.mockResolvedValue(true);
    mocks.ensureInfrastructure.mockResolvedValue(undefined);
    mocks.decryptApiKey.mockResolvedValue("stored-key");
    mocks.getAppCloudflareEnv.mockResolvedValue({ DB: db() });
  });

  it("tests an OpenAI-compatible endpoint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const response = await POST(
      request({ base_url: "https://api.test/v1", api_key: "key", model: "model" }),
    );
    expect(await response.json()).toEqual({
      success: true,
      latency_ms: expect.any(Number),
      model: "model",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.test/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses the Gemini endpoint shape", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const response = await POST(
      request({
        base_url: "https://generativelanguage.googleapis.com",
        api_key: "key",
        model: "gemini-test",
      }),
    );
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/models/gemini-test:generateContent?key=key"),
      expect.any(Object),
    );
  });

  it("loads a stored profile and exposes detailed provider errors", async () => {
    mocks.getAppCloudflareEnv.mockResolvedValue({
      DB: db({
        base_url: "https://api.test/v1",
        model: "stored-model",
        api_key_encrypted: "encrypted",
      }),
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: "denied",
            code: "401",
            metadata: { raw: "bad token", provider_name: "upstream" },
          },
        }),
        { status: 401, statusText: "Unauthorized" },
      ),
    );
    const response = await POST(request({ profile_id: 7 }));
    expect(await response.json()).toEqual({
      success: false,
      error: "denied · 详情: bad token · Provider: upstream · Code: 401",
    });
  });

  it("reports missing and undecryptable credentials", async () => {
    expect((await POST(request({ model: "m" }))).status).toBe(400);
    mocks.decryptApiKey.mockResolvedValueOnce("");
    mocks.getAppCloudflareEnv.mockResolvedValueOnce({
      DB: db({ base_url: "https://api.test/v1", model: "m", api_key_encrypted: "encrypted" }),
    });
    expect(await (await POST(request({ profile_id: 7 }))).json()).toEqual(
      expect.objectContaining({ success: false, error: expect.stringContaining("无法解密") }),
    );
  });

  it("turns network failures into a stable response", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    expect(
      await (
        await POST(request({ base_url: "https://api.test", api_key: "key", model: "m" }))
      ).json(),
    ).toEqual({ success: false, error: "offline" });
  });
});
