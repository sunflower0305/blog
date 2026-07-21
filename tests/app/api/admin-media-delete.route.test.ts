import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAppCloudflareEnv: vi.fn(),
  authenticateRequest: vi.fn(),
  imagesDelete: vi.fn(),
  dbRun: vi.fn(),
}));

vi.mock("@/lib/cloudflare", () => ({
  getAppCloudflareEnv: mocks.getAppCloudflareEnv,
}));

vi.mock("@/lib/admin-auth", () => ({
  authenticateRequest: mocks.authenticateRequest,
}));

import { DELETE } from "@/app/api/admin/media/[key]/route";

function makeEnv() {
  return {
    DB: {
      prepare: () => ({ bind: () => ({ run: () => mocks.dbRun() }) }),
    },
    IMAGES: { delete: mocks.imagesDelete },
  };
}

const request = {} as never;
const ctx = { params: Promise.resolve({ key: encodeURIComponent("uploads/pic.webp") }) };

describe("/api/admin/media/[key] DELETE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAppCloudflareEnv.mockResolvedValue(makeEnv());
    mocks.authenticateRequest.mockResolvedValue(true);
    mocks.dbRun.mockResolvedValue({ success: true });
  });

  it("deletes the R2 object then the DB row on success", async () => {
    mocks.imagesDelete.mockResolvedValue(undefined);

    const response = await DELETE(request, ctx);

    expect(response.status).toBe(200);
    expect(mocks.imagesDelete).toHaveBeenCalledWith("uploads/pic.webp");
    expect(mocks.dbRun).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual({ success: true });
  });

  it("keeps the DB row (no orphaned object) and returns 502 when R2 delete throws", async () => {
    mocks.imagesDelete.mockRejectedValue(new Error("R2 unavailable"));

    const response = await DELETE(request, ctx);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "删除存储文件失败，请重试" });
    // Critical: the row must survive so the object stays reachable for a retry.
    expect(mocks.dbRun).not.toHaveBeenCalled();
  });
});
