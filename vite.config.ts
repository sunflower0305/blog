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
  const isCodeSizeOnly = process.env.CODE_QUALITY_SIZE_ONLY === "1";
  const isQualityMetricsEnabled = !isCodeSizeOnly && process.env.CODE_QUALITY_METRICS !== "0";
  const codeSizeSeverity = process.env.CODE_QUALITY_SIZE_CHECK === "1" ? "error" : "warn";

  return {
    plugins: isTest ? [] : createVinextPlugins(),
    lint: {
      ignorePatterns: ["vite.config.ts"],
      plugins: isQualityMetricsEnabled
        ? ["typescript", "unicorn", "oxc", "import"]
        : ["typescript", "unicorn", "oxc"],
      options: {
        typeAware: true,
        typeCheck: true,
      },
      rules: {
        complexity: isQualityMetricsEnabled ? ["warn", { max: 15 }] : "off",
        "max-depth": isQualityMetricsEnabled ? ["warn", { max: 4 }] : "off",
        "max-lines": [codeSizeSeverity, { max: 600, skipBlankLines: false, skipComments: false }],
        "max-lines-per-function": [
          codeSizeSeverity,
          {
            max: 300,
            skipBlankLines: false,
            skipComments: false,
            IIFEs: false,
          },
        ],
        "max-params": isQualityMetricsEnabled ? ["warn", { max: 5 }] : "off",
        "import/no-cycle": isQualityMetricsEnabled
          ? ["warn", { ignoreExternal: true, ignoreTypes: true }]
          : "off",
        "typescript/no-base-to-string": "off",
        "typescript/no-floating-promises": isQualityMetricsEnabled ? "warn" : "off",
        "typescript/no-meaningless-void-operator": "off",
        "typescript/no-misused-promises": isQualityMetricsEnabled ? "warn" : "off",
        "typescript/no-redundant-type-constituents": "off",
        "typescript/unbound-method": "off",
      },
    },
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
      coverage: {
        provider: "v8",
        reportsDirectory: "reports/code-quality/coverage",
        reporter: ["text", "json-summary", "html"],
        include: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
        exclude: ["**/*.d.ts"],
        thresholds: {
          statements: 18,
          branches: 16,
          functions: 17,
          lines: 19,
        },
      },
    },
    resolve: {
      alias: {
        ...(isTest ? {} : vinextPostcssAliases),
        "@": fileURLToPath(new URL("./", import.meta.url)),
      },
    },
  };
});
