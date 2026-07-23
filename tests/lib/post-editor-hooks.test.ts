// @vitest-environment happy-dom

import type { Editor } from "@tiptap/core";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePostEditorAutosave } from "@/lib/use-post-editor-autosave";
import { usePostEditorDocumentActions } from "@/lib/use-post-editor-document-actions";
import { usePostEditorSave } from "@/lib/use-post-editor-save";

const documentMocks = vi.hoisted(() => ({
  copyAsWechatArticleFormat: vi.fn(),
  downloadArticleAsPdf: vi.fn(),
}));

vi.mock("@/lib/wechat-copy", () => documentMocks);

type AutosaveResult = ReturnType<typeof usePostEditorAutosave>;
type SaveResult = ReturnType<typeof usePostEditorSave>;
type DocumentActionsResult = ReturnType<typeof usePostEditorDocumentActions>;

let autosaveResult: AutosaveResult;
let saveResult: SaveResult;
let documentActionsResult: DocumentActionsResult;

function AutosaveHarness({ options }: { options: Parameters<typeof usePostEditorAutosave>[0] }) {
  autosaveResult = usePostEditorAutosave(options);
  return null;
}

function SaveHarness({ options }: { options: Parameters<typeof usePostEditorSave>[0] }) {
  saveResult = usePostEditorSave(options);
  return null;
}

function DocumentActionsHarness({
  options,
}: {
  options: Parameters<typeof usePostEditorDocumentActions>[0];
}) {
  documentActionsResult = usePostEditorDocumentActions(options);
  return null;
}

function createEditor(overrides: Partial<Editor> = {}) {
  return {
    getHTML: vi.fn(() => "<p>Article body</p>"),
    getJSON: vi.fn(() => ({ type: "doc" })),
    getText: vi.fn(() => "Article body"),
    commands: { clearContent: vi.fn() },
    ...overrides,
  } as unknown as Editor;
}

