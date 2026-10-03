// @vitest-environment happy-dom

import { describe, expect, it } from "vite-plus/test";
import { collectEditorArticleToc } from "@/lib/editor-article-toc";

describe("collectEditorArticleToc", () => {
  it("creates editor anchors and extracts h2 and h3 headings", () => {
    const root = document.createElement("div");
    root.innerHTML = "<h2>编辑模式目录</h2><p>正文</p><h3>实时更新</h3><h1>忽略一级标题</h1>";

    expect(collectEditorArticleToc(root)).toEqual([
      { id: "编辑模式目录", level: 2, text: "编辑模式目录" },
      { id: "实时更新", level: 3, text: "实时更新" },
    ]);
    expect(root.querySelector("h2")?.dataset.tocId).toBe("编辑模式目录");
    expect(root.querySelector("h3")?.id).toBe("实时更新");
  });

  it("preserves valid IDs and resolves duplicate headings deterministically", () => {
    const root = document.createElement("div");
    root.innerHTML = '<h2>Intro</h2><h2 id="intro">Existing</h2><h3>Intro</h3>';

    expect(collectEditorArticleToc(root).map(({ id }) => id)).toEqual([
      "intro-2",
      "intro",
      "intro-3",
    ]);
  });

  it("updates IDs when editable heading text changes", () => {
    const root = document.createElement("div");
    root.innerHTML = "<h2>旧标题</h2><h3>子标题</h3>";
    collectEditorArticleToc(root);

    const heading = root.querySelector("h2")!;
    heading.textContent = "新标题";
    heading.removeAttribute("id");

    expect(collectEditorArticleToc(root)[0]).toEqual({ id: "新标题", level: 2, text: "新标题" });
  });
});
