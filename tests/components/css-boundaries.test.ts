import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const globals = readFileSync("app/globals.css", "utf8");
const content = readFileSync("app/content.css", "utf8");
const editor = readFileSync("app/editor.css", "utf8");

describe("CSS 路由拆分边界", () => {
  it("globals.css 不再包含文章正文与编辑器样式", () => {
    // 已迁移到 content.css / editor.css 的选择器不得重新进入根布局。
    for (const selector of [
      ".novel-prose",
      ".rich-content",
      ".drag-handle",
      ".resizable-image",
      ".editor-floating-menu",
      ".math-editor-input",
      ".math-block-wrapper",
      ".hljs-keyword",
      ".twitter-node-view",
      ".article-display-title",
    ]) {
      expect(globals, `globals.css 不应包含 ${selector}`).not.toContain(selector);
    }
  });

  it("globals.css 不再导入 KaTeX", () => {
    expect(globals).not.toMatch(/katex\.css/);
  });

  it("站点框架级主题规则仍保留在 globals.css", () => {
    // 这些选择器服务所有路由，必须留在根布局，不能被迁移到 content.css / home.css。
    for (const selector of [
      ".site-header",
      ".site-header-inner",
      ".page-main",
      ".search-panel",
    ]) {
      expect(globals, `globals.css 应保留 ${selector}`).toContain(selector);
    }
  });

  it("content.css 承载共享正文样式并在顶部导入 KaTeX", () => {
    expect(content).toMatch(/@import\s+["']\.\/katex\.css["']/);
    expect(content).toContain(".rich-content");
    expect(content).toContain(".hljs-keyword");
    expect(content).toContain(".math-block-wrapper");
    // 站点框架级主题规则不得进入 content.css。
    for (const selector of [".site-header", ".page-main", ".search-panel"]) {
      expect(content, `content.css 不应包含 ${selector}`).not.toContain(selector);
    }
  });

  it("editor.css 只承载编辑器专用样式", () => {
    expect(editor).toContain(".drag-handle");
    expect(editor).toContain(".resizable-image");
    expect(editor).toContain(".math-editor-input");
    // 编辑器样式不得导入 KaTeX（由 content.css 负责）或触碰站点框架。
    expect(editor).not.toMatch(/katex\.css/);
    for (const selector of [".site-header", ".page-main"]) {
      expect(editor, `editor.css 不应包含 ${selector}`).not.toContain(selector);
    }
  });
});

describe("CSS 页面导入边界", () => {
  it("文章详情页导入 content.css，但不导入 editor.css", () => {
    const page = readFileSync("app/[slug]/page.tsx", "utf8");
    expect(page).toMatch(/import\s+["']\.\.\/content\.css["']/);
    expect(page).not.toMatch(/editor\.css/);
  });

  it("编辑器页面同时导入 content.css 与 editor.css", () => {
    const page = readFileSync("app/editor/page.tsx", "utf8");
    expect(page).toMatch(/import\s+["']\.\.\/content\.css["']/);
    expect(page).toMatch(/import\s+["']\.\.\/editor\.css["']/);
  });

  it("前台内联编辑器导入 editor.css", () => {
    const inlineEditor = readFileSync("components/InlineArticleEditor.tsx", "utf8");
    expect(inlineEditor).toMatch(/import\s+["']@\/app\/editor\.css["']/);
  });

  it("根布局只导入 globals.css，不导入路由级 CSS", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toMatch(/import\s+["']\.\/globals\.css["']/);
    expect(layout).not.toMatch(/content\.css|editor\.css/);
  });
});
