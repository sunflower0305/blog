// @vitest-environment happy-dom

import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const editorState = vi.hoisted(() => ({ html: "<p>saved before edit</p>" }));

vi.mock("@/components/TiptapEditorSurface", () => ({
  TiptapEditorSurface: ({ onCreate, onUpdate }: Record<string, (...args: unknown[]) => void>) => {
    const editor = {
      chain: () => ({ focus: () => ({ run: vi.fn() }) }),
      getHTML: () => editorState.html,
      getText: () => editorState.html.replace(/<[^>]+>/g, ""),
      state: { doc: { textBetween: vi.fn() }, selection: { from: 0, to: 0 } },
    };
    useEffect(() => {
      onCreate({ editor });
      return () => undefined;
    }, []);
    return createElement(
      "button",
      { "data-testid": "update-editor", onClick: () => onUpdate({ editor }) },
      "update editor",
    );
  },
}));

vi.mock("@/components/DownloadMarkdown", () => ({
  DownloadMarkdown: ({ html }: { html: string }) =>
    createElement("output", { "data-testid": "export-html" }, html),
}));

vi.mock("@/lib/editor-extensions", () => ({
  buildEditorProps: () => ({}),
  createEditorExtensions: () => [],
  FormattingBubble: () => null,
  getEditorCharacterCount: () => 10,
}));

vi.mock("@/lib/editor-content", () => ({
  setEditorHtmlContent: (_editor: unknown, html: string) => {
    editorState.html = html;
  },
}));

vi.mock("@/lib/editor-ui", () => ({
  extractFilesFromClipboard: () => [],
  useEditorAuxiliaryModals: () => ({
    aiModal: { open: false },
    closeAiModal: vi.fn(),
    closeImageModal: vi.fn(),
    handleInputModalCancel: vi.fn(),
    handleInputModalConfirm: vi.fn(),
    imageModal: { open: false, insertPos: null },
    inputModal: { open: false },
    openDocumentAIModal: vi.fn(),
    openDocumentImageModal: vi.fn(),
  }),
  useEditorUploadTriggers: vi.fn(),
}));

vi.mock("@/components/InputModal", () => ({ InputModal: () => null }));
vi.mock("@/components/CategorySelector", () => ({ CategorySelector: () => null }));
vi.mock("@/components/ImageGenerationModal", () => ({ ImageGenerationModal: () => null }));
vi.mock("@/components/ImageCropModal", () => ({ ImageCropModal: () => null }));
vi.mock("@/lib/ai-modal", () => ({ AIModal: () => null }));

import { InlineArticleEditor } from "@/components/InlineArticleEditor";

describe("InlineArticleEditor", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    editorState.html = "<p>saved before edit</p>";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("exports the newly saved HTML without requiring a page refresh", async () => {
    await act(async () => {
      root.render(
        createElement(InlineArticleEditor, {
          html: "<p>saved before edit</p>",
          slug: "article",
          title: "Article",
        }),
      );
    });

    editorState.html = "<p>saved after edit</p>";
    await act(async () => {
      (container.querySelector('[data-testid="update-editor"]') as HTMLButtonElement).click();
    });
    const saveButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "保存",
    );
    expect(saveButton).toBeDefined();
    await act(async () => saveButton?.click());

    expect(container.querySelector('[data-testid="export-html"]')?.textContent).toBe(
      "<p>saved after edit</p>",
    );
  });
});
