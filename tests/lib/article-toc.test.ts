import { describe, expect, it } from "vite-plus/test";
import { addArticleTocToHtml, slugifyArticleHeading } from "@/lib/article-toc";

describe("article table of contents", () => {
  it("adds stable IDs and extracts h2 and h3 headings", async () => {
    const result = await addArticleTocToHtml(
      "<h1>文章标题</h1><h2>为什么选择 SSR？</h2><p>正文</p><h3>React &amp; HTML</h3>",
    );

    expect(result.headings).toEqual([
      { id: "为什么选择-ssr", level: 2, text: "为什么选择 SSR？" },
      { id: "react-html", level: 3, text: "React & HTML" },
    ]);
    expect(result.html).toContain('id="为什么选择-ssr"');
    expect(result.html).toContain('data-toc-id="为什么选择-ssr"');
    expect(result.html).not.toContain("<h1 id=");
  });

  it("preserves existing IDs and suffixes duplicate anchors", async () => {
    const result = await addArticleTocToHtml(
      '<div id="intro"></div><h2 id="kept">开始</h2><h2>开始</h2><h3>开始</h3><h2 id="intro">冲突</h2>',
    );

    expect(result.headings.map(({ id }) => id)).toEqual(["kept", "开始", "开始-2", "intro-2"]);
  });

  it("extracts nested inline text and skips empty headings", async () => {
    const result = await addArticleTocToHtml(
      "<h2>使用 <code>IntersectionObserver</code></h2><h3><br></h3>",
    );

    expect(result.headings).toEqual([
      {
        id: "使用-intersectionobserver",
        level: 2,
        text: "使用 IntersectionObserver",
      },
    ]);
  });

  it("reserves existing IDs before assigning generated anchors", async () => {
    const result = await addArticleTocToHtml(
      '<h2>Intro</h2><h2 id="intro">Existing anchor</h2><h2 id="not valid">Invalid anchor</h2>',
    );

    expect(result.headings.map(({ id }) => id)).toEqual(["intro-2", "intro", "invalid-anchor"]);
  });

  it("returns heading-free HTML unchanged", async () => {
    const html = "<p>普通正文</p>";
    await expect(addArticleTocToHtml(html)).resolves.toEqual({ html, headings: [] });
  });

  it("normalizes punctuation and falls back for symbol-only headings", () => {
    expect(slugifyArticleHeading("  What's New in V3?  ")).toBe("whats-new-in-v3");
    expect(slugifyArticleHeading("✨✨")).toBe("section");
  });

  it("preserves rich article markup and is idempotent", async () => {
    const html = [
      '<h2 class="title">嵌入内容</h2>',
      '<img src="/demo.png" width="640" height="320">',
      '<div data-youtube-video><iframe src="https://youtube.com/embed/abc" allowfullscreen></iframe></div>',
      '<input type="checkbox" checked disabled>',
    ].join("");

    const once = await addArticleTocToHtml(html);
    const twice = await addArticleTocToHtml(once.html);

    expect(once.html).toContain('class="title"');
    expect(once.html).toContain('src="/demo.png" width="640" height="320"');
    expect(once.html).toContain("data-youtube-video");
    expect(once.html).toContain("allowfullscreen");
    expect(once.html).toContain('type="checkbox" checked disabled');
    expect(twice).toEqual(once);
  });
});
