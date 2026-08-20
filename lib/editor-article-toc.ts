import type { ArticleTocHeading } from "./article-toc";

function slugifyHeading(text: string): string {
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

function validId(element: HTMLElement): string | null {
  const id = element.id.trim();
  return id && !/\s/.test(id) ? id : null;
}

function uniqueId(base: string, reservedIds: Set<string>): string {
  if (!reservedIds.has(base)) return base;

  let suffix = 2;
  while (reservedIds.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function collectEditorArticleToc(root: HTMLElement): ArticleTocHeading[] {
  const elements = Array.from(root.querySelectorAll<HTMLHeadingElement>("h2, h3"));
  const futureIds = new Map<string, number>();
  const usedIds = new Set<string>();

  for (const element of elements) {
    const id = validId(element);
    if (id) futureIds.set(id, (futureIds.get(id) ?? 0) + 1);
  }

  const headings: ArticleTocHeading[] = [];
  for (const element of elements) {
    const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;

    const existingId = validId(element);
    if (existingId) {
      const remaining = (futureIds.get(existingId) ?? 1) - 1;
      if (remaining > 0) futureIds.set(existingId, remaining);
      else futureIds.delete(existingId);
    }

    const reservedIds = new Set([...usedIds, ...futureIds.keys()]);
    const preferredId = existingId ?? slugifyHeading(text);
    const id =
      existingId && !usedIds.has(existingId) ? existingId : uniqueId(preferredId, reservedIds);
    usedIds.add(id);

    element.id = id;
    element.dataset.tocId = id;
    headings.push({ id, level: element.tagName === "H2" ? 2 : 3, text });
  }

  return headings;
}
