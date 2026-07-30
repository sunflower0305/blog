import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import codeQuality from "../config/code-quality.json" with { type: "json" };

const LINT_ARGS = [
  "exec",
  "vp",
  "lint",
  "--format",
  "json",
  "--ignore-pattern",
  "dist/**",
  "--ignore-pattern",
  ".wrangler/**",
  "--ignore-pattern",
  "worker-configuration.d.ts",
];

export function countDiagnosticsByRule(diagnostics) {
  const counts = {};
  for (const diagnostic of diagnostics) {
    counts[diagnostic.code] = (counts[diagnostic.code] ?? 0) + 1;
  }
  return counts;
}

export function compareLintBaseline(actual, expected) {
  const ruleNames = [...new Set([...Object.keys(actual), ...Object.keys(expected)])].toSorted();
  return ruleNames.flatMap((rule) => {
    const actualCount = actual[rule] ?? 0;
    const expectedCount = expected[rule] ?? 0;
    return actualCount === expectedCount
      ? []
      : [{ rule, actual: actualCount, expected: expectedCount }];
  });
}

function run() {
  const result = spawnSync("pnpm", LINT_ARGS, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    process.stderr.write("Lint baseline check could not parse Oxlint JSON output.\n");
    process.stderr.write(result.stdout);
    process.exit(1);
  }

  const actual = countDiagnosticsByRule(report.diagnostics ?? []);
  const expected = codeQuality.lintWarningBaseline;
  const differences = compareLintBaseline(actual, expected);

  if (differences.length > 0) {
    for (const difference of differences) {
      const direction = difference.actual > difference.expected ? "increased" : "decreased";
      process.stderr.write(
        `${difference.rule}: ${direction} from ${difference.expected} to ${difference.actual}. ` +
          "Fix the regression or update config/code-quality.json after an intentional improvement.\n",
      );
    }
    process.exit(1);
  }

  const total = Object.values(actual).reduce((sum, count) => sum + count, 0);
  process.stdout.write(
    `Lint warning baseline matched: ${total} warnings across ${Object.keys(actual).length} rules.\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
