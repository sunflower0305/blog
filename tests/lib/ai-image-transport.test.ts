import { afterEach, describe, expect, it, vi } from "vitest";

const openAiMocks = vi.hoisted(() => ({
  edit: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class OpenAIMock {
    images = openAiMocks;
  },
}));

import {
  extractGeneratedImagePayload,
  requestOpenAiCompatibleImage,
} from "@/lib/ai-image-transport";
import { parseImageApiErrorMessage } from "@/lib/ai-image-workers";

describe("extractGeneratedImagePayload", () => {
  afterEach(() => vi.restoreAllMocks());

  it("extracts base64 image payloads", async () => {
    const result = await extractGeneratedImagePayload({
      created: 1,
      data: [
        {
          b64_json: Buffer.from([1, 2, 3]).toString("base64"),
          revised_prompt: "  refined prompt  ",
        },
      ],
    });
    expect(result).toMatchObject({
      contentType: "image/webp",
      extension: "webp",
      revisedPrompt: "refined prompt",
    });
    expect(result.bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("downloads remote images and preserves their type", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
        headers: { "content-type": "image/jpeg" },
      }),
    );
    const result = await extractGeneratedImagePayload({
      created: 1,
      data: [{ url: "https://images.test/generated.jpg" }],
    });
    expect(result).toMatchObject({ contentType: "image/jpeg", extension: "jpg" });
  });

  it("rejects empty, unusable, and failed remote responses", async () => {
    await expect(extractGeneratedImagePayload({ created: 1, data: [] })).rejects.toThrow(
      "未返回结果",
    );
    await expect(
      extractGeneratedImagePayload({ created: 1, data: [{}] }),
    ).rejects.toThrow("未返回可用内容");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("missing", { status: 404 }));
    await expect(
      extractGeneratedImagePayload({
        created: 1,
        data: [{ url: "https://images.test/missing" }],
      }),
    ).rejects.toThrow("HTTP 404");
  });
});

describe("requestOpenAiCompatibleImage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses the SDK generation transport and extracts its response", async () => {
    openAiMocks.generate.mockResolvedValueOnce({
      data: [{ b64_json: Buffer.from([4, 5, 6]).toString("base64") }],
    });

    const result = await requestOpenAiCompatibleImage(
      {
        apiKey: "test-key",
        baseURL: "https://images.test/v1/",
        model: "image-model",
      },
      { prompt: "生成封面", size: "1536x1024", quality: "high" },
    );

    expect(openAiMocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "image-model",
        prompt: "生成封面",
        size: "1536x1024",
        quality: "high",
      }),
    );
    expect(result.bytes).toEqual(new Uint8Array([4, 5, 6]));
  });

  it("downloads a reference image before using the SDK edit transport", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        headers: { "content-type": "image/png" },
      }),
    );
    openAiMocks.edit.mockResolvedValueOnce({
      data: [{ b64_json: Buffer.from([7, 8, 9]).toString("base64") }],
    });

    await requestOpenAiCompatibleImage(
      {
        apiKey: "test-key",
        baseURL: "https://images.test/v1",
        model: "image-model",
      },
      {
        prompt: "参考图改绘",
        size: "1024x1024",
        quality: "medium",
        referenceImageUrl: "https://images.test/My Reference.PNG?token=one",
      },
    );

    const editRequest = openAiMocks.edit.mock.calls[0]?.[0];
    expect(editRequest.image).toBeInstanceOf(File);
    expect(editRequest.image.name).toBe("my-reference.png");
    expect(editRequest).toMatchObject({ input_fidelity: "high", model: "image-model" });
  });
});

describe("parseImageApiErrorMessage", () => {
  it.each([
    [JSON.stringify({ errors: [{ message: "workers error" }] }), "workers error"],
    [JSON.stringify({ error: { message: "object error" } }), "object error"],
    [JSON.stringify({ error: "string error" }), "string error"],
    [JSON.stringify({ message: "message error" }), "message error"],
    ["plain error", "plain error"],
    ["", "HTTP 500: Internal Server Error"],
  ])("normalizes provider errors", (body, expected) => {
    expect(parseImageApiErrorMessage(500, "Internal Server Error", body)).toBe(expected);
  });
});
