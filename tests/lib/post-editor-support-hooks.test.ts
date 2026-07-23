// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createEditorExtensions: vi.fn((options) => options),
  insertGeneratedImageAfterNode: vi.fn(),
  insertGeneratedImageAtPosition: vi.fn(),
  replaceImageNodeAtPosition: vi.fn(),
}));

vi.mock("@/lib/editor-extensions", () => ({
  createEditorExtensions: mocks.createEditorExtensions,
}));

vi.mock("@/lib/editor-file-upload", () => ({
  insertGeneratedImageAfterNode: mocks.insertGeneratedImageAfterNode,
  insertGeneratedImageAtPosition: mocks.insertGeneratedImageAtPosition,
  replaceImageNodeAtPosition: mocks.replaceImageNodeAtPosition,
}));

import { usePostEditorImageActions } from "@/lib/use-post-editor-image-actions";
import { usePostEditorLifecycle } from "@/lib/use-post-editor-lifecycle";
import { usePostEditorModals } from "@/lib/use-post-editor-modals";
import { usePostEditorTags } from "@/lib/use-post-editor-tags";

let imageActions: ReturnType<typeof usePostEditorImageActions>;
let modalActions: ReturnType<typeof usePostEditorModals>;
let tagActions: ReturnType<typeof usePostEditorTags>;

function ImageHarness({ options }: { options: Parameters<typeof usePostEditorImageActions>[0] }) {
  imageActions = usePostEditorImageActions(options);
  return null;
}

function LifecycleHarness({ options }: { options: Parameters<typeof usePostEditorLifecycle>[0] }) {
  usePostEditorLifecycle(options);
  return null;
}

function ModalHarness({ editorRef }: { editorRef: Parameters<typeof usePostEditorModals>[0] }) {
  modalActions = usePostEditorModals(editorRef, "Document title");
  return null;
}

function TagHarness({
  tags,
  setTags,
  markDirty,
}: {
  tags: string[];
  setTags: Parameters<typeof usePostEditorTags>[1];
  markDirty: Parameters<typeof usePostEditorTags>[2];
}) {
  tagActions = usePostEditorTags(tags, setTags, markDirty);
  return null;
}

