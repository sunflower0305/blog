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
    sloc: await readJson(`sloc-${name}-report.json`),
  })),
);
const productionJscpd = await readJson("jscpd", "production", "jscpd-report.json");
const testJscpd = await readJson("jscpd", "tests", "jscpd-report.json");
const coverage = await readOptionalJson("coverage", "coverage-summary.json");
const knip = await readOptionalJson("knip", "knip-report.json");
const gitleaks = await readOptionalJson("gitleaks-report.json");
const lint = await readOptionalJson("lint-report.json");

const number = new Intl.NumberFormat("en-US");
const percent = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const generatedAt = new Date(productionJscpd.statistics.detectionDate);
const countKnipIssues = (key) =>
  knip?.issues.reduce((total, issue) => total + (issue[key]?.length ?? 0), 0) ?? 0;
const knipDependencyIssues =
  knip?.issues.flatMap((issue) =>
    [
      ["dependencies", "Unused dependency"],
      ["devDependencies", "Unused devDependency"],
      ["unlisted", "Unlisted dependency"],
    ].flatMap(([key, type]) =>
      (issue[key] ?? []).map((entry) => ({
        name: entry.name,
        location: `${issue.file}:${entry.line}:${entry.col}`,
        type,
      })),
    ),
  ) ?? [];
const collectKnipIssues = (key, type) =>
  knip?.issues.flatMap((issue) =>
    (issue[key] ?? []).map((entry) => ({
      location:
        key === "files"
          ? issue.file
          : `${issue.file}${entry.line === undefined ? "" : `:${entry.line}${entry.col === undefined ? "" : `:${entry.col}`}`}`,
      name: entry.name ?? issue.file,
      type,
    })),
  ) ?? [];
const knipUnusedIssues = [
  ...collectKnipIssues("files", "Unused file"),
  ...collectKnipIssues("exports", "Unused export"),
  ...collectKnipIssues("types", "Unused exported type"),
];
const escapeTableText = (value) =>
  String(value ?? "—")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
const sectionLabel = {
  production: "Production",
  tests: "Tests",
  tooling: "Tooling",
};
const extensionRows = (report) =>
  Object.entries(report.byExt)
    .sort(([, left], [, right]) => right.summary.source - left.summary.source)
    .map(
      ([extension, details]) =>
        `| ${extension} | ${number.format(details.files.length)} | ${number.format(details.summary.total)} | ${number.format(details.summary.source)} | ${number.format(details.summary.comment)} | ${number.format(details.summary.empty)} |`,
    );
const diagnosticsFor = (code) =>
  lint?.diagnostics.filter((diagnostic) => diagnostic.code === code) ?? [];
const complexityDiagnostics = diagnosticsFor("eslint(complexity)");
const maxDepthDiagnostics = diagnosticsFor("eslint(max-depth)");
const largeFileDiagnostics = diagnosticsFor("eslint(max-lines)");
const largeFunctionDiagnostics = diagnosticsFor("eslint(max-lines-per-function)");
const maxParamsDiagnostics = diagnosticsFor("eslint(max-params)");
const dependencyCycleDiagnostics = diagnosticsFor("import(no-cycle)");
const floatingPromiseDiagnostics = diagnosticsFor("typescript(no-floating-promises)");
const misusedPromiseDiagnostics = diagnosticsFor("typescript(no-misused-promises)");
const displayedPromiseDiagnostics = [
  ...floatingPromiseDiagnostics.slice(0, 10),
  ...misusedPromiseDiagnostics.slice(0, 10),
];
const lineCountValue = (diagnostic) =>
  Number.parseInt(diagnostic.message.match(/too many lines \((\d+)\)/)?.[1] ?? "0", 10);
const diagnosticLocation = (diagnostic) => {
  const line = diagnostic.labels[0]?.span.line;
  return `${diagnostic.filename}${line === undefined ? "" : `:${line}`}`;
};
const complexityValue = (diagnostic) =>
  Number.parseInt(diagnostic.message.match(/complexity of (\d+)/)?.[1] ?? "0", 10);
