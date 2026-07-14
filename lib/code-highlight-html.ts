import { rehype } from "rehype";
import rehypeHighlight from "rehype-highlight";
import {
  CODE_HIGHLIGHT_ALIASES,
  CODE_HIGHLIGHT_LANGUAGES,
  DEFAULT_CODE_LANGUAGE,
} from "./code-highlighting";

type HastNode = {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

const SKIP_CLASS = "code-highlight-skip";
const LANGUAGE_PREFIX = "language-";

function visitCodeBlocks(node: HastNode, visitor: (code: HastNode) => void): void {
  if (!Array.isArray(node.children)) return;

  for (const child of node.children) {
    if (
      child.type === "element" &&
      child.tagName === "code" &&
      node.type === "element" &&
      node.tagName === "pre"
    ) {
      visitor(child);
    }

    visitCodeBlocks(child, visitor);
  }
}

function classNames(node: HastNode): string[] {
  const value = node.properties?.className;
  return Array.isArray(value) ? value.map(String) : [];
}

function setClassNames(node: HastNode, names: string[]): void {
  node.properties ??= {};
  node.properties.className = names;
}

function prepareCodeBlocks() {
  return (tree: HastNode) => {
    visitCodeBlocks(tree, (code) => {
      const names = classNames(code);
      if (names.includes("nohighlight") || names.includes("no-highlight")) return;

      const languageIndex = names.findIndex((name) => name.startsWith(LANGUAGE_PREFIX));
      const language =
        languageIndex === -1 ? undefined : names[languageIndex].slice(LANGUAGE_PREFIX.length);

      if (
        names.includes("hljs") ||
        (language && language !== "ts" && language !== DEFAULT_CODE_LANGUAGE)
      ) {
        setClassNames(code, [...names, SKIP_CLASS, "no-highlight"]);
        return;
      }

      if (language === "ts") {
        names[languageIndex] = `${LANGUAGE_PREFIX}${DEFAULT_CODE_LANGUAGE}`;
      } else if (!language) {
        names.push(`${LANGUAGE_PREFIX}${DEFAULT_CODE_LANGUAGE}`);
      }

      setClassNames(code, names);
    });
  };
}

function cleanupSkippedCodeBlocks() {
  return (tree: HastNode) => {
    visitCodeBlocks(tree, (code) => {
      const names = classNames(code);
      if (!names.includes(SKIP_CLASS)) return;
      setClassNames(
        code,
        names.filter((name) => name !== SKIP_CLASS && name !== "no-highlight"),
      );
    });
  };
}

export async function highlightCodeBlocksInHtml(html: string): Promise<string> {
  if (!html || !/<code\b/i.test(html)) return html;

  try {
    const file = await rehype()
      .data("settings", { fragment: true })
      .use(prepareCodeBlocks)
      .use(rehypeHighlight, {
        aliases: CODE_HIGHLIGHT_ALIASES,
        detect: false,
        languages: CODE_HIGHLIGHT_LANGUAGES,
      })
      .use(cleanupSkippedCodeBlocks)
      .process(html);

    return String(file);
  } catch (error) {
    console.error("Failed to highlight article code blocks", error);
    return html;
  }
}
