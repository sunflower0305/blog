import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getAppCloudflareEnv: vi.fn(),
  ensureInfrastructure: vi.fn(),
  ensureDefault: vi.fn(),
  saveKey: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ authenticateRequest: mocks.authenticateRequest }));
vi.mock("@/lib/cloudflare", () => ({ getAppCloudflareEnv: mocks.getAppCloudflareEnv }));
vi.mock("@/lib/ai-image-config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-image-config")>();
  return {
    ...actual,
    ensureAiImageConfigInfrastructure: mocks.ensureInfrastructure,
    ensureDefaultImageProfileId: mocks.ensureDefault,
    saveEncryptedAiImageApiKey: mocks.saveKey,
  };
});

import { DELETE, GET, POST, PUT } from "@/app/api/admin/ai-image-provider/route";

const profile = {
  id: 9,
  name: "Images",
  provider: "openai",
  provider_name: "OpenAI",
  provider_type: "openai_images",
  provider_category: "image",
  api_key_url: "",
  base_url: "https://images.test/v1",
  model: "image-test",
  api_key_masked: "sk-***",
  is_default: 1,
  created_at: 1,
  updated_at: 2,
};

function createDb() {
  return {
    prepare: vi.fn((sql: string) => ({
      all: async () => ({ results: [profile] }),
      run: async () => ({ meta: { last_row_id: 9 } }),
      bind: (..._values: unknown[]) => ({
        first: async () =>
          /COUNT/.test(sql)
            ? { count: 1 }
            : /api_key_masked/.test(sql) && !/provider_name/.test(sql)
              ? { id: 9, api_key_masked: "old-mask", is_default: 0 }
              : profile,
        run: async () => ({ meta: { last_row_id: 9 } }),
      }),
    })),
  };
}

function request(method: string, body?: unknown) {
  return new Request("https://example.com/api/admin/ai-image-provider", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "content-type": "application/json" },
  }) as never;
}

const validBody = {
  id: 9,
  name: "Images",
  provider: "openai",
  base_url: "https://images.test/v1/",
  model: "image-test",
  api_key: "sk-secret",
  is_default: true,
};

describe("/api/admin/ai-image-provider route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateRequest.mockResolvedValue(true);
    mocks.ensureInfrastructure.mockResolvedValue(undefined);
    mocks.ensureDefault.mockResolvedValue(9);
    mocks.saveKey.mockResolvedValue({ encrypted: "encrypted", masked: "sk-***" });
    mocks.getAppCloudflareEnv.mockResolvedValue({ DB: createDb() });
  });

  it("lists, creates, updates, and deletes image profiles", async () => {
    const listed = await GET(request("GET"));
    expect(await listed.json()).toEqual({ profiles: [profile], default_profile_id: 9 });
    for (const invoke of [POST, PUT]) {
      const response = await invoke(request(invoke === POST ? "POST" : "PUT", validBody));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true, profile });
    }
    const deleted = await DELETE(request("DELETE", { id: 9 }));
    expect(await deleted.json()).toEqual({ success: true });
  });

  it("preserves validation and missing-db responses", async () => {
    const invalid = await PUT(request("PUT", { ...validBody, id: 0 }));
    expect(invalid.status).toBe(400);
    mocks.getAppCloudflareEnv.mockResolvedValueOnce({});
    expect((await GET(request("GET"))).status).toBe(500);
  });
});
