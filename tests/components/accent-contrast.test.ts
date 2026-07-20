import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const globals = readFileSync("app/globals.css", "utf8");
const editor = readFileSync("app/editor.css", "utf8");

function extractBlock(source: string, selector: string, startAt = 0): string {
  const selectorIndex = source.indexOf(selector, startAt);
  if (selectorIndex === -1) {
    throw new Error(`Missing CSS block: ${selector}`);
  }

  const blockStart = source.indexOf("{", selectorIndex + selector.length);
  if (blockStart === -1) {
    throw new Error(`Missing opening brace for CSS block: ${selector}`);
  }

  let depth = 0;
  for (let index = blockStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(blockStart + 1, index);
  }

  throw new Error(`Missing closing brace for CSS block: ${selector}`);
}

function readToken(block: string, token: string, resolving = new Set<string>()): string {
  if (resolving.has(token)) {
    throw new Error(`Circular CSS variable reference: ${token}`);
  }

  const match = block.match(new RegExp(`--${token}:\\s*([^;]+);`));
  if (!match) {
    throw new Error(`Missing CSS variable: --${token}`);
  }

  const value = match[1].trim();
  const reference = value.match(/^var\(--([a-z0-9-]+)\)$/i);
  if (!reference) return value;

  const nextResolving = new Set(resolving).add(token);
  return readToken(block, reference[1], nextResolving);
}

function relativeLuminance(hex: string): number {
  const normalized = hex.replace(/^#/, "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((digit) => `${digit}${digit}`)
          .join("")
      : normalized;

  if (!/^[0-9a-f]{6}$/i.test(expanded)) {
    throw new Error(`Expected a hex color, received: ${hex}`);
  }

  const [red, green, blue] = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(expanded.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function collectTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectTsxFiles(path);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [path] : [];
  });
}

describe("solid editor accent foregrounds", () => {
  it("meet WCAG AA contrast in every theme scope", () => {
    const darkMedia = extractBlock(globals, "@media (prefers-color-scheme: dark)");
    const scopes = [
      ["light default", extractBlock(globals, ":root")],
      ["dark default", extractBlock(darkMedia, ":root")],
      ["editorial", extractBlock(globals, '[data-theme="editorial"]')],
      ["terminal", extractBlock(globals, '[data-theme="terminal"]')],
      ["editor floating menu", extractBlock(editor, ".editor-floating-menu")],
    ] as const;

    for (const [name, block] of scopes) {
      const accent = readToken(block, "editor-accent");
      const foreground = readToken(block, "editor-accent-ink");
      const ratio = contrastRatio(accent, foreground);
      expect(ratio, `${name}: ${foreground} on ${accent}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("does not pair a solid accent background with hardcoded white on one line", () => {
    const solidAccent = /bg-\[var\(--editor-accent\)\](?!\/)/;
    const hardcodedWhite = /text-white|text-\[#fff(?:[0-9a-f]{3})?\]/i;
    const offenders: string[] = [];

    for (const file of ["app", "components", "lib"].flatMap(collectTsxFiles)) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        if (solidAccent.test(line) && hardcodedWhite.test(line)) {
          offenders.push(`${file}:${index + 1}`);
        }
      });
    }

    // This intentionally guards same-line Tailwind class composition. Cross-line or
    // variable-indirected foregrounds remain covered by the 45-site manual audit.
    expect(offenders).toEqual([]);
  });
});
