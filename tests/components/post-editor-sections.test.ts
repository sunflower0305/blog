// @vitest-environment happy-dom

import { act, createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.ComponentProps<"a">) =>
    createElement("a", { href, ...props }, children),
}));

vi.mock("@/components/CategorySelector", () => ({
  CategorySelector: ({ value }: { value: string }) => createElement("span", null, value),
}));

vi.mock("@/components/ImageCropModal", () => ({
  ImageCropModal: () => createElement("div", { "data-modal": "crop" }),
}));
vi.mock("@/components/ImageGenerationModal", () => ({
  ImageGenerationModal: () => createElement("div", { "data-modal": "image" }),
}));
vi.mock("@/components/InputModal", () => ({
  InputModal: () => createElement("div", { "data-modal": "input" }),
}));
vi.mock("@/components/WeChatPublishModal", () => ({
  WeChatPublishModal: () => createElement("div", { "data-modal": "wechat" }),
}));

vi.mock("@/lib/ai-modal", () => ({
  AIModal: () => createElement("div", { "data-modal": "ai" }),
}));

import { PostEditorHeader } from "@/components/post-editor/PostEditorHeader";
import { PostEditorModals } from "@/components/post-editor/PostEditorModals";
import { PostEditorSidebar } from "@/components/post-editor/PostEditorSidebar";
import type { PostEditorController } from "@/lib/use-post-editor-controller";

describe("post editor sections", () => {
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
    vi.unstubAllGlobals();
  });

  it("renders the expanded header and all sidebar field variants", () => {
    const controller = createController();
    act(() =>
      root.render(
        createElement(
          Fragment,
          null,
          createElement(PostEditorHeader, { controller }),
          createElement(PostEditorSidebar, { controller }),
          createElement(PostEditorModals, { controller }),
        ),
      ),
    );

    expect(container.textContent).toContain("已保存");
    expect(container.textContent).toContain("选择发布状态");
    expect(container.textContent).toContain("文章设置");
    expect(container.textContent).toContain("existing");
    expect(container.querySelector('img[alt="封面预览"]')).not.toBeNull();
    expect(container.querySelectorAll("[data-modal]").length).toBeGreaterThan(3);
  });

  it("renders collapsed, pending, empty-cover and error states", () => {
    const controller = createController({
      charCount: 0,
      coverImage: "",
      feedback: { type: "error", message: "Save failed" },
      isMetadataTargetPending: () => true,
      publishPanelOpen: false,
      saveState: "error",
      saveStatusColor: "text-orange-500",
      saveStatusText: "保存失败",
      sidebarOpen: false,
      tags: [],
      uploadingImage: false,
    });
    act(() =>
      root.render(
        createElement(
          Fragment,
          null,
          createElement(PostEditorHeader, { controller }),
          createElement(PostEditorSidebar, { controller }),
        ),
      ),
    );
    expect(container.textContent).toContain("Save failed");
    expect(container.textContent).toContain("点击或拖拽上传封面");
    expect(container.querySelectorAll(".animate-spin")).toHaveLength(4);
  });
});

function createController(overrides: Partial<PostEditorController> = {}): PostEditorController {
  const noop = vi.fn();
  const imageTarget = { src: "source.png", alt: "Source", pos: 1 };
  return {
    STATUS_CONFIG: [
      { key: "public", label: "公开访问", desc: "所有人可见", Icon: () => null },
      { key: "draft", label: "草稿自见", desc: "仅自己可见", Icon: () => null },
    ],
    SITE_DISPLAY_URL: "example.com",
    SITE_URL: "https://example.com",
    addTag: noop,
    aiModal: {
      open: true,
      selectedText: "Selected",
      position: { top: 0, left: 0 },
      selectionRange: { from: 0, to: 1 },
      initialContext: "Context",
      documentTitle: "Title",
      documentText: "Body",
    },
    applyImageActionResult: noop,
    calcReadTime: () => "约1分钟阅读",
    category: "Notes",
    charCount: 123,
    closeAiModal: noop,
    closeImageModal: noop,
    coverImage: "/cover.png",
    coverInputRef: { current: null },
    cropImageTarget: imageTarget,
    description: "Summary",
    editSlug: "article",
    editorRef: { current: { getHTML: () => "<p>Body</p>" } as never },
    feedback: { type: "success", message: "Saved", slug: "article" },
    handleCopyWechat: noop,
    handleCoverUpload: noop,
    handleDownloadPdf: noop,
    handleGenerateMetadata: noop,
    handleInputModalCancel: noop,
    handleInputModalConfirm: noop,
    handleOpenWechatPublish: noop,
    handleSave: noop,
    imageModal: { open: true, contextText: "Image context", insertPos: 2 },
    inputModal: { open: true, title: "Input", placeholder: "Value" },
    insertGeneratedImage: noop,
    isMetadataTargetPending: () => false,
    latestTitleRef: { current: "Title" },
    markDirty: noop,
    openDocumentAIModal: noop,
    openDocumentImageModal: noop,
    publishPanelOpen: true,
    publishPanelRef: { current: null },
    publishStatus: "public",
    referenceImageTarget: imageTarget,
    removeTag: noop,
    saveState: "saved",
    saveStatusColor: "text-emerald-600",
    saveStatusText: "已保存 · 刚刚",
    saving: false,
    setCategory: noop,
    setCoverImage: noop,
    setCropImageTarget: noop,
    setDescription: noop,
    setFeedback: noop,
    setPublishPanelOpen: noop,
    setPublishStatus: noop,
    setReferenceImageTarget: noop,
    setSidebarOpen: noop,
    setSlug: noop,
    setTagInput: noop,
    setTitle: noop,
    setWechatPublishOpen: noop,
    showSidebar: true,
    sidebarOpen: true,
    slug: "article",
    slugInputFocusedRef: { current: false },
    tagInput: "",
    tags: ["existing"],
    title: "Title",
    uploadImageAndGetUrl: vi.fn(async () => "/uploaded.png"),
    uploadingImage: true,
    uploadProgress: 50,
    wechatPublishOpen: true,
    wechatSourceUrl: "https://example.com/article",
    ...overrides,
  } as unknown as PostEditorController;
}
