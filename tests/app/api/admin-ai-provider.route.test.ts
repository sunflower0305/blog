import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getAppCloudflareEnv: vi.fn(),
  ensureInfrastructure: vi.fn(),
  ensureDefault: vi.fn(),
  encrypt: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ authenticateRequest: mocks.authenticateRequest }));
vi.mock("@/lib/cloudflare", () => ({ getAppCloudflareEnv: mocks.getAppCloudflareEnv }));
vi.mock("@/lib/ai-provider-profiles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-provider-profiles")>();
  return {
    ...actual,
    ensureAiConfigInfrastructure: mocks.ensureInfrastructure,
    ensureDefaultProfileId: mocks.ensureDefault,
    encryptApiKey: mocks.encrypt,
    resolveAiConfigSecret: () => "secret",
  };
});

import { DELETE, GET, POST, PUT } from "@/app/api/admin/ai-provider/route";

const profile = {
  id: 7,
  name: "Main",
  provider: "openai",
  provider_name: "OpenAI",
  provider_type: "openai_compatible",
  provider_category: "text",
  api_key_url: "",
  base_url: "https://api.test/v1",
  model: "gpt-test",
  temperature: 0.5,
  max_tokens: 1000,
  api_key_masked: "sk-***",
  is_default: 1,
  created_at: 1,
  updated_at: 2,
};

function createDb() {
  return {
    prepare: vi.fn((sql: string) => ({
      all: async () => ({ results: [profile] }),
      first: async () =>
        /SELECT id, api_key_masked/.test(sql)
          ? { id: 7, api_key_masked: "old-mask", is_default: 0 }
          : /SELECT id, is_default/.test(sql)
            ? { id: 7, is_default: 1 }
            : profile,
      bind: (..._values: unknown[]) => ({
        first: async () =>
          /SELECT id, api_key_masked/.test(sql)
            ? { id: 7, api_key_masked: "old-mask", is_default: 0 }
            : /SELECT id, is_default/.test(sql)
              ? { id: 7, is_default: 1 }
              : profile,
        run: async () => ({ meta: { last_row_id: 7 } }),
      }),
      run: async () => ({ meta: { last_row_id: 7 } }),
    })),
  };
}

function request(method: string, body?: unknown) {
  return new Request("https://example.com/api/admin/ai-provider", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "content-type": "application/json" },
  }) as never;
}

const validBody = {
  id: 7,
  name: " Main ",
  provider: "openai",
  base_url: "https://api.test/v1/",
  model: "gpt-test",
  temperature: 0.5,
  max_tokens: 1000,
  api_key: "sk-secret",
  is_default: true,
};

describe("/api/admin/ai-provider route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateRequest.mockResolvedValue(true);
    mocks.ensureInfrastructure.mockResolvedValue(undefined);
    mocks.ensureDefault.mockResolvedValue(7);
    mocks.encrypt.mockResolvedValue("encrypted");
    mocks.getAppCloudflareEnv.mockResolvedValue({ DB: createDb() });
  });

  it("lists profiles and reports the default", async () => {
    const response = await GET(request("GET"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ profiles: [profile], default_profile_id: 7 });
  });

  it("creates and updates a normalized profile", async () => {
    for (const invoke of [POST, PUT]) {
      const response = await invoke(request(invoke === POST ? "POST" : "PUT", validBody));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true, profile });
    }
    expect(mocks.encrypt).toHaveBeenCalledWith("sk-secret", "secret");
  });

  it("deletes an existing profile and reassigns actions", async () => {
    const response = await DELETE(request("DELETE", { id: 7 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });

  it("keeps auth and validation errors stable", async () => {
    mocks.authenticateRequest.mockResolvedValueOnce(false);
    expect((await GET(request("GET"))).status).toBe(401);
    const invalid = await POST(request("POST", { name: "" }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: "配置名称不能为空" });
  });
});
