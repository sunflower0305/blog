import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const reportDir = path.resolve(process.argv[2] ?? "reports/code-quality");
const readJson = async (...parts) =>
  JSON.parse(await readFile(path.join(reportDir, ...parts), "utf8"));
const readOptionalJson = async (...parts) => {
  try {
    return await readJson(...parts);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
};

const sections = await Promise.all(
  ["production", "tests", "tooling"].map(async (name) => ({
    name,
    scc: await readJson(`scc-${name}-report.json`),
  })),
);
const productionJscpd = await readJson("jscpd", "production", "jscpd-report.json");
const testJscpd = await readJson("jscpd", "tests", "jscpd-report.json");
const coverage = await readOptionalJson("coverage", "coverage-summary.json");
const knip = await readOptionalJson("knip", "knip-report.json");

const sum = (languages, key) =>
  languages.reduce((total, language) => total + (language[key] ?? 0), 0);
const number = new Intl.NumberFormat("en-US");
const percent = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const generatedAt = new Date(productionJscpd.statistics.detectionDate);
const countKnipIssues = (key) =>
  knip?.issues.reduce((total, issue) => total + (issue[key]?.length ?? 0), 0) ?? 0;
const sectionLabel = {
  production: "Production",
  tests: "Tests",
  tooling: "Tooling",
};

const duplicateRows = (report) =>
  [...report.duplicates]
    .sort((left, right) => right.lines - left.lines)
    .slice(0, 10)
    .map(
      (clone) =>
        `| ${clone.lines} | \`${clone.firstFile.name}:${clone.firstFile.start}\` | \`${clone.secondFile.name}:${clone.secondFile.start}\` |`,
    );

const lines = [
  "# Code quality report",
  "",
  `Generated: ${generatedAt.toISOString()}`,
  "",
  "## Scope summary",
  "",
  "| Scope | Files | Lines of code | Complexity | Duplicate blocks | Duplicated lines |",
  "| --- | ---: | ---: | ---: | ---: | ---: |",
  ...sections.map(({ name, scc }) => {
    const duplication =
      name === "production"
        ? productionJscpd.statistics.total
        : name === "tests"
          ? testJscpd.statistics.total
          : null;
    return `| ${sectionLabel[name]} | ${number.format(sum(scc, "Count"))} | ${number.format(sum(scc, "Code"))} | ${number.format(sum(scc, "Complexity"))} | ${duplication ? number.format(duplication.clones) : "—"} | ${duplication ? `${number.format(duplication.duplicatedLines)} (${percent.format(duplication.percentage)}%)` : "—"} |`;
  }),
  "",
  "Production covers `app/`, `components/`, `lib/`, and `tools/wechat-bridge/`. Tests cover `tests/`. Tooling covers `scripts/` and root build configuration. The 6% duplication gate applies only to production code; test duplication is report-only.",
  "",
  "## Additional quality signals",
  "",
  "| Signal | Result |",
  "| --- | ---: |",
  ...(coverage
    ? [
        `| Coverage — statements | ${percent.format(coverage.total.statements.pct)}% |`,
        `| Coverage — branches | ${percent.format(coverage.total.branches.pct)}% |`,
        `| Coverage — functions | ${percent.format(coverage.total.functions.pct)}% |`,
        `| Coverage — lines | ${percent.format(coverage.total.lines.pct)}% |`,
      ]
    : ["| Coverage | Not generated |"]),
  ...(knip
    ? [
        `| Knip — unused files | ${number.format(countKnipIssues("files"))} |`,
        `| Knip — unused exports | ${number.format(countKnipIssues("exports"))} |`,
        `| Knip — unused exported types | ${number.format(countKnipIssues("types"))} |`,
        `| Knip — dependency issues | ${number.format(countKnipIssues("dependencies") + countKnipIssues("devDependencies") + countKnipIssues("unlisted"))} |`,
      ]
    : ["| Knip | Not generated |"]),
  "",
  "## Production languages",
  "",
  "| Language | Files | Code | Comments | Complexity |",
  "| --- | ---: | ---: | ---: | ---: |",
  ...sections[0].scc.map(
    (language) =>
      `| ${language.Name} | ${number.format(language.Count)} | ${number.format(language.Code)} | ${number.format(language.Comment)} | ${number.format(language.Complexity)} |`,
  ),
  "",
  "## Largest production duplicate blocks",
  "",
  "| Lines | First location | Second location |",
  "| ---: | --- | --- |",
  ...duplicateRows(productionJscpd),
  "",
  "## Largest test duplicate blocks",
  "",
  "| Lines | First location | Second location |",
  "| ---: | --- | --- |",
  ...duplicateRows(testJscpd),
  "",
  "## Detailed reports",
  "",
  "- Production: [scc HTML](./scc-production-report.html), [jscpd HTML](./jscpd/production/jscpd-report.html), [jscpd Markdown](./jscpd/production/jscpd-report.md)",
  "- Tests: [scc HTML](./scc-tests-report.html), [jscpd HTML](./jscpd/tests/jscpd-report.html), [jscpd Markdown](./jscpd/tests/jscpd-report.md)",
  "- Tooling: [scc HTML](./scc-tooling-report.html)",
  "- Coverage: [HTML](./coverage/index.html), raw summary in `coverage/coverage-summary.json`",
  "- Knip: [unused code Markdown](./knip/knip-report.md), [cycles Markdown](./knip/knip-cycles-report.md)",
  "- Secrets: raw Gitleaks JSON in `gitleaks-report.json`",
  "- Raw JSON files are stored beside the HTML reports.",
  "",
];

await writeFile(path.join(reportDir, "summary.md"), lines.join("\n"), "utf8");
