import { rehype } from "rehype";

export type ArticleTocHeading = {
  id: string;
  level: 2 | 3;
  text: string;
};

type HastNode = {
  type?: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

function textContent(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  if (!Array.isArray(node.children)) return "";
  return node.children.map(textContent).join("");
}

function visitElements(node: HastNode, visitor: (element: HastNode) => void): void {
  if (node.type === "element") visitor(node);
  if (!Array.isArray(node.children)) return;
  for (const child of node.children) visitElements(child, visitor);
}

function headingLevel(node: HastNode): 2 | 3 | null {
  if (node.tagName === "h2") return 2;
  if (node.tagName === "h3") return 3;
  return null;
}

function stringId(node: HastNode): string | null {
  const id = node.properties?.id;
  if (typeof id !== "string") return null;
  const normalized = id.trim();
  return normalized && !/\s/.test(normalized) ? normalized : null;
}

export function slugifyArticleHeading(text: string): string {
  return (
    text
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase("zh-CN")
      .replace(/[’']/g, "")
      .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

function uniqueId(base: string, usedIds: Set<string>): string {
  if (!usedIds.has(base)) return base;

  let suffix = 2;
  while (usedIds.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export async function addArticleTocToHtml(html: string): Promise<{
  html: string;
  headings: ArticleTocHeading[];
}> {
  if (!html || !/<h[23]\b/i.test(html)) return { html, headings: [] };

  const headings: ArticleTocHeading[] = [];

  const addHeadingAnchors = () => (tree: HastNode) => {
    const usedIds = new Set<string>();
    const futureHeadingIds = new Map<string, number>();

    // IDs on non-TOC elements are reserved so generated heading anchors remain valid HTML IDs.
    visitElements(tree, (element) => {
      const id = stringId(element);
      if (!id) return;

      if (headingLevel(element) === null) {
        usedIds.add(id);
        return;
      }

      futureHeadingIds.set(id, (futureHeadingIds.get(id) ?? 0) + 1);
    });

    visitElements(tree, (element) => {
      const level = headingLevel(element);
      if (level === null) return;

      const text = textContent(element).replace(/\s+/g, " ").trim();
      if (!text) return;

      const existingId = stringId(element);
      if (existingId) {
        const remaining = (futureHeadingIds.get(existingId) ?? 1) - 1;
        if (remaining > 0) futureHeadingIds.set(existingId, remaining);
        else futureHeadingIds.delete(existingId);
      }

      const reservedIds = new Set([...usedIds, ...futureHeadingIds.keys()]);
      const preferredId = existingId ?? slugifyArticleHeading(text);
      const id =
        existingId && !usedIds.has(existingId) ? existingId : uniqueId(preferredId, reservedIds);
      usedIds.add(id);

      element.properties ??= {};
      element.properties.id = id;
      element.properties.dataTocId = id;
      headings.push({ id, level, text });
    });
  };

  const file = await rehype()
    .data("settings", { fragment: true })
    .use(addHeadingAnchors)
    .process(html);

  return { html: String(file), headings };
}
