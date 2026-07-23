// @vitest-environment happy-dom

import type { Editor } from "@tiptap/core";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  optimizeImageForUpload: vi.fn(async (file: File) => file),
  createUploadPlaceholderMarker: vi.fn(() => "marker"),
  getEditorImageSourceUrl: vi.fn((result: { url: string }) => result.url),
  insertUploadPlaceholder: vi.fn(),
  insertUploadedFileIntoEditor: vi.fn(() => 24),
  removeUploadPlaceholder: vi.fn((_editor?: unknown, _marker?: unknown): number | null => 12),
  uploadEditorFile: vi.fn(async () => ({ url: "/uploaded/file" })),
  getEditorImageValidationError: vi.fn((_file?: File): string | null => null),
}));

vi.mock("@/lib/client-image", () => ({
  COVER_IMAGE_OPTIMIZE_OPTIONS: { mode: "cover" },
  EDITOR_IMAGE_OPTIMIZE_OPTIONS: { mode: "editor" },
  optimizeImageForUpload: mocks.optimizeImageForUpload,
}));

vi.mock("@/lib/editor-file-upload", () => ({
  createUploadPlaceholderMarker: mocks.createUploadPlaceholderMarker,
  getEditorImageSourceUrl: mocks.getEditorImageSourceUrl,
  insertUploadPlaceholder: mocks.insertUploadPlaceholder,
  insertUploadedFileIntoEditor: mocks.insertUploadedFileIntoEditor,
  removeUploadPlaceholder: mocks.removeUploadPlaceholder,
  uploadEditorFile: mocks.uploadEditorFile,
}));

vi.mock("@/lib/editor-image-upload-plugin", () => ({
  getEditorImageValidationError: mocks.getEditorImageValidationError,
}));

import { usePostEditorUploads } from "@/lib/use-post-editor-uploads";

let uploads: ReturnType<typeof usePostEditorUploads>;

function Harness({ options }: { options: Parameters<typeof usePostEditorUploads>[0] }) {
  uploads = usePostEditorUploads(options);
  return null;
}

describe("usePostEditorUploads", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.clearAllMocks();
    mocks.optimizeImageForUpload.mockImplementation(async (file: File) => file);
    mocks.uploadEditorFile.mockResolvedValue({ url: "/uploaded/file" });
    mocks.getEditorImageValidationError.mockReturnValue(null);
    mocks.removeUploadPlaceholder.mockReturnValue(12);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("validates, optimizes and uploads editor images", async () => {
    const options = createOptions(createEditor());
    act(() => root.render(createElement(Harness, { options })));

    const file = new File(["image"], "cover.png", { type: "image/png" });
    let url = "";
    await act(async () => {
      url = await uploads.uploadImageAndGetUrl(file);
    });

    expect(url).toBe("/uploaded/file");
    expect(mocks.optimizeImageForUpload).toHaveBeenCalledWith(file, { mode: "editor" });
    expect(options.onClearFeedback).toHaveBeenCalled();
    expect(options.scheduleDraftSave).toHaveBeenCalled();
    expect(uploads.uploadingImage).toBe(false);
    expect(uploads.uploadProgress).toBe(0);
  });

  it("reports image validation errors and rethrows them", async () => {
    mocks.getEditorImageValidationError.mockReturnValue("Image too large");
    const options = createOptions(createEditor());
    act(() => root.render(createElement(Harness, { options })));

    await expect(
      act(async () =>
        uploads.uploadImageAndGetUrl(new File(["x"], "x.png", { type: "image/png" })),
      ),
    ).rejects.toThrow("Image too large");
    expect(options.onError).toHaveBeenCalledWith("Image too large");
    act(() => uploads.handleImageValidationError(new File(["x"], "x"), "Invalid"));
    expect(options.onError).toHaveBeenCalledWith("Invalid");
  });

  it("inserts uploaded non-image files at their placeholders", async () => {
    const editor = createEditor();
    const options = createOptions(editor);
    act(() => root.render(createElement(Harness, { options })));
    const file = new File(["pdf"], "guide.pdf", { type: "application/pdf" });

    let end: number | null = null;
    await act(async () => {
      end = await uploads.insertNonImageFile(file, 7);
    });

    expect(mocks.insertUploadPlaceholder).toHaveBeenCalledWith(editor, file, "marker", 7);
    expect(mocks.removeUploadPlaceholder).toHaveBeenCalledWith(editor, "marker");
    expect(mocks.insertUploadedFileIntoEditor).toHaveBeenCalledWith(
      editor,
      file,
      { url: "/uploaded/file" },
      12,
    );
    expect(end).toBe(24);
  });

  it("routes image files through image upload and editor insertion", async () => {
    const editor = createEditor();
    const options = createOptions(editor);
    act(() => root.render(createElement(Harness, { options })));

    await expect(
      uploads.insertNonImageFile(new File(["image"], "inline.png", { type: "image/png" })),
    ).resolves.toBeNull();

    expect(mocks.optimizeImageForUpload).toHaveBeenCalled();
    expect(options.scheduleDraftSave).toHaveBeenCalled();
  });

  it("handles missing editors, vanished placeholders and failed file uploads", async () => {
    const options = createOptions(null);
    act(() => root.render(createElement(Harness, { options })));
    const file = new File(["pdf"], "guide.pdf", { type: "application/pdf" });
    await expect(uploads.insertNonImageFile(file)).resolves.toBeNull();
    expect(options.onError).toHaveBeenCalledWith("编辑器还没准备好");

    options.editorRef.current = createEditor();
    mocks.removeUploadPlaceholder.mockReturnValueOnce(null);
    await expect(uploads.insertNonImageFile(file)).resolves.toBeNull();

    mocks.uploadEditorFile.mockRejectedValueOnce(new Error("upload failed"));
    await expect(uploads.insertNonImageFile(file)).resolves.toBeNull();
    expect(options.onError).toHaveBeenCalledWith("upload failed");
  });

  it("uploads covers and processes selected file queues", async () => {
    const options = createOptions(createEditor());
    act(() => root.render(createElement(Harness, { options })));
    const cover = new File(["image"], "cover.png", { type: "image/png" });

    await act(async () => uploads.handleCoverUpload(cover));
    expect(mocks.optimizeImageForUpload).toHaveBeenCalledWith(cover, { mode: "cover" });
    expect(options.onCoverUploaded).toHaveBeenCalledWith("/uploaded/file");

    const pdf = new File(["pdf"], "one.pdf", { type: "application/pdf" });
    await act(async () => uploads.handleSelectedFiles([pdf, pdf]));
    expect(mocks.insertUploadedFileIntoEditor).toHaveBeenCalledTimes(2);

    mocks.optimizeImageForUpload.mockRejectedValueOnce(new Error("cover failed"));
    await act(async () => uploads.handleCoverUpload(cover));
    expect(options.onError).toHaveBeenCalledWith("cover failed");
  });
});

function createEditor() {
  return {
    chain: () => ({ focus: () => ({ setImage: () => ({ run: vi.fn() }) }) }),
  } as unknown as Editor;
}

function createOptions(editor: Editor | null): Parameters<typeof usePostEditorUploads>[0] {
  const fileInput = document.createElement("input");
  const fileUpload = document.createElement("input");
  return {
    editorRef: { current: editor },
    fileInputRef: { current: fileInput },
    fileUploadRef: { current: fileUpload },
    latestTitleRef: { current: "Title" },
    onClearFeedback: vi.fn(),
    onCoverUploaded: vi.fn(),
    onError: vi.fn(),
    scheduleDraftSave: vi.fn(),
  };
}
