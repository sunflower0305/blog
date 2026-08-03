import { afterEach, describe, expect, it, vi } from "vitest";

import {
  extractWorkersAiImageAsset,
  resolveWorkersAiImageSize,
  runWorkersAiCompatImageRequest,
} from "@/lib/ai-image";

describe("resolveWorkersAiImageSize", () => {
  it.each([
    ["16:9", "1k", { width: 1024, height: 576 }],
    ["1:1", "2k", { width: 1344, height: 1344 }],
    ["9:16", "4k", { width: 864, height: 1536 }],
    ["auto", "1k", { width: 1024, height: 576 }],
  ] as const)("maps %s at %s to Workers AI dimensions", (aspectRatio, resolution, expected) => {
    expect(resolveWorkersAiImageSize(aspectRatio, resolution)).toEqual(expected);
  });
});

describe("ai-image workers ai compat image request", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries with multipart form data when the model requires multipart input", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "required properties at '/' are 'multipart'" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ image: Buffer.from("fake-image").toString("base64") }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await runWorkersAiCompatImageRequest(
      {
        apiKey: "test-key",
        baseURL: "https://api.cloudflare.com/client/v4/accounts/test-account/ai/v1",
        model: "@cf/black-forest-labs/flux-2-dev",
      },
      {
        prompt: "生成封面图",
        width: 1344,
        height: 768,
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer test-key",
        "Content-Type": "application/json",
      }),
    });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer test-key",
      }),
    });
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBeInstanceOf(FormData);
    expect(result).toEqual({
      image: Buffer.from("fake-image").toString("base64"),
    });
  });

  it("returns the raw response when workers ai sends back an image stream", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await runWorkersAiCompatImageRequest(
      {
        apiKey: "test-key",
        baseURL: "https://api.cloudflare.com/client/v4/accounts/test-account/ai/v1",
        model: "@cf/black-forest-labs/flux-2-dev",
      },
      {
        prompt: "生成封面图",
        width: 1344,
        height: 768,
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("content-type")).toBe("image/png");
  });

  it("does not retry unrelated request failures", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ errors: [{ message: "account is disabled" }] }), {
        status: 403,
        statusText: "Forbidden",
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runWorkersAiCompatImageRequest(
        {
          apiKey: "test-key",
          baseURL: "https://api.cloudflare.com/client/v4/accounts/test-account/ai/v1",
          model: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
        },
        { prompt: "生成封面图", width: 1024, height: 576 },
      ),
    ).rejects.toThrow("account is disabled");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports malformed successful JSON responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response("not-json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(
      runWorkersAiCompatImageRequest(
        {
          apiKey: "test-key",
          baseURL: "https://api.cloudflare.com/client/v4/accounts/test-account/ai/v1",
          model: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
        },
        { prompt: "生成封面图", width: 1024, height: 576 },
      ),
    ).rejects.toThrow("无法解析");
  });
});

describe("extractWorkersAiImageAsset", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts response streams and typed image buffers", async () => {
    const responseAsset = await extractWorkersAiImageAsset(
      new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
        headers: { "content-type": "image/jpeg" },
      }),
      "image-model",
    );
    expect(responseAsset.contentType).toBe("image/jpeg");
    expect(responseAsset.extension).toBe("jpg");
    expect(responseAsset.data).toBeInstanceOf(ReadableStream);

    const pngAsset = await extractWorkersAiImageAsset(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      "image-model",
    );
    expect(pngAsset).toMatchObject({ contentType: "image/png", extension: "png" });

    const webpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    const webpAsset = await extractWorkersAiImageAsset(webpBytes.buffer, "image-model");
    expect(webpAsset).toMatchObject({ contentType: "image/webp", extension: "webp" });

    const streamAsset = await extractWorkersAiImageAsset(
      new Blob([new Uint8Array([1, 2, 3])]).stream(),
      "phoenix-image-model",
    );
    expect(streamAsset).toMatchObject({ contentType: "image/jpeg", extension: "jpg" });
  });

  it("extracts base64 payloads and remote image URLs", async () => {
    const base64Asset = await extractWorkersAiImageAsset(
      { result: { image: Buffer.from([0xff, 0xd8, 0xff]).toString("base64") } },
      "image-model",
    );
    expect(base64Asset).toMatchObject({ contentType: "image/jpeg", extension: "jpg" });

    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(new Uint8Array([0x52, 0x49, 0x46, 0x46]), {
          headers: { "content-type": "image/webp" },
        }),
    );
    const remoteAsset = await extractWorkersAiImageAsset(
      { url: "https://images.test/generated.webp" },
      "image-model",
    );
    expect(remoteAsset).toMatchObject({ contentType: "image/webp", extension: "webp" });

    const nestedAsset = await extractWorkersAiImageAsset(
      { result: { url: "https://images.test/generated.webp" } },
      "image-model",
    );
    expect(nestedAsset).toMatchObject({ contentType: "image/webp", extension: "webp" });
  });

  it("rejects empty and failed remote payloads", async () => {
    await expect(extractWorkersAiImageAsset({}, "image-model")).rejects.toThrow(
      "Workers AI 图片模型未返回可用内容",
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("missing", { status: 404 }));
    await expect(
      extractWorkersAiImageAsset({ url: "https://images.test/missing" }, "image-model"),
    ).rejects.toThrow("HTTP 404");

    await expect(
      extractWorkersAiImageAsset(
        new Response(null, { headers: { "content-type": "image/png" } }),
        "image-model",
      ),
    ).rejects.toThrow("未返回图片内容");
  });
});