const complexityRows = complexityDiagnostics
  .toSorted((left, right) => complexityValue(right) - complexityValue(left))
  .slice(0, 20)
  .map((diagnostic) => {
    const line = diagnostic.labels[0]?.span.line ?? 1;
    return `| ${number.format(complexityValue(diagnostic))} | \`${diagnostic.filename}:${line}\` | ${diagnostic.message} |`;
  });

const duplicateRows = (report) =>
  [...report.duplicates]
    .sort((left, right) => right.lines - left.lines)
    .slice(0, 10)
    .map(
      (clone) =>
        `| ${clone.lines} | \`${clone.firstFile.name}:${clone.firstFile.start}\` | \`${clone.secondFile.name}:${clone.secondFile.start}\` |`,
    );

const sizeRows = (diagnostics) =>
  diagnostics
    .toSorted((left, right) => lineCountValue(right) - lineCountValue(left))
    .slice(0, 20)
    .map(
      (diagnostic) =>
        `| ${number.format(lineCountValue(diagnostic))} | \`${diagnosticLocation(diagnostic)}\` | ${escapeTableText(diagnostic.message)} |`,
    );

const diagnosticLabel = {
  "eslint(max-depth)": "Nested blocks",
  "eslint(max-params)": "Function parameters",
  "import(no-cycle)": "Dependency cycle",
  "typescript(no-floating-promises)": "Floating Promise",
  "typescript(no-misused-promises)": "Misused Promise",
};
const diagnosticRows = (diagnostics, limit = 20) =>
  diagnostics
    .slice(0, limit)
    .map(
      (diagnostic) =>
        `| ${diagnosticLabel[diagnostic.code] ?? diagnostic.code} | \`${diagnosticLocation(diagnostic)}\` | ${escapeTableText(diagnostic.message)} |`,
    );

