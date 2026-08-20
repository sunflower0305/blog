import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAutoDescription, optimizePostImageUrls } from "@/lib/post-utils";

const SITE_URL = "https://blog.zhangleyang.com";

describe("buildAutoDescription", () => {
  it("skips a leading Markdown image and uses the opening prose", () => {
    const content = [
      "![先看行为，再谈收益](https://blog.zhangleyang.com/api/images/image/2026/08/cover.png)",
      "",
      "科技基金套了两个月，我没有继续猜涨跌，而是先检查自己的交易行为。",
    ].join("\n");

    expect(buildAutoDescription(content)).toBe(
      "科技基金套了两个月，我没有继续猜涨跌，而是先检查自己的交易行为。",
    );
  });
});

describe("optimizePostImageUrls", () => {
  it("adds the article delivery variant to local static images", () => {
    const html = [
      '<img src="https://blog.zhangleyang.com/api/images/image/2026/07/architecture.png">',
      '<img src="/api/images/image/2026/07/workflow.jpg">',
    ].join("");

    expect(optimizePostImageUrls(html, SITE_URL)).toBe(
      [
        '<img src="https://blog.zhangleyang.com/api/images/image/2026/07/architecture.png?w=1600&q=85&format=auto">',
        '<img src="/api/images/image/2026/07/workflow.jpg?w=1600&q=85&format=auto">',
      ].join(""),
    );
  });

  it("upgrades legacy WebP variants while preserving images that cannot use this pipeline", () => {
    const html = [
      '<img src="/api/images/image/2026/07/ready.webp?w=960&amp;q=80&amp;format=webp">',
      '<img src="/api/images/image/2026/07/demo.gif">',
      '<img src="/api/images/image/2026/07/logo.svg">',
      '<img src="/api/images/image/2026/07/original.png?__raw=1">',
      '<img src="https://cdn.example.com/api/images/image/2026/07/external.png">',
    ].join("");

    expect(optimizePostImageUrls(html, SITE_URL)).toBe(html.replace("format=webp", "format=auto"));
  });

  it("leaves image URLs unchanged when the configured site URL is invalid", () => {
    const html = '<img src="/api/images/image/2026/07/architecture.png">';

    expect(optimizePostImageUrls(html, "not a URL")).toBe(html);
  });

  it("applies article transforms before the public rendering boundary", () => {
    const page = readFileSync("app/[slug]/page.tsx", "utf8");

    expect(page).toContain("const optimizedHtml = optimizePostImageUrls(post.html, getSiteUrl())");
    expect(page).toContain(
      "const highlightedHtml = await highlightCodeBlocksInHtml(optimizedHtml)",
    );
    expect(page).toContain("await addArticleTocToHtml(highlightedHtml)");
    expect(page).toContain("dangerouslySetInnerHTML={{ __html: deliveredHtml }}");
    expect(page).toContain("html={deliveredHtml}");
  });

  it("keeps article metadata close to the opening paragraph", () => {
    const page = readFileSync("app/[slug]/page.tsx", "utf8");

    expect(page).toContain('<header className="mb-4 sm:mb-6">');
    expect(page).not.toContain('<header className="mb-10 sm:mb-12">');
  });
});
