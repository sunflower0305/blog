import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildWorkersAiRunUrl,
  clampMaxTokens,
  clampTemperature,
  decryptApiKey,
  encryptApiKey,
  ensureAiConfigInfrastructure,
  ensureDefaultProfileId,
  isWorkersAiBaseUrl,
  mapProfileRow,
  maskApiKey,
  normalizeBaseUrl,
  resolveAiConfigSecret,
  resolveAiProfileConfig,
  type AIProviderProfileRow,
} from "@/lib/ai-provider-profiles";
import { createTestD1Database, type TestD1Database } from "@/tests/helpers/sqlite-d1";

const SECRET = "test-encryption-secret";

function seedLegacyConfig(database: TestD1Database, apiKey?: string) {
  database.raw.prepare("INSERT INTO site_settings (key, value) VALUES (?, ?)").run(
    "ai_provider_config",
    JSON.stringify({
      provider: "openai",
      provider_name: "OpenAI",
      provider_type: "openai_compatible",
      base_url: "https://api.example.com/v1/",
      model: "example-model",
      temperature: 0.4,
      max_tokens: 4096,
    }),
  );
  if (apiKey !== undefined) {
    database.raw
      .prepare("INSERT INTO site_settings (key, value) VALUES (?, ?)")
      .run("ai_provider_api_key", apiKey);
  }
}

describe("AI provider profiles", () => {
  let database: TestD1Database;

  beforeEach(() => {
    database = createTestD1Database();
  });

  afterEach(() => {
    database.close();
  });

  it("normalizes provider values and bounds numeric settings", () => {
    expect(normalizeBaseUrl(" https://example.com/v1/// ")).toBe("https://example.com/v1");
    expect(isWorkersAiBaseUrl("https://api.cloudflare.com/client/v4/accounts/abc/ai/v1")).toBe(
      true,
    );
    expect(isWorkersAiBaseUrl("https://example.com/v1")).toBe(false);
    expect(buildWorkersAiRunUrl("https://example.com/ai/v1", " model-a ")).toBe(
      "https://example.com/ai/run/model-a",
    );
    expect(clampTemperature(Number.NaN)).toBe(0.7);
    expect(clampTemperature(4)).toBe(2);
    expect(clampMaxTokens(0)).toBe(2000);
    expect(clampMaxTokens(50_000)).toBe(32_768);
    expect(maskApiKey("short-key")).toBe("sh...ey");
    expect(maskApiKey("sk-1234567890abcdef")).toBe("sk-123...cdef");
  });

  it("resolves encryption secrets in explicit fallback order", () => {
    expect(
      resolveAiConfigSecret({ AI_CONFIG_ENCRYPTION_SECRET: "primary", ADMIN_TOKEN_SALT: "salt" }),
    ).toBe("primary");
    expect(resolveAiConfigSecret({ ADMIN_TOKEN_SALT: "salt" })).toBe("salt");
  });

  it("round-trips encrypted keys without encrypting an enc:v1 value twice", async () => {
    const encrypted = await encryptApiKey("  sk-secret  ", SECRET);

    expect(encrypted).toMatch(/^enc:v1:/);
    await expect(decryptApiKey(encrypted, SECRET)).resolves.toBe("sk-secret");
    await expect(encryptApiKey(encrypted, SECRET)).resolves.toBe(encrypted);
    await expect(decryptApiKey(encrypted, "wrong-secret")).resolves.toBe("");
    await expect(decryptApiKey("enc:v1:broken", SECRET)).resolves.toBe("");
    await expect(decryptApiKey(" legacy-plaintext ", SECRET)).resolves.toBe("legacy-plaintext");

    const prefixLikePlaintext = await encryptApiKey("enc:v1:not-valid-ciphertext", SECRET);
    expect(prefixLikePlaintext).not.toBe("enc:v1:not-valid-ciphertext");
    await expect(decryptApiKey(prefixLikePlaintext, SECRET)).resolves.toBe(
      "enc:v1:not-valid-ciphertext",
    );
  });

  it("migrates a plaintext legacy key once and preserves the migrated profile", async () => {
    seedLegacyConfig(database, "legacy-secret");

    await ensureAiConfigInfrastructure(database.db, SECRET);
    const firstProfile = database.raw
      .prepare(
        "SELECT id, base_url, model, api_key_encrypted, api_key_masked, is_default FROM ai_provider_profiles",
      )
      .get() as {
      id: number;
      base_url: string;
      model: string;
      api_key_encrypted: string;
      api_key_masked: string;
      is_default: number;
    };

    await ensureAiConfigInfrastructure(database.db, SECRET);
    const profileCount = database.raw
      .prepare("SELECT COUNT(*) AS count FROM ai_provider_profiles")
      .get() as { count: number };
    const secondEncrypted = database.raw
      .prepare("SELECT api_key_encrypted FROM ai_provider_profiles WHERE id = ?")
      .get(firstProfile.id) as { api_key_encrypted: string };

    expect(profileCount.count).toBe(1);
    expect(firstProfile).toMatchObject({
      base_url: "https://api.example.com/v1",
      model: "example-model",
      api_key_masked: "legacy...cret",
      is_default: 1,
    });
    expect(secondEncrypted.api_key_encrypted).toBe(firstProfile.api_key_encrypted);
    await expect(decryptApiKey(firstProfile.api_key_encrypted, SECRET)).resolves.toBe(
      "legacy-secret",
    );

    await expect(resolveAiProfileConfig(database.db, SECRET)).resolves.toMatchObject({
      id: firstProfile.id,
      api_key: "legacy-secret",
      base_url: "https://api.example.com/v1",
      model: "example-model",
      temperature: 0.4,
      max_tokens: 4096,
      is_default: 1,
    });
  });

  it("returns null when a migrated profile has no usable key", async () => {
    seedLegacyConfig(database);
    await ensureAiConfigInfrastructure(database.db, SECRET);

    await expect(resolveAiProfileConfig(database.db, SECRET)).resolves.toBeNull();

    database.raw
      .prepare("UPDATE ai_provider_profiles SET api_key_encrypted = ?")
      .run("enc:v1:invalid:payload");
    await expect(resolveAiProfileConfig(database.db, SECRET)).resolves.toBeNull();
  });

  it("selects the first profile as default when no default exists", async () => {
    seedLegacyConfig(database, "legacy-secret");
    await ensureAiConfigInfrastructure(database.db, SECRET);
    database.raw.prepare("UPDATE ai_provider_profiles SET is_default = 0").run();

    await expect(ensureDefaultProfileId(database.db)).resolves.toBe(1);
    expect(
      database.raw.prepare("SELECT is_default FROM ai_provider_profiles WHERE id = 1").get(),
    ).toEqual({ is_default: 1 });
  });

  it("normalizes numeric values when mapping rows", () => {
    const row = {
      id: 1,
      name: "Profile",
      provider: "custom",
      provider_name: "",
      provider_type: "openai_compatible",
      provider_category: "",
      api_key_url: "",
      base_url: "https://example.com",
      model: "model",
      temperature: 9,
      max_tokens: -1,
      api_key_masked: "",
      is_default: 0,
      created_at: 1,
      updated_at: 1,
    } satisfies AIProviderProfileRow;

    expect(mapProfileRow(row)).toMatchObject({ temperature: 2, max_tokens: 2000 });
  });
});
