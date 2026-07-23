import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureAiImageConfigInfrastructure: vi.fn(),
  getDefaultImageActionSeed: vi.fn(),
  resolveAiImageProfileConfig: vi.fn(),
  imageGenerate: vi.fn(),
}));

vi.mock("@/lib/ai-image-config", () => ({
  ensureAiImageConfigInfrastructure: mocks.ensureAiImageConfigInfrastructure,
  getDefaultImageActionSeed: mocks.getDefaultImageActionSeed,
  resolveAiImageProfileConfig: mocks.resolveAiImageProfileConfig,
}));

vi.mock("@/lib/ai-provider-profiles", () => ({
  buildWorkersAiRunUrl: () => "https://workers.test/run",
  isWorkersAiBaseUrl: () => false,
  normalizeBaseUrl: (value: string) => value.replace(/\/+$/, ""),
  resolveAiConfigSecret: () => "test-secret",
}));

vi.mock("nanoid", () => ({ nanoid: () => "fixed-image-id" }));

vi.mock("openai", () => ({
  default: class OpenAIMock {
    images = {
      generate: mocks.imageGenerate,
      edit: vi.fn(),
    };
  },
}));

import { generateEditorImage } from "@/lib/ai-image";

describe("generateEditorImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureAiImageConfigInfrastructure.mockResolvedValue(undefined);
    mocks.getDefaultImageActionSeed.mockReturnValue(null);
    mocks.resolveAiImageProfileConfig.mockResolvedValue({
      id: 1,
      name: "Image Provider",
      provider: "openai",
      provider_name: "OpenAI",
      provider_type: "openai_images",
      provider_category: "",
      api_key_url: "",
      base_url: "https://images.test/v1/",
      model: "image-model",
      api_key: "secret",
      api_key_masked: "sec***",
      is_default: 1,
    });
    mocks.imageGenerate.mockResolvedValue({
      data: [
        {
          b64_json: Buffer.from("generated-image").toString("base64"),
          revised_prompt: "A revised image prompt",
        },
      ],
    });
  });

  it("generates, stores and returns an editor image", async () => {
    const put = vi.fn(async () => undefined);

    const result = await generateEditorImage({
      action: "custom",
      actionLabel: "Hero",
      userPrompt: "A quiet mountain lake",
      articleTitle: "Travel notes",
      aspectRatio: "16:9",
      resolution: "2k",
      db: {} as D1Database,
      env: { ENABLE_CF_IMAGE_PIPELINE: "true" },
      images: { put },
    });

    expect(mocks.imageGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "image-model", size: "1536x1024" }),
    );
    expect(put).toHaveBeenCalledWith(
      expect.stringContaining("ai-fixed-image-id-a-revised-image-prompt.webp"),
      expect.any(Uint8Array),
      expect.objectContaining({
        httpMetadata: expect.objectContaining({ contentType: "image/webp" }),
      }),
    );
    expect(result).toMatchObject({
      actionLabel: "Hero",
      alt: "A revised image prompt",
      aspectRatio: "16:9",
      resolution: "2k",
      size: "1536x1024",
      profileName: "Image Provider",
      model: "image-model",
    });
    expect(result.variants.content).toContain("format=webp");
  });

  it("requires a configured image profile", async () => {
    mocks.resolveAiImageProfileConfig.mockResolvedValue(null);

    await expect(
      generateEditorImage({
        action: "custom",
        userPrompt: "A lake",
        db: {} as D1Database,
        images: { put: vi.fn() },
      }),
    ).rejects.toThrow("请先在后台配置图片模型");
  });
});