describe("post editor hooks", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("autosaves a new draft and synchronizes its persisted slug", async () => {
    vi.useFakeTimers();
    const editor = createEditor();
    const setEditSlug = vi.fn();
    const setSlug = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ slug: "saved-draft" }), { status: 200 }),
    );
    const options: Parameters<typeof usePostEditorAutosave>[0] = {
      category: "Notes",
      coverImage: "",
      description: "",
      draftReady: true,
      editSlug: null,
      editorRef: { current: editor },
      latestTitleRef: { current: "Draft title" },
      setEditSlug,
      setSlug,
      slug: "",
      slugInputFocusedRef: { current: false },
      tags: ["test"],
    };
    act(() => root.render(createElement(AutosaveHarness, { options })));

    act(() => autosaveResult.markDirty({ description: "Updated" }));
    await act(async () => vi.advanceTimersByTimeAsync(1500));

    expect(fetch).toHaveBeenCalledWith(
      "/api/posts",
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }),
    );
    expect(setEditSlug).toHaveBeenCalledWith("saved-draft");
    expect(setSlug).toHaveBeenCalledWith("saved-draft");
    expect(autosaveResult.lastAutosaveSnapshotRef.current).toContain("Draft title");
    expect(autosaveResult.saveState).toBe("saved");
  });

  it("uses PATCH for existing drafts and marks failed requests for retry", async () => {
    vi.useFakeTimers();
    const editor = createEditor();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "offline" }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ slug: "existing" }), { status: 200 }));
    const options: Parameters<typeof usePostEditorAutosave>[0] = {
      category: "Notes",
      coverImage: "cover.png",
      description: "Summary",
      draftReady: true,
      editSlug: "existing",
      editorRef: { current: editor },
      latestTitleRef: { current: "Existing" },
      setEditSlug: vi.fn(),
      setSlug: vi.fn(),
      slug: "renamed",
      slugInputFocusedRef: { current: false },
      tags: [],
    };
    act(() => root.render(createElement(AutosaveHarness, { options })));

    act(() => autosaveResult.scheduleDraftSave());
    await act(async () => vi.advanceTimersByTimeAsync(1500));
    expect(autosaveResult.saveState).toBe("error");
    await act(async () => vi.advanceTimersByTimeAsync(2000));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/posts",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(autosaveResult.saveState).toBe("saved");
  });

  it("validates and saves a new post through the manual save hook", async () => {
    const editor = createEditor();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, slug: "published" }), { status: 200 }),
    );
    const options = createSaveOptions(editor, { title: "New article" });
    act(() => root.render(createElement(SaveHarness, { options })));

    await act(async () => saveResult.handleSave());

    expect(fetch).toHaveBeenCalledWith("/api/posts", expect.objectContaining({ method: "POST" }));
    expect(options.setTitle).toHaveBeenCalledWith("");
    expect(editor.commands.clearContent).toHaveBeenCalled();
    expect(saveResult.feedback).toEqual({
      type: "success",
      message: "已发布",
      slug: "published",
    });
  });

  it("updates existing posts and surfaces validation and API errors", async () => {
    const editor = createEditor();
    const options = createSaveOptions(editor, { editSlug: "existing", title: "" });
    act(() => root.render(createElement(SaveHarness, { options })));
    await act(async () => saveResult.handleSave());
    expect(saveResult.feedback?.message).toBe("先把文章标题写上。");

    options.title = "Updated";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "conflict" }), { status: 409 }),
    );
    act(() => root.render(createElement(SaveHarness, { options })));
    await act(async () => saveResult.handleSave());
    expect(saveResult.feedback?.message).toBe("conflict");
    expect(options.setSaveState).toHaveBeenCalledWith("error");
  });

  it("copies, downloads and opens publishing only for non-empty documents", async () => {
    const toast = { error: vi.fn(), success: vi.fn() };
    const setWechatPublishOpen = vi.fn();
    const options: Parameters<typeof usePostEditorDocumentActions>[0] = {
      editorRef: { current: createEditor() },
      setWechatPublishOpen,
      title: "Article",
      toast,
    };
    act(() => root.render(createElement(DocumentActionsHarness, { options })));

    await act(async () => documentActionsResult.handleCopyWechat());
    await act(async () => documentActionsResult.handleDownloadPdf());
    act(() => documentActionsResult.handleOpenWechatPublish());
    expect(documentMocks.copyAsWechatArticleFormat).toHaveBeenCalledWith(
      "Article",
      "<p>Article body</p>",
    );
    expect(documentMocks.downloadArticleAsPdf).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("已复制公众号格式");
    expect(setWechatPublishOpen).toHaveBeenCalledWith(true);

    options.editorRef.current = null;
    act(() => root.render(createElement(DocumentActionsHarness, { options })));
    act(() => documentActionsResult.handleOpenWechatPublish());
    expect(toast.error).toHaveBeenCalledWith("编辑器还没准备好。");
  });

  it("reports copy, download and empty-document failures", async () => {
    const toast = { error: vi.fn(), success: vi.fn() };
    const options = {
      editorRef: { current: createEditor() },
      setWechatPublishOpen: vi.fn(),
      title: "Article",
      toast,
    };
    documentMocks.copyAsWechatArticleFormat.mockRejectedValueOnce(new Error("copy failed"));
    documentMocks.downloadArticleAsPdf.mockRejectedValueOnce(new Error("pdf failed"));
    act(() => root.render(createElement(DocumentActionsHarness, { options })));
    await act(async () => documentActionsResult.handleCopyWechat());
    await act(async () => documentActionsResult.handleDownloadPdf());
    expect(toast.error).toHaveBeenCalledWith("copy failed");
    expect(toast.error).toHaveBeenCalledWith("pdf failed");

    options.editorRef.current = createEditor({
      getHTML: vi.fn(() => "<p></p>"),
      getText: vi.fn(() => ""),
    });
    act(() => root.render(createElement(DocumentActionsHarness, { options })));
    act(() => documentActionsResult.handleOpenWechatPublish());
    expect(toast.error).toHaveBeenCalledWith("正文还是空的。");
  });
});

function createSaveOptions(
  editor: Editor,
  overrides: Partial<Parameters<typeof usePostEditorSave>[0]> = {},
): Parameters<typeof usePostEditorSave>[0] {
  return {
    abortAutosaveRequest: vi.fn(),
    buildAutosaveSnapshot: (payload) => JSON.stringify(payload),
    category: "Notes",
    clearAutosaveTimers: vi.fn(),
    coverImage: "",
    description: "",
    editSlug: null,
    editorRef: { current: editor },
    initialPassword: null,
    lastAutosaveSnapshotRef: { current: null },
    latestTitleRef: { current: "" },
    publishStatus: "public",
    setDescription: vi.fn(),
    setLastSavedAt: vi.fn(),
    setPublishPanelOpen: vi.fn(),
    setSaveState: vi.fn(),
    setTitle: vi.fn(),
    slug: "",
    syncPersistedSlug: vi.fn(),
    tags: [],
    title: "Article",
    ...overrides,
  };
}
