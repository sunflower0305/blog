import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAppCloudflareEnv: vi.fn(),
}));

vi.mock("@/lib/cloudflare", () => ({
  getAppCloudflareEnv: mocks.getAppCloudflareEnv,
}));

import {
  COOKIE_NAME,
  authenticateRequest,
  generateApiToken,
  getAdminAuthConfigError,
  getSessionToken,
  isAdminAuthConfigured,
  isAdminAuthenticated,
  verifyApiToken,
  verifyPassword,
} from "@/lib/admin-auth";

const PASSWORD = "s3cret-pass";
const SALT = "deadbeefsalt";
// Independent reference implementation (node:crypto, not the module's crypto.subtle).
const EXPECTED_TOKEN = createHash("sha256").update(`${PASSWORD}:${SALT}`).digest("hex");

const ORIGINAL_ENV = { ...process.env };

function setBindingEnv(value: Record<string, unknown> | null) {
  mocks.getAppCloudflareEnv.mockResolvedValue(value);
}

beforeEach(() => {
  vi.clearAllMocks();
  Reflect.deleteProperty(process.env, "ADMIN_PASSWORD");
  Reflect.deleteProperty(process.env, "ADMIN_TOKEN_SALT");
  // Default: fully configured through the Cloudflare binding surface.
  setBindingEnv({ ADMIN_PASSWORD: PASSWORD, ADMIN_TOKEN_SALT: SALT });
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getSessionToken", () => {
  it("returns the SHA-256 of password:salt and is deterministic", async () => {
    const token = await getSessionToken();
    expect(token).toBe(EXPECTED_TOKEN);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await getSessionToken()).toBe(token);
  });

  it("returns an empty string when password or salt is missing", async () => {
    setBindingEnv({ ADMIN_PASSWORD: PASSWORD });
    expect(await getSessionToken()).toBe("");

    setBindingEnv({ ADMIN_TOKEN_SALT: SALT });
    expect(await getSessionToken()).toBe("");
  });
});

describe("verifyPassword", () => {
  it("accepts the exact password and rejects wrong or empty input", async () => {
    expect(await verifyPassword(PASSWORD)).toBe(true);
    expect(await verifyPassword(`${PASSWORD} `)).toBe(false);
    expect(await verifyPassword("wrong")).toBe(false);
    expect(await verifyPassword("")).toBe(false);
  });

  it("rejects everything when no password is configured", async () => {
    setBindingEnv(null);
    expect(await verifyPassword("")).toBe(false);
    expect(await verifyPassword("anything")).toBe(false);
  });
});

describe("isAdminAuthenticated", () => {
  it("accepts only the cookie matching the session token", async () => {
    expect(await isAdminAuthenticated(EXPECTED_TOKEN)).toBe(true);
    expect(await isAdminAuthenticated("forged-cookie")).toBe(false);
    expect(await isAdminAuthenticated(undefined)).toBe(false);
    expect(await isAdminAuthenticated("")).toBe(false);
  });

  it("rejects any cookie when auth is unconfigured (never matches empty token)", async () => {
    setBindingEnv(null);
    expect(await isAdminAuthenticated("")).toBe(false);
    expect(await isAdminAuthenticated(undefined)).toBe(false);
  });
});

describe("config detection and env fallback", () => {
  it("reports missing variables individually", async () => {
    setBindingEnv({ ADMIN_TOKEN_SALT: SALT });
    expect(await getAdminAuthConfigError()).toContain("ADMIN_PASSWORD");

    setBindingEnv({ ADMIN_PASSWORD: PASSWORD });
    expect(await getAdminAuthConfigError()).toContain("ADMIN_TOKEN_SALT");

    setBindingEnv(null);
    const bothError = await getAdminAuthConfigError();
    expect(bothError).toContain("ADMIN_PASSWORD");
    expect(bothError).toContain("ADMIN_TOKEN_SALT");
    expect(await isAdminAuthConfigured()).toBe(false);
  });

  it("returns null / configured when both are present", async () => {
    expect(await getAdminAuthConfigError()).toBeNull();
    expect(await isAdminAuthConfigured()).toBe(true);
  });

  it("falls back to process.env when the binding surface is unavailable", async () => {
    mocks.getAppCloudflareEnv.mockRejectedValue(new Error("no bindings in this context"));
    process.env.ADMIN_PASSWORD = PASSWORD;
    process.env.ADMIN_TOKEN_SALT = SALT;

    expect(await isAdminAuthConfigured()).toBe(true);
    expect(await getSessionToken()).toBe(EXPECTED_TOKEN);
  });

  it("prefers the binding value over process.env", async () => {
    setBindingEnv({ ADMIN_PASSWORD: PASSWORD, ADMIN_TOKEN_SALT: SALT });
    process.env.ADMIN_PASSWORD = "other-pass";
    process.env.ADMIN_TOKEN_SALT = "other-salt";
    expect(await getSessionToken()).toBe(EXPECTED_TOKEN);
  });

  it("trims surrounding whitespace from configured values", async () => {
    setBindingEnv({ ADMIN_PASSWORD: `  ${PASSWORD}  `, ADMIN_TOKEN_SALT: `\t${SALT}\n` });
    expect(await getSessionToken()).toBe(EXPECTED_TOKEN);
  });
});

