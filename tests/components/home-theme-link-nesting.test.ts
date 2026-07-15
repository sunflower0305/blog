import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("home theme link markup", () => {
  it("does not nest Next Link components", () => {
    const themesDir = resolve(process.cwd(), "components/themes");
    const violations: string[] = [];

    for (const file of readdirSync(themesDir).filter((name) => /^Home.*\.tsx$/.test(name))) {
      const sourceText = readFileSync(resolve(themesDir, file), "utf8");
      let linkDepth = 0;

      for (const token of sourceText.matchAll(/<\/?Link\b/g)) {
        const isClosing = token[0].startsWith("</");
        if (!isClosing && linkDepth > 0) {
          const line = sourceText.slice(0, token.index).split("\n").length;
          violations.push(`${file}:${line}`);
        }
        linkDepth += isClosing ? -1 : 1;
      }
    }

    expect(violations).toEqual([]);
  });
});
