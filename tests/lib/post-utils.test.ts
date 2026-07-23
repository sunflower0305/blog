import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { optimizePostImageUrls } from "@/lib/post-utils";

const SITE_URL = "https://blog.zhangleyang.com";

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

  it("applies optimized delivery at the public article rendering boundary", () => {
    const page = readFileSync("app/[slug]/page.tsx", "utf8");

    expect(page).toContain("const optimizedHtml = optimizePostImageUrls(post.html, getSiteUrl())");
    expect(page).toContain("const deliveredHtml = await highlightCodeBlocksInHtml(optimizedHtml)");
    expect(page).toContain("dangerouslySetInnerHTML={{ __html: deliveredHtml }}");
    expect(page).toContain("html={deliveredHtml}");
  });
});
