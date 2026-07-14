import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("cf-deploy-vinext arguments", () => {
  it("accepts a standalone separator and validates the following argument", () => {
    const result = spawnSync("bash", ["scripts/cf-deploy-vinext.sh", "--", "--bogus"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unknown argument: --bogus");
    expect(result.stderr).not.toContain("Unknown argument: --\n");
    expect(result.stderr).toContain(
      "Usage: pnpm run deploy [--dry-run|--warm-cdn|--no-warm-cdn|--warm-cdn-strict]",
    );
  });

  it("reads the deployment target from the generated Wrangler config", () => {
    const directory = mkdtempSync(join(tmpdir(), "cf-worker-name-"));
    const configPath = join(directory, "wrangler.json");
    writeFileSync(configPath, JSON.stringify({ name: "production-worker" }));

    const workerName = execFileSync("node", ["scripts/cf-worker-name.mjs", configPath], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(workerName).toBe("production-worker");
  });

  it("always passes the generated Worker name to Vinext", () => {
    const script = readFileSync("scripts/cf-deploy-vinext.sh", "utf8");

    expect(script).toContain('--name "${DEPLOY_WORKER_NAME}"');
    expect(script).not.toContain('if [[ -n "${VINEXT_WORKER_NAME:-}" ]]');
  });

  it("keeps a deployable assets directory in the root Wrangler config", () => {
    const config = readFileSync("wrangler.toml", "utf8");

    expect(config).toMatch(/\[assets\][\s\S]*?directory = "dist\/client"/);
  });
});
