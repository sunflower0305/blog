import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getAppCloudflareEnv: vi.fn(),
  ensureAiConfigInfrastructure: vi.fn(),
  decryptApiKey: vi.fn(),
  fetchWorkersAiModels: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({
  authenticateRequest: mocks.authenticateRequest,
}));

vi.mock("@/lib/cloudflare", () => ({
  getAppCloudflareEnv: mocks.getAppCloudflareEnv,
}));

vi.mock("@/lib/ai-provider-profiles", () => ({
  decryptApiKey: mocks.decryptApiKey,
  ensureAiConfigInfrastructure: mocks.ensureAiConfigInfrastructure,
  normalizeBaseUrl: (value: string) => value.replace(/\/+$/, ""),
  resolveAiConfigSecret: () => "test-secret",
}));

vi.mock("@/lib/ai-provider-presets", () => ({
  AI_PROVIDER_MAP: {
    openrouter: { quickModels: ["preset-text-model"] },
    openai: { quickModels: ["preset-text-model"] },
    workers_ai: { quickModels: ["workers-text-model"] },
  },
}));

vi.mock("@/lib/workers-ai-models", () => ({
  buildWorkersAiModelOptions: (items: Array<string | { id?: string; name?: string }>) =>
    items.map((item) => {
      const id = typeof item === "string" ? item : item.id || item.name || "";
      return { id, name: id };
    }),
  extractCloudflareAccountId: (baseUrl: string) => baseUrl.match(/accounts\/([^/]+)/)?.[1] || "",
  fetchWorkersAiModels: mocks.fetchWorkersAiModels,
}));

import { GET } from "@/app/api/admin/ai-provider/models/route";

function request(query = "") {
  return new Request(`https://example.com/api/admin/ai-provider/models${query}`) as never;
}

function createDb(profile: unknown = null) {
  const first = vi.fn(async () => profile);
  const bind = vi.fn(() => ({ first }));
  const prepare = vi.fn(() => ({ bind }));
  return { prepare, bind, first };
}

describe("/api/admin/ai-provider/models route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.authenticateRequest.mockResolvedValue(true);
    mocks.ensureAiConfigInfrastructure.mockResolvedValue(undefined);
    mocks.decryptApiKey.mockResolvedValue("");
    mocks.getAppCloudflareEnv.mockResolvedValue({ DB: createDb() });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.authenticateRequest.mockResolvedValue(false);

    const response = await GET(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("reports a missing database", async () => {
    mocks.getAppCloudflareEnv.mockResolvedValue({});

    const response = await GET(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "DB unavailable" });
  });

  it("returns preset models when a supported provider has no API key", async () => {
    const response = await GET(
      request("?provider=openai&base_url=https%3A%2F%2Fapi.openai.com%2Fv1"),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      models: Array<{ id: string; name: string }>;
      source: string;
      warning: string;
    };
    expect(body.models.length).toBeGreaterThan(0);
    expect(body.models[0]).toEqual(
      expect.objectContaining({ id: expect.any(String), name: expect.any(String) }),
    );
    expect(body.source).toBe("preset");
    expect(body.warning).toBe("未提供 API Key，返回预设模型列表");
  });

  it("normalizes a successful provider model response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: "model-b" }, { id: "model-a" }] }), {
        status: 200,
      }),
    );

    const response = await GET(
      request("?provider=custom&base_url=https%3A%2F%2Fprovider.test%2Fv1&api_key=secret"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      models: [
        { id: "model-b", name: "model-b" },
        { id: "model-a", name: "model-a" },
      ],
      source: "provider",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://provider.test/v1/models",
      expect.objectContaining({ headers: { Authorization: "Bearer secret" } }),
    );
  });

  it("returns the provider error when no preset fallback exists", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "invalid token" } }), {
        status: 401,
        statusText: "Unauthorized",
      }),
    );

    const response = await GET(
      request("?provider=custom&base_url=https%3A%2F%2Fprovider.test%2Fv1&api_key=bad"),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "获取模型列表失败：invalid token",
    });
  });
});
