import { cloudflare } from "@cloudflare/vite-plugin";
import { cdnAdapter } from "@vinext/cloudflare/cache/cdn-adapter";
import { kvDataAdapter } from "@vinext/cloudflare/cache/kv-data-adapter";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vinext from "vinext";
import { defineConfig } from "vite-plus";

const require = createRequire(import.meta.url);
const juiceRequire = createRequire(require.resolve("juice/package.json"));
const vinextPostcssAliases: Record<string, string> = {
  "postcss/lib/comment": juiceRequire.resolve("postcss/lib/comment"),
  "postcss/lib/parser": juiceRequire.resolve("postcss/lib/parser"),
  "postcss/lib/tokenize": juiceRequire.resolve("postcss/lib/tokenize"),
};
function createVinextPlugins() {
  return [
    ...vinext({
      prerender: true,
      cache: {
        cdn: cdnAdapter(),
        data: kvDataAdapter({
          binding: "CACHE",
          appPrefix: "leyang-blog-vinext",
        }),
      },
    }),
    ...cloudflare({
      configPath: process.env.WRANGLER_VINEXT_CONFIG ?? "./wrangler.toml",
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
    }),
  ];
}

const vinextPostcssResolvePlugin = {
  name: "vinext-postcss-safe-parser-resolve",
  resolveId(id: string) {
    return vinextPostcssAliases[id];
  },
};

export default defineConfig(({ mode }) => {
  const isTest = mode === "test" || process.env.VITEST === "true";

  return {
    plugins: isTest ? [] : createVinextPlugins(),
    optimizeDeps: {
      include: isTest ? [] : ["juice", "postcss"],
      needsInterop: isTest ? [] : ["postcss"],
      rolldownOptions: {
        plugins: isTest ? [] : [vinextPostcssResolvePlugin],
      },
    },
    test: {
      environment: "node",
      include: ["tests/**/*.test.ts"],
      clearMocks: true,
    },
    resolve: {
      alias: {
        ...(isTest ? {} : vinextPostcssAliases),
        "@": fileURLToPath(new URL("./", import.meta.url)),
      },
    },
  };
});