const lines = [
  "# Code quality report",
  "",
  `Generated: ${generatedAt.toISOString()}`,
  "",
  "## Scope summary",
  "",
  "| Scope | Files | Physical lines | Code lines | Comment lines | Blank lines | Duplicate blocks | Duplicated lines |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ...sections.map(({ name, sloc }) => {
    const duplication =
      name === "production"
        ? productionJscpd.statistics.total
        : name === "tests"
          ? testJscpd.statistics.total
          : null;
    return `| ${sectionLabel[name]} | ${number.format(sloc.files.length)} | ${number.format(sloc.summary.total)} | ${number.format(sloc.summary.source)} | ${number.format(sloc.summary.comment)} | ${number.format(sloc.summary.empty)} | ${duplication ? number.format(duplication.clones) : "—"} | ${duplication ? `${number.format(duplication.duplicatedLines)} (${percent.format(duplication.percentage)}%)` : "—"} |`;
  }),
  "",
  "Code lines exclude comment-only and blank lines. Lines containing both code and comments appear in both Code lines and Comment lines, so the columns are not additive.",
  "",
  "Production covers `app/`, `components/`, `lib/`, and `tools/wechat-bridge/`. Tests cover `tests/`. Tooling covers `scripts/` and root build configuration. Oxlint reports complexity, size, nesting, parameter count, dependency cycles, and Promise safety. The 6% duplication gate applies only to production code; test duplication is report-only.",
  "",
  "## Quality signals",
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
        `| Knip — package dependency issues | ${number.format(knipDependencyIssues.length)} |`,
      ]
    : ["| Knip | Not generated |"]),
  ...(gitleaks
    ? [`| Gitleaks — findings | ${number.format(gitleaks.length)} |`]
    : ["| Gitleaks | Not generated |"]),
  ...(lint
    ? [
        `| Oxlint — complexity warnings | ${number.format(complexityDiagnostics.length)} |`,
        `| Oxlint — files over 600 lines | ${number.format(largeFileDiagnostics.length)} |`,
        `| Oxlint — functions over 300 lines | ${number.format(largeFunctionDiagnostics.length)} |`,
        `| Oxlint — nesting depth over 4 | ${number.format(maxDepthDiagnostics.length)} |`,
        `| Oxlint — functions over 5 parameters | ${number.format(maxParamsDiagnostics.length)} |`,
        `| Oxlint — circular imports | ${number.format(dependencyCycleDiagnostics.length)} |`,
        `| Oxlint — floating Promises | ${number.format(floatingPromiseDiagnostics.length)} |`,
        `| Oxlint — misused Promises | ${number.format(misusedPromiseDiagnostics.length)} |`,
      ]
    : ["| Oxlint complexity | Not generated |"]),
  ...(knipDependencyIssues.length > 0
    ? [
        "",
        "## Dependency issues",
        "",
        "| Type | Dependency | Location |",
        "| --- | --- | --- |",
        ...knipDependencyIssues.map(
          (issue) => `| ${issue.type} | \`${issue.name}\` | \`${issue.location}\` |`,
        ),
      ]
    : []),
  ...(knipUnusedIssues.length > 0
    ? [
        "",
        "## Unused code",
        "",
        "| Type | Symbol | Location |",
        "| --- | --- | --- |",
        ...knipUnusedIssues.map(
          (issue) => `| ${issue.type} | \`${issue.name}\` | \`${issue.location}\` |`,
        ),
      ]
    : []),
  ...(gitleaks?.length > 0
    ? [
        "",
        "## Secret findings",
        "",
        "| Rule | Description | Location | Commit |",
        "| --- | --- | --- | --- |",
        ...gitleaks.map((finding) => {
          const location = `${finding.File ?? "unknown"}${finding.StartLine === undefined ? "" : `:${finding.StartLine}`}`;
          const commit = finding.Commit ? finding.Commit.slice(0, 12) : "—";
          return `| ${escapeTableText(finding.RuleID)} | ${escapeTableText(finding.Description)} | \`${location}\` | \`${commit}\` |`;
        }),
      ]
    : []),
  "",
  "## Cyclomatic complexity",
  "",
  ...(lint
    ? [
        `Oxlint found ${number.format(complexityDiagnostics.length)} functions above the configured complexity threshold of 15.`,
        "",
        "| Complexity | Location | Diagnostic |",
        "| ---: | --- | --- |",
        ...(complexityRows.length > 0 ? complexityRows : ["| — | None | None |"]),
        ...(complexityDiagnostics.length > 20
          ? [
              "",
              `Showing the most complex 20 of ${number.format(complexityDiagnostics.length)} warnings. See \`lint-report.json\` for the complete list.`,
            ]
          : []),
      ]
    : ["Complexity report not generated. Run `pnpm run quality:report`."]),
  "",
  "## File and function size",
  "",
  ...(lint
    ? [
        `Oxlint found ${number.format(largeFileDiagnostics.length)} files over 600 lines and ${number.format(largeFunctionDiagnostics.length)} functions over 300 lines.`,
        "",
        "### Large files",
        "",
        "| Lines | Location | Diagnostic |",
        "| ---: | --- | --- |",
        ...(largeFileDiagnostics.length > 0
          ? sizeRows(largeFileDiagnostics)
          : ["| — | None | None |"]),
        "",
        "### Largest functions",
        "",
        "| Lines | Location | Diagnostic |",
        "| ---: | --- | --- |",
        ...(largeFunctionDiagnostics.length > 0
          ? sizeRows(largeFunctionDiagnostics)
          : ["| — | None | None |"]),
        ...(largeFunctionDiagnostics.length > 20
          ? [
              "",
              `Showing the largest 20 of ${number.format(largeFunctionDiagnostics.length)} functions. See \`lint-report.json\` for the complete list.`,
            ]
          : []),
      ]
    : ["Size report not generated. Run `pnpm run quality:report`."]),
  "",
  "## Structural maintainability",
  "",
  ...(lint
    ? [
        `Oxlint found ${number.format(maxDepthDiagnostics.length)} location${maxDepthDiagnostics.length === 1 ? "" : "s"} nested beyond 4 blocks and ${number.format(maxParamsDiagnostics.length)} functions with more than 5 parameters.`,
        "",
        "| Signal | Location | Diagnostic |",
        "| --- | --- | --- |",
        ...(maxDepthDiagnostics.length + maxParamsDiagnostics.length > 0
          ? diagnosticRows([...maxDepthDiagnostics, ...maxParamsDiagnostics])
          : ["| — | None | None |"]),
      ]
    : ["Structural maintainability report not generated. Run `pnpm run quality:report`."]),
  "",
  "## Dependency cycles",
  "",
  ...(lint
    ? [
        `Oxlint found ${number.format(dependencyCycleDiagnostics.length)} dependency cycles. Type-only and external imports are ignored.`,
        "",
        "| Signal | Location | Diagnostic |",
        "| --- | --- | --- |",
        ...(dependencyCycleDiagnostics.length > 0
          ? diagnosticRows(dependencyCycleDiagnostics)
          : ["| — | None | None |"]),
      ]
    : ["Dependency cycle report not generated. Run `pnpm run quality:report`."]),
  "",
  "## Promise safety",
  "",
  ...(lint
    ? [
        `Oxlint found ${number.format(floatingPromiseDiagnostics.length)} floating Promises and ${number.format(misusedPromiseDiagnostics.length)} misused Promises.`,
        "",
        "| Signal | Location | Diagnostic |",
        "| --- | --- | --- |",
        ...(displayedPromiseDiagnostics.length > 0
          ? diagnosticRows(displayedPromiseDiagnostics)
          : ["| — | None | None |"]),
        ...(floatingPromiseDiagnostics.length + misusedPromiseDiagnostics.length > 20
          ? [
              "",
              `Showing up to 10 diagnostics per Promise rule (${number.format(displayedPromiseDiagnostics.length)} of ${number.format(floatingPromiseDiagnostics.length + misusedPromiseDiagnostics.length)} total). See \`lint-report.json\` for the complete list.`,
            ]
          : []),
      ]
    : ["Promise safety report not generated. Run `pnpm run quality:report`."]),
  "",
  "## Production source extensions",
  "",
  "| Extension | Files | Physical lines | Code lines | Comment lines | Blank lines |",
  "| --- | ---: | ---: | ---: | ---: | ---: |",
  ...extensionRows(sections[0].sloc),
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
  "- Production: raw sloc JSON in `sloc-production-report.json`, [jscpd HTML](./jscpd/production/jscpd-report.html), [jscpd Markdown](./jscpd/production/jscpd-report.md)",
  "- Tests: raw sloc JSON in `sloc-tests-report.json`, [jscpd HTML](./jscpd/tests/jscpd-report.html), [jscpd Markdown](./jscpd/tests/jscpd-report.md)",
  "- Tooling: raw sloc JSON in `sloc-tooling-report.json`",
  "- Complexity, size, structure, dependency cycles, and Promise safety: raw Oxlint JSON in `lint-report.json`",
  "- Coverage: [HTML](./coverage/index.html), raw summary in `coverage/coverage-summary.json`",
  "- Knip: [unused code Markdown](./knip/knip-report.md), [cycles Markdown](./knip/knip-cycles-report.md)",
  ...(gitleaks ? ["- Secrets: raw Gitleaks JSON in `gitleaks-report.json`"] : []),
  "- Raw JSON files are stored beside the HTML reports.",
  "",
];

await writeFile(path.join(reportDir, "summary.md"), lines.join("\n"), "utf8");
