import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = path.join(repoRoot, "config/runtime-env.json");

export function readRuntimeEnvContract(filePath = contractPath) {
  const contract = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const keys = new Set();

  for (const variable of contract.variables ?? []) {
    if (!variable.key || keys.has(variable.key)) {
      throw new Error(`Invalid or duplicate runtime env key: ${variable.key ?? "<missing>"}`);
    }
    if (variable.cloudflareDeploy && !variable.description) {
      throw new Error(`Cloudflare Deploy variable requires a description: ${variable.key}`);
    }
    keys.add(variable.key);
  }

  return contract;
}

export function renderEnvExample(contract) {
  const variablesByGroup = new Map();
  for (const variable of contract.variables) {
    const group = variable.group ?? "core";
    const values = variablesByGroup.get(group) ?? [];
    values.push(variable);
    variablesByGroup.set(group, values);
  }

  const lines = [];
  for (const group of contract.groups ?? []) {
    const variables = variablesByGroup.get(group.id) ?? [];
    if (variables.length === 0) continue;
    if (lines.length > 0) lines.push("");
    if (group.title) lines.push(`# ${group.title}`);
    for (const variable of variables) {
      const value = variable.defaults?.envExample ?? variable.example ?? "";
      lines.push(`${variable.key}=${value}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function validateCloudflareDeployBindings(contract, packageJson) {
  const errors = [];
  const actualBindings = packageJson.cloudflare?.bindings ?? {};
  const expectedBindings = Object.fromEntries(
    contract.variables
      .filter((variable) => variable.cloudflareDeploy)
      .map((variable) => [variable.key, { description: variable.description }]),
  );

  for (const [key, expected] of Object.entries(expectedBindings)) {
    const actual = actualBindings[key];
    if (!actual) {
      errors.push(`package.json cloudflare.bindings.${key} is missing`);
    } else if (actual.description !== expected.description) {
      errors.push(`package.json cloudflare.bindings.${key}.description must match the contract`);
    }
  }

  for (const key of Object.keys(actualBindings)) {
    if (!(key in expectedBindings)) {
      errors.push(
        `package.json cloudflare.bindings.${key} is not declared for Cloudflare Deploy in the contract`,
      );
    }
  }

  return errors;
}

function parseWranglerVars(source) {
  const vars = {};
  let section = "";
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;
    const table = line.match(/^\[([^\]]+)\]$/);
    if (table) {
      section = table[1];
      continue;
    }
    if (section !== "vars") continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"((?:\\"|[^"])*)"$/);
    if (match) vars[match[1]] = match[2].replace(/\\"/g, '"');
  }
  return vars;
}

export function validateRuntimeEnvFiles(
  contract,
  { envExamplePath, wranglerPath, packageJsonPath },
) {
  const errors = [];
  const expectedExample = renderEnvExample(contract);
  const actualExample = fs.readFileSync(envExamplePath, "utf8");
  if (actualExample !== expectedExample) {
    errors.push(
      `${path.relative(repoRoot, envExamplePath)} is not generated from config/runtime-env.json`,
    );
  }

  const wranglerVars = parseWranglerVars(fs.readFileSync(wranglerPath, "utf8"));
  const expectedWranglerVars = Object.fromEntries(
    contract.variables
      .filter((variable) => variable.wranglerVar)
      .map((variable) => [variable.key, variable.defaults?.wrangler ?? ""]),
  );

  for (const [key, expected] of Object.entries(expectedWranglerVars)) {
    if (wranglerVars[key] !== expected) {
      errors.push(
        `wrangler.toml [vars].${key} must equal contract default ${JSON.stringify(expected)}`,
      );
    }
  }

  const managedKeys = new Set(contract.variables.map((variable) => variable.key));
  for (const key of Object.keys(wranglerVars)) {
    if (managedKeys.has(key) && !(key in expectedWranglerVars)) {
      errors.push(
        `wrangler.toml [vars].${key} is managed by the contract but not allowed as a default`,
      );
    }
  }

  if (packageJsonPath) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    errors.push(...validateCloudflareDeployBindings(contract, packageJson));
  }

  return errors;
}

function usage() {
  console.error("Usage: node scripts/runtime-env-config.mjs <generate-env-example|validate>");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  const contract = readRuntimeEnvContract();
  const envExamplePath = path.join(repoRoot, ".env.example");
  const wranglerPath = path.join(repoRoot, "wrangler.toml");
  const packageJsonPath = path.join(repoRoot, "package.json");

  if (command === "generate-env-example") {
    fs.writeFileSync(envExamplePath, renderEnvExample(contract));
  } else if (command === "validate") {
    const errors = validateRuntimeEnvFiles(contract, {
      envExamplePath,
      wranglerPath,
      packageJsonPath,
    });
    if (errors.length > 0) {
      for (const error of errors) console.error(`❌ ${error}`);
      process.exit(1);
    }
    console.log("Runtime environment contract is in sync.");
  } else {
    usage();
    process.exit(1);
  }
}
