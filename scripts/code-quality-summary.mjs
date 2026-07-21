import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const reportDir = path.resolve(process.argv[2] ?? "reports/code-quality");
const readJson = async (...parts) =>
  JSON.parse(await readFile(path.join(reportDir, ...parts), "utf8"));

const sections = await Promise.all(
  ["production", "tests", "tooling"].map(async (name) => ({
    name,
    scc: await readJson(`scc-${name}-report.json`),
  })),
);
const productionJscpd = await readJson("jscpd", "production", "jscpd-report.json");
const testJscpd = await readJson("jscpd", "tests", "jscpd-report.json");

const sum = (languages, key) =>
  languages.reduce((total, language) => total + (language[key] ?? 0), 0);
const number = new Intl.NumberFormat("en-US");
const percent = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const generatedAt = new Date(productionJscpd.statistics.detectionDate);
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
  "- Raw JSON files are stored beside the HTML reports.",
  "",
];

await writeFile(path.join(reportDir, "summary.md"), lines.join("\n"), "utf8");
