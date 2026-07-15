import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRouteEnvWithDb: vi.fn(),
  parseJsonBody: vi.fn(),
}));

vi.mock("@/lib/server/route-helpers", () => ({
  getRouteEnvWithDb: mocks.getRouteEnvWithDb,
  jsonError: (message: string, status = 500) => Response.json({ error: message }, { status }),
  jsonOk: (data: unknown, status = 200) => Response.json(data, { status }),
  parseJsonBody: mocks.parseJsonBody,
}));

import { POST } from "@/app/api/posts/views/route";

describe("/api/posts/views route", () => {
  const run = vi.fn();
  const bind = vi.fn(() => ({ run }));
  const prepare = vi.fn((_sql: string) => ({ bind }));

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRouteEnvWithDb.mockResolvedValue({
      ok: true,
      env: {},
      db: { prepare },
    });
    run.mockResolvedValue(undefined);
  });

  it("increments view count for a normalized public slug", async () => {
    mocks.parseJsonBody.mockResolvedValue({ slug: "post-1" });

    const response = await POST({} as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(prepare.mock.calls[0]?.[0]).toContain("password IS NULL");
    expect(bind).toHaveBeenCalledWith("post-1");
    expect(run).toHaveBeenCalled();
  });

  it("rejects slugs that would be normalized to a different value", async () => {
    mocks.parseJsonBody.mockResolvedValue({ slug: "../post-1" });

    const response = await POST({} as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Invalid slug" });
    expect(prepare).not.toHaveBeenCalled();
  });
});
