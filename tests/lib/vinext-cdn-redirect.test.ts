import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vite-plus/test";

// The Cloudflare entrypoint cannot be imported in Node. Evaluate the published
// module with host imports stubbed, exercising its actual request construction.
const source = readFileSync(
  "node_modules/@vinext/cloudflare/dist/cache/cdn-adapter.worker.js",
  "utf8",
)
  .replace(/^import .*;$/gm, "")
  .replace(/^export .*;$/gm, "");
const createRequest = runInNewContext(`${source}\ncreateCacheFacingRequest`, {
  WorkerEntrypoint: class {},
  VINEXT_RSC_VARY_HEADER: "RSC, Next-Router-State-Tree",
  getVinextCdnBuildIdentity: () => "test-build",
  Request,
  Headers,
  URL,
  TextEncoder,
  crypto: globalThis.crypto,
}) as (request: Request, invocation: string) => Promise<Request>;

describe("Cloudflare CDN response-stage redirects", () => {
  it.each(["GET", "HEAD"])(
    "returns %s redirects to the gateway without following them",
    async (method) => {
      const request = await createRequest(
        new Request("https://example.com/admin", { method }),
        JSON.stringify({ requestUrl: "https://example.com/admin" }),
      );

      expect(request.redirect).toBe("manual");
      expect(request.method).toBe(method);
      expect(new URL(request.url).pathname).toBe("/admin");
      expect(new URL(request.url).searchParams.get("__vinext_cache_key")).toMatch(/^[a-f0-9]{64}$/);
    },
  );
});