describe("post editor support hooks", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("routes generated image insertion, replacement and editor image actions", () => {
    const editor = { state: {}, commands: {} } as never;
    const options: Parameters<typeof usePostEditorImageActions>[0] = {
      closeImageModal: vi.fn(),
      editorRef: { current: editor },
      imageInsertPosition: 12,
      markDirty: vi.fn(),
      setCoverImage: vi.fn(),
      setCropImageTarget: vi.fn(),
      setFeedback: vi.fn(),
      setReferenceImageTarget: vi.fn(),
    };
    act(() => root.render(createElement(ImageHarness, { options })));

    act(() => imageActions.insertGeneratedImage("generated.png", "Generated"));
    expect(mocks.insertGeneratedImageAtPosition).toHaveBeenCalledWith(
      editor,
      "generated.png",
      "Generated",
      12,
    );
    expect(options.closeImageModal).toHaveBeenCalled();

    const target = { src: "before.png", alt: "Before", pos: 4 };
    act(() => imageActions.applyImageActionResult(target, "after.png", "", "replace"));
    act(() => imageActions.applyImageActionResult(target, "insert.png", "Inserted", "insert"));
    expect(mocks.replaceImageNodeAtPosition).toHaveBeenCalledWith(editor, "after.png", "Before", 4);
    expect(mocks.insertGeneratedImageAfterNode).toHaveBeenCalledWith(
      editor,
      "insert.png",
      "Inserted",
      4,
    );

    const callbacks = mocks.createEditorExtensions.mock.calls[0]?.[0].imageActions;
    act(() => callbacks.onSetCover(target));
    act(() => callbacks.onOpenReferenceImage(target));
    act(() => callbacks.onOpenCrop(target));
    expect(options.setCoverImage).toHaveBeenCalledWith("before.png");
    expect(options.markDirty).toHaveBeenCalledWith({ coverImage: "before.png" });
    expect(options.setFeedback).toHaveBeenCalledWith({ type: "success", message: "已设为封面" });
    expect(options.setReferenceImageTarget).toHaveBeenCalledWith(target);
    expect(options.setCropImageTarget).toHaveBeenCalledWith(target);
  });

  it("ignores image actions until the editor exists", () => {
    const options: Parameters<typeof usePostEditorImageActions>[0] = {
      closeImageModal: vi.fn(),
      editorRef: { current: null },
      imageInsertPosition: null,
      markDirty: vi.fn(),
      setCoverImage: vi.fn(),
      setCropImageTarget: vi.fn(),
      setFeedback: vi.fn(),
      setReferenceImageTarget: vi.fn(),
    };
    act(() => root.render(createElement(ImageHarness, { options })));
    act(() => imageActions.insertGeneratedImage("x", "y"));
    act(() => imageActions.applyImageActionResult({ src: "x", alt: "", pos: 0 }, "y", "z"));
    expect(mocks.insertGeneratedImageAtPosition).not.toHaveBeenCalled();
    expect(mocks.replaceImageNodeAtPosition).not.toHaveBeenCalled();
  });

  it("persists sidebar state and handles focus, outside clicks and keyboard shortcuts", () => {
    window.localStorage.setItem("blog:sidebar-open", "true");
    const panel = document.createElement("div");
    const title = document.createElement("textarea");
    const options: Parameters<typeof usePostEditorLifecycle>[0] = {
      draftReady: true,
      editSlug: null,
      handleSave: vi.fn(async () => undefined),
      publishPanelOpen: true,
      publishPanelRef: { current: panel },
      setDraftReady: vi.fn(),
      setPublishPanelOpen: vi.fn(),
      setSidebarOpen: vi.fn(),
      setTick: vi.fn(),
      sidebarOpen: true,
      titleRef: { current: title },
    };
    const focus = vi.spyOn(title, "focus");
    act(() => root.render(createElement(LifecycleHarness, { options })));

    expect(options.setDraftReady).toHaveBeenCalledWith(true);
    expect(options.setSidebarOpen).toHaveBeenCalledWith(true);
    expect(focus).toHaveBeenCalled();
    expect(window.localStorage.getItem("blog:sidebar-open")).toBe("true");

    act(() => document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "s", metaKey: true, bubbles: true }),
      ),
    );
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(options.setPublishPanelOpen).toHaveBeenCalledWith(false);
    expect(options.handleSave).toHaveBeenCalled();
  });

  it("adds and removes normalized tags", () => {
    const setTags = vi.fn();
    const markDirty = vi.fn();
    act(() => root.render(createElement(TagHarness, { tags: ["existing"], setTags, markDirty })));
    act(() => tagActions.addTag("  new-tag  "));
    expect(setTags).toHaveBeenCalledWith(["existing", "new-tag"]);
    expect(markDirty).toHaveBeenCalledWith({ tags: ["existing", "new-tag"] });
    act(() => tagActions.addTag("existing"));
    expect(setTags).toHaveBeenCalledTimes(1);
    act(() => tagActions.removeTag(0));
    expect(setTags).toHaveBeenLastCalledWith([]);
  });

  it("derives document and selection context for auxiliary modals", () => {
    const editorRef = {
      current: {
        getText: vi.fn(() => "Document text"),
        state: {
          selection: { from: 1, to: 4 },
          doc: { textBetween: vi.fn(() => "Selected") },
        },
      } as never,
    };
    act(() => root.render(createElement(ModalHarness, { editorRef })));
    expect(modalActions.aiModal.documentTitle).toBe("");
    act(() => modalActions.openDocumentImageModal());
    expect(modalActions.imageModal.contextText).toBe("Selected");
  });
});
