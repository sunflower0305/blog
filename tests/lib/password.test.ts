import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generatePassword, hashPassword, verifyPassword } from "@/lib/password";

const PASSWORD = "文章密码-42";
const FIXED_SALT = "blog_salt_v1";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("generatePassword", () => {
  it("always generates four unambiguous characters with two letters and two digits", () => {
    for (let sample = 0; sample < 200; sample += 1) {
      const password = generatePassword();

      expect(password).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
      expect(password.match(/[ABCDEFGHJKLMNPQRSTUVWXYZ]/g)).toHaveLength(2);
      expect(password.match(/[23456789]/g)).toHaveLength(2);
    }
  });
});

describe("hashPassword", () => {
  it("matches an independent SHA-256 reference using the current fixed salt", async () => {
    const expected = sha256Hex(`${FIXED_SALT}${PASSWORD}`);

    await expect(hashPassword(PASSWORD)).resolves.toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("verifyPassword compatibility", () => {
  it("accepts the current plaintext storage format", async () => {
    await expect(verifyPassword(PASSWORD, PASSWORD)).resolves.toBe(true);
  });

  it("accepts the current fixed-salt SHA-256 storage format", async () => {
    const stored = sha256Hex(`${FIXED_SALT}${PASSWORD}`);

    await expect(verifyPassword(PASSWORD, stored)).resolves.toBe(true);
  });

  it("accepts the historical unsalted SHA-256 storage format", async () => {
    const stored = sha256Hex(PASSWORD);

    await expect(verifyPassword(PASSWORD, stored)).resolves.toBe(true);
  });

  it("rejects a password that matches none of the supported formats", async () => {
    const stored = sha256Hex(`${FIXED_SALT}${PASSWORD}`);

    await expect(verifyPassword("错误密码", stored)).resolves.toBe(false);
  });
});
