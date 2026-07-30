import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getAppCloudflareEnv: vi.fn(),
  ensureInfrastructure: vi.fn(),
  decryptApiKey: vi.fn(),
  fetchModels: vi.fn(),
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
vi.mock("@/lib/workers-ai-models", () => ({
  extractCloudflareAccountId: (url: string) => url.match(/accounts\/([^/]+)/)?.[1] || "",
  fetchWorkersAiModels: mocks.fetchModels,
}));

import { GET } from "@/app/api/admin/workers-ai-models/route";

function db(profile: unknown) {
  return {
    prepare: () => ({
      first: async () => profile,
      bind: () => ({ first: async () => profile }),
    }),
  };
}

function request(query = "") {
  return new Request(`https://example.com/api/admin/workers-ai-models${query}`) as never;
}

const profile = {
  id: 3,
  provider: "workers_ai",
  base_url: "https://api.cloudflare.com/client/v4/accounts/account-1/ai/v1",
  api_key_encrypted: "encrypted",
  is_default: 1,
};

describe("/api/admin/workers-ai-models route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateRequest.mockResolvedValue(true);
    mocks.ensureInfrastructure.mockResolvedValue(undefined);
    mocks.decryptApiKey.mockResolvedValue("token");
    mocks.fetchModels.mockResolvedValue([{ id: "model", name: "model" }]);
    mocks.getAppCloudflareEnv.mockResolvedValue({ DB: db(profile) });
  });

  it("loads text and image models from Workers AI", async () => {
    for (const query of ["?profile_id=3", "?kind=image"]) {
      const response = await GET(request(query));
      expect(await response.json()).toEqual({
        models: [{ id: "model", name: "model" }],
        source: "provider",
      });
    }
  });

  it("falls back when credentials or provider results are absent", async () => {
    mocks.getAppCloudflareEnv.mockResolvedValueOnce({ DB: db(null) });
    const missing = await GET(request());
    expect(await missing.json()).toEqual(expect.objectContaining({ source: "preset" }));

    mocks.fetchModels.mockResolvedValueOnce([]);
    const empty = await GET(request());
    expect(await empty.json()).toEqual(
      expect.objectContaining({ source: "preset", warning: expect.stringContaining("返回为空") }),
    );
  });

  it("falls back on provider failures", async () => {
    mocks.fetchModels.mockRejectedValueOnce(new Error("rate limited"));
    const response = await GET(request());
    expect(await response.json()).toEqual(
      expect.objectContaining({
        source: "preset",
        warning: expect.stringContaining("rate limited"),
      }),
    );
  });
});
