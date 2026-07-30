import { describe, expect, it } from "vitest";
import codeQuality from "../../config/code-quality.json";
import {
  extractComplexityThreshold,
  formatComplexitySummary,
} from "../../scripts/code-quality-format.mjs";
import { compareLintBaseline, countDiagnosticsByRule } from "../../scripts/lint-baseline.mjs";

describe("code quality configuration", () => {
  it("renders the configured complexity threshold in report copy", () => {
    expect(formatComplexitySummary(21, codeQuality.complexity.warningMax)).toBe(
      "Oxlint found 21 functions above the configured complexity threshold of 20.",
    );
  });

  it("prefers the threshold recorded by the current lint diagnostics", () => {
    expect(
      extractComplexityThreshold(
        [{ message: "Function has a complexity of 22. Maximum allowed is 15." }],
        codeQuality.complexity.warningMax,
      ),
    ).toBe(15);
    expect(extractComplexityThreshold([], codeQuality.complexity.warningMax)).toBe(20);
  });

  it("counts diagnostics by rule", () => {
    expect(
      countDiagnosticsByRule([
        { code: "eslint(complexity)" },
        { code: "eslint(complexity)" },
        { code: "eslint(max-depth)" },
      ]),
    ).toEqual({
      "eslint(complexity)": 2,
      "eslint(max-depth)": 1,
    });
  });

  it("detects both regressions and stale baselines", () => {
    expect(compareLintBaseline({ a: 3, b: 1 }, { a: 2, b: 2 })).toEqual([
      { rule: "a", actual: 3, expected: 2 },
      { rule: "b", actual: 1, expected: 2 },
    ]);
  });
});
