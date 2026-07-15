// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import { Selection, TextSelection, NodeSelection } from "@tiptap/pm/state";
import { Schema } from "@tiptap/pm/model";
import { describe, expect, it, vi } from "vitest";
import { shouldShowEditorBubble } from "@/lib/editor-bubble";
import { codeLowlight, DEFAULT_CODE_LANGUAGE } from "@/lib/code-highlighting";
import { createDefaultTableContent, hasMarkdownTable, normalizeUrl } from "@/lib/editor-utils";
import { buildEditorProps, createEditorExtensions } from "@/lib/editor-extensions";
import { MAX_EDITOR_IMAGE_SIZE } from "@/lib/editor-image-upload-plugin";

describe("editor-extensions helpers", () => {
  it("uses one TypeScript lowlight code block extension", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: createEditorExtensions(),
      content: { type: "doc", content: [{ type: "paragraph" }] },
    });
    const names = editor.extensionManager.extensions.map((extension) => extension.name);
    const starterKit = editor.extensionManager.extensions.find(
      (extension) => extension.name === "starterKit",
    );

    expect(DEFAULT_CODE_LANGUAGE).toBe("typescript");
    expect(codeLowlight.listLanguages()).toEqual(["typescript"]);
    expect(codeLowlight.registered("ts")).toBe(true);
    expect(starterKit?.options.codeBlock).toBe(false);
    expect(names.filter((name) => name === "codeBlock")).toHaveLength(1);
    expect(names.filter((name) => name === "link")).toHaveLength(1);
    expect(names.filter((name) => name === "underline")).toHaveLength(1);
    expect(new Set(names).size).toBe(names.length);
    editor.destroy();
  });

  it("creates a default table with header row and paragraph cells", () => {
    const table = createDefaultTableContent(2, 2);

    expect(table).toEqual({
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", content: [{ type: "paragraph" }] },
            { type: "tableHeader", content: [{ type: "paragraph" }] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [{ type: "paragraph" }] },
            { type: "tableCell", content: [{ type: "paragraph" }] },
          ],
        },
      ],
    });
  });

  it("detects markdown tables but ignores ordinary pipe text", () => {
    expect(hasMarkdownTable("| 列1 | 列2 |\n| --- | --- |\n| 值1 | 值2 |")).toBe(true);
    expect(hasMarkdownTable("普通文本 | 只是一个竖线，不是表格")).toBe(false);
  });

  it("blocks a single image larger than 100 MB before upload", () => {
    const upload = vi.fn().mockResolvedValue("/oversized.png");
    const props = buildEditorProps(upload);
    const file = {
      name: "oversized.png",
      type: "image/png",
      size: MAX_EDITOR_IMAGE_SIZE + 1,
      lastModified: 1,
    } as File;
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clipboardData: { items: [], files: [file] },
    } as unknown as ClipboardEvent;
    const view = { state: { selection: { from: 1 } } } as never;

    expect(props.handlePaste(view, event)).toBe(true);
    expect(upload).not.toHaveBeenCalled();
  });

  it("normalizes URLs by preserving http(s) links and prefixing bare domains", () => {
    expect(normalizeUrl("https://example.com")).toBe("https://example.com");
    expect(normalizeUrl("example.com/path")).toBe("https://example.com/path");
  });

  it("shows the bubble menu only for editable text selections, not image node selections", () => {
    const schema = new Schema({
      nodes: {
        doc: { content: "block+" },
        paragraph: {
          group: "block",
          content: "text*",
          toDOM: () => ["p", 0],
        },
        image: {
          group: "block",
          inline: false,
          attrs: { src: {} },
          selectable: true,
          toDOM: (node) => ["img", { src: node.attrs.src }],
        },
        text: { group: "inline" },
      },
    });

    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("hello world")]),
      schema.node("image", { src: "/demo.png" }),
    ]);

    const textSelection = TextSelection.create(doc, 1, 6);
    const imageSelection = NodeSelection.create(doc, 13);
    const cursorSelection = Selection.near(doc.resolve(1));

    expect(shouldShowEditorBubble(textSelection, true)).toBe(true);
    expect(shouldShowEditorBubble(imageSelection, true)).toBe(false);
    expect(shouldShowEditorBubble(cursorSelection, true)).toBe(false);
    expect(shouldShowEditorBubble(textSelection, false)).toBe(false);
  });
});
