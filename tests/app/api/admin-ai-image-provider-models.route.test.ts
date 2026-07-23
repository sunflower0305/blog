import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getAppCloudflareEnv: vi.fn(),
  ensureAiImageConfigInfrastructure: vi.fn(),
  resolveAiImageProfileConfig: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({
  authenticateRequest: mocks.authenticateRequest,
}));

vi.mock("@/lib/cloudflare", () => ({
  getAppCloudflareEnv: mocks.getAppCloudflareEnv,
}));

vi.mock("@/lib/ai-image-config", () => ({
  ensureAiImageConfigInfrastructure: mocks.ensureAiImageConfigInfrastructure,
  resolveAiImageProfileConfig: mocks.resolveAiImageProfileConfig,
}));

vi.mock("@/lib/ai-image-provider-presets", () => ({
  AI_IMAGE_PROVIDER_MAP: {
    openai: { quickModels: ["preset-image-model"] },
  },
}));

vi.mock("@/lib/ai-provider-profiles", () => ({
  normalizeBaseUrl: (value: string) => value.replace(/\/+$/, ""),
  resolveAiConfigSecret: () => "test-secret",
}));

import { GET } from "@/app/api/admin/ai-image-provider/models/route";

function request(query = "") {
  return new Request(`https://example.com/api/admin/ai-image-provider/models${query}`) as never;
}

function createDb(profile: unknown = null) {
  const first = vi.fn(async () => profile);
  const bind = vi.fn(() => ({ first }));
  const prepare = vi.fn(() => ({ bind }));
  return { prepare, bind, first };
}

describe("/api/admin/ai-image-provider/models route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.authenticateRequest.mockResolvedValue(true);
    mocks.ensureAiImageConfigInfrastructure.mockResolvedValue(undefined);
    mocks.resolveAiImageProfileConfig.mockResolvedValue(null);
    mocks.getAppCloudflareEnv.mockResolvedValue({ DB: createDb() });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.authenticateRequest.mockResolvedValue(false);

    const response = await GET(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("requires a base URL", async () => {
    const response = await GET(request("?provider=openai&api_key=secret"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "缺少 base_url 参数" });
  });

  it("returns preset models when the API key is absent", async () => {
    const response = await GET(
      request("?provider=openai&base_url=https%3A%2F%2Fapi.openai.com%2Fv1"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      models: [{ id: "preset-image-model", name: "preset-image-model" }],
      source: "preset",
      warning: "未提供 API Key，返回预设模型列表",
    });
  });

  it("deduplicates and sorts a successful provider model response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: "image-z" }, { model: "image-a" }, "image-z"] }), {
        status: 200,
      }),
    );

    const response = await GET(
      request("?provider=custom&base_url=https%3A%2F%2Fimages.test%2Fv1&api_key=secret"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      models: [
        { id: "image-a", name: "image-a" },
        { id: "image-z", name: "image-z" },
      ],
      source: "provider",
    });
  });

  it("falls back to presets when the provider rejects the request", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "rate limited" }), {
        status: 429,
        statusText: "Too Many Requests",
      }),
    );

    const response = await GET(
      request("?provider=openai&base_url=https%3A%2F%2Fapi.openai.com%2Fv1&api_key=secret"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      models: [{ id: "preset-image-model", name: "preset-image-model" }],
      source: "preset",
      warning: "接口拉取失败，已回退预设：rate limited",
    });
  });
});
