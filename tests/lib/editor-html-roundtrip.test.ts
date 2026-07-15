// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { buildEditorProps, createEditorExtensions } from "@/lib/editor-extensions";
import { setEditorHtmlContent } from "@/lib/editor-content";

const REPRESENTATIVE_HTML = `
  <h1>标题</h1>
  <blockquote><p>引用内容</p></blockquote>
  <ul><li><p>项目一</p></li></ul>
  <ol start="2"><li><p>编号二</p></li></ol>
  <ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>已完成</p></div></li></ul>
  <pre><code class="language-typescript">const answer = 42;</code></pre>
  <table><thead><tr><th><p>列一</p></th><th><p>列二</p></th></tr></thead><tbody><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table>
  <img src="/image.png" width="320" data-align="left" alt="示例图片" style="display:block;width:320px;margin-left:0;margin-right:auto">
  <div data-youtube-video><iframe src="https://www.youtube.com/watch?v=dQw4w9WgXcQ"></iframe></div>
  <div data-twitter-src="https://x.com/example/status/123" src="https://x.com/example/status/123"><a href="https://x.com/example/status/123">tweet</a></div>
  <div data-math-latex="E = mc^2" latex="E = mc^2" data-display-mode="true" displaymode="true"></div>
  <audio src="/voice.mp3" title="音频"></audio>
  <video src="/clip.mp4" title="视频"></video>
`;

function createEditor() {
  return new Editor({
    element: document.createElement("div"),
    extensions: createEditorExtensions(),
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });
}

function collectNodeNames(editor: Editor) {
  const names: string[] = [];
  editor.state.doc.descendants((node) => {
    names.push(node.type.name);
  });
  return names;
}

describe("editor HTML compatibility", () => {
  const editors: Editor[] = [];

  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy());
  });

  it("round-trips representative stored HTML without losing custom nodes or attributes", () => {
    const first = createEditor();
    const second = createEditor();
    editors.push(first, second);

    setEditorHtmlContent(first, REPRESENTATIVE_HTML);
    const firstHtml = first.getHTML();
    setEditorHtmlContent(second, firstHtml);
    const secondHtml = second.getHTML();
    const nodeNames = collectNodeNames(second);

    expect(secondHtml).toBe(firstHtml);
    expect(nodeNames).toEqual(
      expect.arrayContaining([
        "heading",
        "blockquote",
        "bulletList",
        "orderedList",
        "taskList",
        "taskItem",
        "codeBlock",
        "table",
        "image",
        "youtube",
        "twitter",
        "mathBlock",
        "audio",
        "video",
      ]),
    );
    expect(secondHtml).toContain('width="320"');
    expect(secondHtml).toContain('data-align="left"');
    expect(secondHtml).toContain('alt="示例图片"');
    expect(secondHtml).toContain('class="language-typescript"');
  });

  it("converts pasted Markdown tables into table nodes", () => {
    const editor = createEditor();
    editors.push(editor);
    const props = buildEditorProps();
    const event = {
      preventDefault: () => undefined,
      clipboardData: {
        items: [],
        files: [],
        getData: (type: string) =>
          type === "text/plain" ? "| 列1 | 列2 |\n| --- | --- |\n| A | B |" : "",
      },
    } as unknown as ClipboardEvent;

    expect(props.handlePaste(editor.view, event)).toBe(true);
    expect(collectNodeNames(editor)).toContain("table");
  });
});
