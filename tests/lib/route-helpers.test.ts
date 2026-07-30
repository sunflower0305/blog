import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getAppCloudflareEnv: vi.fn(),
  getAppCloudflareContext: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({
  authenticateRequest: mocks.authenticateRequest,
}));

vi.mock("@/lib/cloudflare", () => ({
  getAppCloudflareEnv: mocks.getAppCloudflareEnv,
  getAppCloudflareContext: mocks.getAppCloudflareContext,
}));

import {
  ensureAuthenticatedRequest,
  getRouteContextWithDb,
  getRouteEnvWithDb,
  jsonError,
  jsonOk,
  readJsonBody,
} from "@/lib/server/route-helpers";

describe("route helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds successful and error JSON responses with explicit statuses", async () => {
    const ok = jsonOk({ saved: true }, 201);
    const error = jsonError("bad request", 422);

    expect(ok.status).toBe(201);
    await expect(ok.json()).resolves.toEqual({ saved: true });
    expect(error.status).toBe(422);
    await expect(error.json()).resolves.toEqual({ error: "bad request" });
  });

  it("parses valid JSON and maps malformed JSON to a 400 response", async () => {
    const parsed = await readJsonBody<{ name: string }>({
      json: async () => ({ name: "post" }),
    } as never);
    expect(parsed).toEqual({ ok: true, body: { name: "post" } });

    const invalid = await readJsonBody(
      {
        json: async () => {
          throw new SyntaxError("bad JSON");
        },
      } as never,
      "invalid payload",
    );
    expect(invalid.ok).toBe(false);
    if (invalid.ok) throw new Error("expected invalid JSON result");
    expect(invalid.response.status).toBe(400);
    await expect(invalid.response.json()).resolves.toEqual({ error: "invalid payload" });
  });

  it("returns the environment and DB when the DB binding exists", async () => {
    const db = { kind: "db" };
    mocks.getAppCloudflareEnv.mockResolvedValue({ DB: db, IMAGES: { kind: "bucket" } });

    await expect(getRouteEnvWithDb()).resolves.toMatchObject({
      ok: true,
      db,
      env: { DB: db, IMAGES: { kind: "bucket" } },
    });
  });

  it("returns a custom 500 response when the DB binding is missing", async () => {
    mocks.getAppCloudflareEnv.mockResolvedValue({});

    const result = await getRouteEnvWithDb("database missing");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected missing DB result");
    expect(result.response.status).toBe(500);
    await expect(result.response.json()).resolves.toEqual({ error: "database missing" });
  });

  it("returns the execution context with its DB binding", async () => {
    const db = { kind: "db" };
    const ctx = { waitUntil: vi.fn() };
    mocks.getAppCloudflareContext.mockResolvedValue({ env: { DB: db }, ctx });

    await expect(getRouteContextWithDb()).resolves.toMatchObject({ ok: true, db, ctx });
  });

  it("returns a 500 response when the execution context has no DB", async () => {
    mocks.getAppCloudflareContext.mockResolvedValue({ env: {}, ctx: undefined });

    const result = await getRouteContextWithDb("context DB missing");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected missing DB result");
    await expect(result.response.json()).resolves.toEqual({ error: "context DB missing" });
  });

  it("returns null for authenticated requests and a 401 response otherwise", async () => {
    const request = { kind: "request" };
    const db = { kind: "db" };
    mocks.authenticateRequest.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(ensureAuthenticatedRequest(request as never, db as never)).resolves.toBeNull();
    const denied = await ensureAuthenticatedRequest(request as never, db as never, "sign in");
    expect(denied?.status).toBe(401);
    await expect(denied?.json()).resolves.toEqual({ error: "sign in" });
    expect(mocks.authenticateRequest).toHaveBeenNthCalledWith(1, request, db);
  });
});