describe("generateApiToken", () => {
  it("produces unique blog_-prefixed tokens", () => {
    const a = generateApiToken();
    const b = generateApiToken();
    expect(a).toMatch(/^blog_[A-Za-z0-9_-]{32}$/);
    expect(a).not.toBe(b);
  });
});

interface FakeDbOptions {
  row?: { id: number; is_active: number } | null;
  firstThrows?: boolean;
}

function createFakeDb({ row = null, firstThrows = false }: FakeDbOptions = {}) {
  const runResult = { run: vi.fn().mockResolvedValue(undefined) };
  const bindForUpdate = vi.fn(() => runResult);
  const bindForSelect = vi.fn(() => ({
    first: firstThrows
      ? vi.fn().mockRejectedValue(new Error("db unavailable"))
      : vi.fn().mockResolvedValue(row),
  }));
  const prepare = vi.fn((sql: string) => {
    if (sql.startsWith("SELECT")) return { bind: bindForSelect };
    return { bind: bindForUpdate };
  });
  return {
    db: { prepare } as unknown as D1Database,
    prepare,
    runResult,
  };
}

describe("verifyApiToken", () => {
  it("rejects tokens missing or without the blog_ prefix without hitting the db", async () => {
    const { db, prepare } = createFakeDb();
    expect(await verifyApiToken(db, "")).toBe(false);
    expect(await verifyApiToken(db, "nope_123")).toBe(false);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("accepts an active token and updates last_used_at", async () => {
    const { db, prepare, runResult } = createFakeDb({ row: { id: 42, is_active: 1 } });
    expect(await verifyApiToken(db, "blog_validtoken")).toBe(true);
    // one SELECT + one UPDATE
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(runResult.run).toHaveBeenCalled();
  });

  it("rejects an inactive token", async () => {
    const { db } = createFakeDb({ row: { id: 42, is_active: 0 } });
    expect(await verifyApiToken(db, "blog_inactive")).toBe(false);
  });

  it("rejects an unknown token", async () => {
    const { db } = createFakeDb({ row: null });
    expect(await verifyApiToken(db, "blog_unknown")).toBe(false);
  });

  it("returns false when the db query throws", async () => {
    const { db } = createFakeDb({ firstThrows: true });
    expect(await verifyApiToken(db, "blog_boom")).toBe(false);
  });
});

function createRequest(options: {
  authHeader?: string;
  cookie?: string;
}): import("next/server").NextRequest {
  return {
    headers: {
      get: (name: string) => (name === "Authorization" ? (options.authHeader ?? null) : null),
    },
    cookies: {
      get: (name: string) =>
        name === COOKIE_NAME && options.cookie !== undefined
          ? { value: options.cookie }
          : undefined,
    },
  } as unknown as import("next/server").NextRequest;
}

describe("authenticateRequest", () => {
  it("authenticates via a valid Bearer token when a db is provided", async () => {
    const { db } = createFakeDb({ row: { id: 1, is_active: 1 } });
    const req = createRequest({ authHeader: "Bearer blog_good" });
    expect(await authenticateRequest(req, db)).toBe(true);
  });

  it("rejects an invalid Bearer token", async () => {
    const { db } = createFakeDb({ row: null });
    const req = createRequest({ authHeader: "Bearer blog_bad" });
    expect(await authenticateRequest(req, db)).toBe(false);
  });

  it("falls back to cookie auth when no Bearer header is present", async () => {
    const req = createRequest({ cookie: EXPECTED_TOKEN });
    expect(await authenticateRequest(req)).toBe(true);
  });

  it("falls back to cookie auth when a Bearer header is present but no db is provided", async () => {
    const req = createRequest({ authHeader: "Bearer blog_good", cookie: EXPECTED_TOKEN });
    expect(await authenticateRequest(req)).toBe(true);
  });

  it("rejects when neither Bearer nor cookie is valid", async () => {
    const req = createRequest({ cookie: "forged" });
    expect(await authenticateRequest(req)).toBe(false);
  });
});
