// @vitest-environment happy-dom

import { Editor, Extension } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import { Selection, TextSelection, NodeSelection } from "@tiptap/pm/state";
import { Schema } from "@tiptap/pm/model";
import { describe, expect, it, vi } from "vitest";
import { shouldShowEditorBubble } from "@/lib/editor-bubble";
import { codeLowlight, DEFAULT_CODE_LANGUAGE } from "@/lib/code-highlighting";
import { createDefaultTableContent, hasMarkdownTable, normalizeUrl } from "@/lib/editor-utils";
import { buildEditorProps, createEditorExtensions } from "@/lib/editor-extensions";
import { MAX_EDITOR_IMAGE_SIZE, UploadImagesPlugin } from "@/lib/editor-image-upload-plugin";

function createUploadEditor() {
  const UploadExtension = Extension.create({
    name: "testImageUpload",
    addProseMirrorPlugins() {
      return [UploadImagesPlugin({ imageClass: "opacity-40" })];
    },
  });

  return new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit, Image, UploadExtension],
    content: "<p>before after</p>",
  });
}

function createClipboardEvent(files: File[]) {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    clipboardData: { items: [], files },
  } as unknown as ClipboardEvent;
}

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
    const onValidationError = vi.fn();
    const props = buildEditorProps(upload, undefined, "", onValidationError);
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
    expect(onValidationError).toHaveBeenCalledWith(file, "图片太大，最大支持 100MB");
  });

  it("uploads pasted images sequentially and preserves their source order", async () => {
    const editor = createUploadEditor();
    const first = new File(["first"], "first.png", { type: "image/png" });
    const second = new File(["second"], "second.png", { type: "image/png" });
    const resolvers = new Map<string, (url: string) => void>();
    const upload = vi.fn(
      (file: File) =>
        new Promise<string>((resolve) => {
          resolvers.set(file.name, resolve);
        }),
    );
    const props = buildEditorProps(upload);

    expect(props.handlePaste(editor.view, createClipboardEvent([first, second]))).toBe(true);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenLastCalledWith(first);

    resolvers.get(first.name)?.("/first.png");
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    expect(upload).toHaveBeenLastCalledWith(second);
    resolvers.get(second.name)?.("/second.png");

    await vi.waitFor(() => expect(editor.getHTML()).toContain('src="/second.png"'));
    expect(editor.getHTML().indexOf('src="/first.png"')).toBeLessThan(
      editor.getHTML().indexOf('src="/second.png"'),
    );
    editor.destroy();
  });

  it("processes pasted non-image files sequentially", async () => {
    const first = new File(["first"], "first.pdf", { type: "application/pdf" });
    const second = new File(["second"], "second.pdf", { type: "application/pdf" });
    let releaseFirst: (() => void) | undefined;
    const onNonImageFile = vi.fn(
      (file: File) =>
        file === first
          ? new Promise<void>((resolve) => {
              releaseFirst = resolve;
            })
          : Promise.resolve(),
    );
    const props = buildEditorProps(undefined, onNonImageFile);
    const view = { state: { selection: { from: 1 } } } as never;

    expect(props.handlePaste(view, createClipboardEvent([first, second]))).toBe(true);
    expect(onNonImageFile).toHaveBeenCalledTimes(1);
    expect(onNonImageFile).toHaveBeenLastCalledWith(first, 1);

    releaseFirst?.();
    await vi.waitFor(() => expect(onNonImageFile).toHaveBeenCalledTimes(2));
    expect(onNonImageFile).toHaveBeenLastCalledWith(second, 1);
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
