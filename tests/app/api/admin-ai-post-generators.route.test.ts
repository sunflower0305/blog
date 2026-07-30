import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getAppCloudflareEnv: vi.fn(),
  ensureInfrastructure: vi.fn(),
  getByTarget: vi.fn(),
  list: vi.fn(),
  run: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ authenticateRequest: mocks.authenticateRequest }));
vi.mock("@/lib/cloudflare", () => ({ getAppCloudflareEnv: mocks.getAppCloudflareEnv }));
vi.mock("@/lib/ai-post-generators", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-post-generators")>();
  return {
    ...actual,
    ensureAiPostGeneratorInfrastructure: mocks.ensureInfrastructure,
    getAiPostGeneratorByTarget: mocks.getByTarget,
    listAiPostGenerators: mocks.list,
  };
});

import { GET, PUT } from "@/app/api/admin/ai-post-generators/route";

const current = {
  target_key: "summary",
  prompt: "prompt",
  provider_mode: "workers_ai",
  text_profile_id: null,
  image_profile_id: null,
  workers_model: "model",
  temperature: 0.5,
  max_tokens: 1000,
  aspect_ratio: "auto",
  resolution: "2k",
  is_enabled: 1,
};

function db() {
  return {
    prepare: () => ({ bind: () => ({ run: mocks.run }) }),
  };
}

function request(method: string, body?: unknown) {
  return new Request("https://example.com/api/admin/ai-post-generators", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "content-type": "application/json" },
  }) as never;
}

describe("/api/admin/ai-post-generators route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateRequest.mockResolvedValue(true);
    mocks.ensureInfrastructure.mockResolvedValue(undefined);
    mocks.list.mockResolvedValue([current]);
    mocks.getByTarget.mockResolvedValue(current);
    mocks.run.mockResolvedValue({ success: true });
    mocks.getAppCloudflareEnv.mockResolvedValue({ DB: db() });
  });

  it("lists generator settings and model suggestions", async () => {
    const body = await (await GET(request("GET"))).json();
    expect(body).toEqual(
      expect.objectContaining({ generators: [current], workers_ai: expect.any(Object) }),
    );
  });

  it("updates text and cover generators", async () => {
    for (const target_key of ["summary", "cover"]) {
      mocks.getByTarget.mockResolvedValueOnce({ ...current, target_key }).mockResolvedValueOnce({
        ...current,
        target_key,
      });
      const response = await PUT(
        request("PUT", {
          target_key,
          prompt: " updated ",
          provider_mode: "profile",
          text_profile_id: 2,
          image_profile_id: 3,
          is_enabled: false,
        }),
      );
      expect(await response.json()).toEqual({
        success: true,
        generator: expect.objectContaining({ target_key }),
      });
    }
  });

  it("rejects invalid targets, missing configs, and empty prompts", async () => {
    expect((await PUT(request("PUT", { target_key: "bad" }))).status).toBe(400);
    mocks.getByTarget.mockResolvedValueOnce(null);
    expect((await PUT(request("PUT", { target_key: "summary" }))).status).toBe(404);
    mocks.getByTarget.mockResolvedValueOnce({ ...current, prompt: "" });
    expect(
      (await PUT(request("PUT", { target_key: "summary", prompt: " " }))).status,
    ).toBe(400);
  });
});
