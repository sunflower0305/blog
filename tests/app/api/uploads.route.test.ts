import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAppCloudflareEnv: vi.fn(),
  authenticateRequest: vi.fn(),
  nanoid: vi.fn(() => "fixednano"),
}));

vi.mock("@/lib/cloudflare", () => ({
  getAppCloudflareEnv: mocks.getAppCloudflareEnv,
}));

vi.mock("@/lib/admin-auth", () => ({
  authenticateRequest: mocks.authenticateRequest,
}));

vi.mock("nanoid", () => ({
  nanoid: mocks.nanoid,
}));

import { POST } from "@/app/api/uploads/route";

interface UploadResponseBody {
  success: boolean;
  deduplicated?: boolean;
  type?: string;
  delivery?: string;
  variants?: Record<string, string>;
  key?: string;
}

function createFormRequest(file: File) {
  return {
    formData: vi.fn(async () => {
      const form = new FormData();
      form.append("file", file);
      return form;
    }),
  } as never;
}

function createDbMock() {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        run: vi.fn(async () => ({ success: true })),
      })),
    })),
  };
}

describe("/api/uploads route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateRequest.mockResolvedValue(true);
  });

  it("rejects unauthenticated upload requests", async () => {
    mocks.authenticateRequest.mockResolvedValue(false);
    mocks.getAppCloudflareEnv.mockResolvedValue({ DB: { kind: "db" } });

    const response = await POST(
      createFormRequest(new File(["x"], "cover.png", { type: "image/png" })),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns a deduplicated response when the small-file key already exists", async () => {
    const get = vi.fn(async () => ({ customMetadata: { originalName: "cover.png" } }));
    const put = vi.fn(async () => undefined);
    mocks.getAppCloudflareEnv.mockResolvedValue({
      DB: createDbMock(),
      IMAGES: { get, put },
      ENABLE_CF_IMAGE_PIPELINE: "true",
    });

    const file = new File(["small-image"], "cover.png", { type: "image/png" });
    const response = await POST(createFormRequest(file));
    const body = (await response.json()) as UploadResponseBody;

    expect(body.success).toBe(true);
    expect(body.deduplicated).toBe(true);
    expect(body.type).toBe("image");
    expect(body.delivery).toBe("cloudflare");
    expect(body.variants).toEqual({
      raw: expect.stringContaining("/api/images/image/"),
      content: expect.stringContaining("format=webp"),
      thumb: expect.stringContaining("w=960"),
      cover: expect.stringContaining("fit=cover"),
    });
    expect(put).not.toHaveBeenCalled();
  });

  it("uploads larger files with mime fallback and generated keys", async () => {
    const get = vi.fn(async () => null);
    const put = vi.fn(async () => undefined);
    mocks.getAppCloudflareEnv.mockResolvedValue({
      DB: createDbMock(),
      IMAGES: { get, put },
    });

    const largeContent = new Uint8Array(6 * 1024 * 1024);
    const file = new File([largeContent], "movie.mov", { type: "application/octet-stream" });

    const response = await POST(createFormRequest(file));
    const body = (await response.json()) as UploadResponseBody;

    expect(body.success).toBe(true);
    expect(body.type).toBe("document");
    expect(body.delivery).toBe("origin");
    expect(body.key).toContain("/fixednano-movie.mov");
    expect(put).toHaveBeenCalledWith(
      expect.stringContaining("/fixednano-movie.mov"),
      file,
      expect.objectContaining({
        httpMetadata: expect.objectContaining({
          contentType: "video/quicktime",
        }),
        customMetadata: {
          originalName: "movie.mov",
        },
      }),
    );
  });

  it("rejects unsupported file types before upload", async () => {
    const get = vi.fn(async () => null);
    const put = vi.fn(async () => undefined);
    mocks.getAppCloudflareEnv.mockResolvedValue({
      DB: { kind: "db" },
      IMAGES: { get, put },
    });

    const response = await POST(
      createFormRequest(new File(["x"], "script.exe", { type: "application/x-msdownload" })),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "不支持的文件类型: application/x-msdownload",
    });
    expect(put).not.toHaveBeenCalled();
  });

  it("reports missing image storage", async () => {
    mocks.getAppCloudflareEnv.mockResolvedValue({ DB: createDbMock() });

    const response = await POST(
      createFormRequest(new File(["x"], "cover.png", { type: "image/png" })),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "图片存储未配置，请用 Cloudflare preview/runtime 启动。",
    });
  });

  it("rejects files larger than the worker limit", async () => {
    const put = vi.fn(async () => undefined);
    mocks.getAppCloudflareEnv.mockResolvedValue({
      DB: createDbMock(),
      IMAGES: { get: vi.fn(async () => null), put },
    });
    const file = new File(["x"], "large.mp4", { type: "video/mp4" });
    Object.defineProperty(file, "size", { value: 101 * 1024 * 1024 });

    const response = await POST(createFormRequest(file));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "文件不能超过 100MB" });
    expect(put).not.toHaveBeenCalled();
  });

  it("returns a stable error response when storage fails", async () => {
    const get = vi.fn(async () => null);
    const put = vi.fn(async () => {
      throw new Error("R2 unavailable");
    });
    mocks.getAppCloudflareEnv.mockResolvedValue({
      DB: createDbMock(),
      IMAGES: { get, put },
    });

    const response = await POST(
      createFormRequest(new File(["image"], "cover.png", { type: "image/png" })),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "文件上传失败: R2 unavailable",
    });
  });
});
