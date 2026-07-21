#!/usr/bin/env node

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseSync, visitorKeys } from "oxc-parser";

const DEFAULT_MAX_FILE_LINES = 1000;
const DEFAULT_MAX_FUNCTION_LINES = 100;
const SOURCE_ROOTS = ["app", "components", "lib", "tools/wechat-bridge", "tests", "scripts"];
const SOURCE_EXTENSIONS = new Set([".cjs", ".js", ".jsx", ".mjs", ".sh", ".ts", ".tsx"]);
const PARSED_EXTENSIONS = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const FUNCTION_TYPES = new Set([
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression",
]);

const usage = `Usage: node scripts/code-size-report.mjs [options]

Options:
  --check                       Exit with status 1 when a threshold is exceeded
  --max-file-lines <number>     File line limit (default: ${DEFAULT_MAX_FILE_LINES})
  --max-function-lines <number> Function line limit (default: ${DEFAULT_MAX_FUNCTION_LINES})
  --json-output <path>          Write the complete report as JSON
  -h, --help                    Show this help`;

function parsePositiveInteger(value, option) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${option} must be a positive integer, received: ${value}`);
  }
  return parsed;
}

function parseArguments(argv) {
  const options = {
    check: false,
    jsonOutput: null,
    maxFileLines: DEFAULT_MAX_FILE_LINES,
    maxFunctionLines: DEFAULT_MAX_FUNCTION_LINES,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") {
      options.check = true;
    } else if (argument === "--max-file-lines") {
      options.maxFileLines = parsePositiveInteger(argv[++index], argument);
    } else if (argument === "--max-function-lines") {
      options.maxFunctionLines = parsePositiveInteger(argv[++index], argument);
    } else if (argument === "--json-output") {
      options.jsonOutput = argv[++index];
      if (!options.jsonOutput) throw new Error(`${argument} requires a path`);
    } else if (argument === "-h" || argument === "--help") {
      console.log(usage);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  return options;
}

async function collectSourceFiles(rootDirectory) {
  const files = [];

  async function visit(relativeDirectory) {
    const absoluteDirectory = path.join(rootDirectory, relativeDirectory);
    let entries;
    try {
      entries = await readdir(absoluteDirectory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }

    for (const entry of entries) {
      const relativePath = path.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        await visit(relativePath);
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(relativePath);
      }
    }
  }

  for (const sourceRoot of SOURCE_ROOTS) await visit(sourceRoot);
  return files.sort((left, right) => left.localeCompare(right));
}

function countLines(source) {
  if (source.length === 0) return 0;
  const newlineCount = source.match(/\n/g)?.length ?? 0;
  return newlineCount + (source.endsWith("\n") ? 0 : 1);
}

function createLineLookup(source) {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) starts.push(index + 1);
  }

  return (offset) => {
    let low = 0;
    let high = starts.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (starts[middle] <= offset) low = middle + 1;
      else high = middle;
    }
    return low;
  };
}

function propertyName(node) {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal") return String(node.value);
  return null;
}

function functionName(node, parent) {
  if (node.id?.name) return node.id.name;
  if (parent?.type === "VariableDeclarator") return propertyName(parent.id) ?? "<anonymous>";
  if (
    parent?.type === "Property" ||
    parent?.type === "PropertyDefinition" ||
    parent?.type === "MethodDefinition"
  ) {
    return propertyName(parent.key) ?? "<computed>";
  }
  return "<anonymous>";
}

function inspectFunctions(file, source, maxFunctionLines) {
  const result = parseSync(file, source);
  const parseErrors = result.errors.filter((error) => error.severity === "Error");
  if (parseErrors.length > 0) {
    return {
      functions: [],
      errors: parseErrors.map((error) => `${file}: ${error.message}`),
    };
  }

  const lineAt = createLineLookup(source);
  const functions = [];

  function visit(node, parent = null) {
    if (!node || typeof node !== "object" || typeof node.type !== "string") return;

    if (FUNCTION_TYPES.has(node.type) && node.body) {
      const startLine = lineAt(node.start);
      const endLine = lineAt(Math.max(node.start, node.end - 1));
      const lines = endLine - startLine + 1;
      if (lines > maxFunctionLines) {
        functions.push({
          file,
          line: startLine,
          lines,
          name: functionName(node, parent),
        });
      }
    }

    for (const key of visitorKeys[node.type] ?? []) {
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) visit(item, node);
      } else {
        visit(child, node);
      }
    }
  }

  visit(result.program);
  return { functions, errors: [] };
}

function printRows(title, rows, formatRow) {
  console.log(`\n${title} (${rows.length})`);
  if (rows.length === 0) {
    console.log("  None");
    return;
  }
  for (const row of rows) console.log(`  ${formatRow(row)}`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const repositoryRoot = path.resolve(import.meta.dirname, "..");
  const files = await collectSourceFiles(repositoryRoot);
  const largeFiles = [];
  const largeFunctions = [];
  const parseErrors = [];

  for (const file of files) {
    const absolutePath = path.join(repositoryRoot, file);
    const fileStats = await stat(absolutePath);
    if (!fileStats.isFile()) continue;
    const source = await readFile(absolutePath, "utf8");
    const lines = countLines(source);
    if (lines > options.maxFileLines) largeFiles.push({ file, lines });

    if (PARSED_EXTENSIONS.has(path.extname(file))) {
      const inspection = inspectFunctions(file, source, options.maxFunctionLines);
      largeFunctions.push(...inspection.functions);
      parseErrors.push(...inspection.errors);
    }
  }

  largeFiles.sort((left, right) => right.lines - left.lines || left.file.localeCompare(right.file));
  largeFunctions.sort(
    (left, right) =>
      right.lines - left.lines || left.file.localeCompare(right.file) || left.line - right.line,
  );

  console.log("Code size report");
  console.log(`Scanned ${files.length} source files`);
  console.log(
    `Thresholds: files > ${options.maxFileLines} lines, functions > ${options.maxFunctionLines} lines`,
  );
  printRows("Large files", largeFiles, (row) => `${row.lines} lines  ${row.file}`);
  printRows(
    "Large functions",
    largeFunctions,
    (row) => `${row.lines} lines  ${row.file}:${row.line}  ${row.name}`,
  );

  if (options.jsonOutput) {
    const outputPath = path.resolve(repositoryRoot, options.jsonOutput);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          scannedFiles: files.length,
          thresholds: {
            fileLines: options.maxFileLines,
            functionLines: options.maxFunctionLines,
          },
          largeFiles,
          largeFunctions,
          parseErrors,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  if (parseErrors.length > 0) {
    console.error(`\nParse errors (${parseErrors.length})`);
    for (const error of parseErrors) console.error(`  ${error}`);
    process.exitCode = 2;
  } else if (options.check && (largeFiles.length > 0 || largeFunctions.length > 0)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 2;
});
