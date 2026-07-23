"use client";

import type { Editor, JSONContent } from "@tiptap/core";
import { Eye, Globe, Link2, Lock } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { buildEditorProps } from "@/lib/editor-extensions";
import { useEditorUploadTriggers } from "@/lib/editor-ui";
import type { EditorImageActionTarget } from "@/lib/resizable-image";
import { normalizePostSlug } from "@/lib/post-utils";
import { getSiteDisplayUrl, getSiteUrl } from "@/lib/site-config";
import { resizeTextareaHeight, useAutoResizeTextarea } from "@/lib/textarea-autosize";
import { usePostEditorUploads } from "@/lib/use-post-editor-uploads";
import { usePostEditorMetadata } from "@/lib/use-post-editor-metadata";
import { usePostEditorAutosave, type SaveState } from "@/lib/use-post-editor-autosave";
import { usePostEditorDocumentActions } from "@/lib/use-post-editor-document-actions";
import { usePostEditorLifecycle } from "@/lib/use-post-editor-lifecycle";
import { usePostEditorImageActions } from "@/lib/use-post-editor-image-actions";
import { usePostEditorModals } from "@/lib/use-post-editor-modals";
import { usePostEditorTags } from "@/lib/use-post-editor-tags";
import { usePostEditorSave, type PublishStatus } from "@/lib/use-post-editor-save";
import type { PostStatus } from "@/lib/db";

const SITE_URL = getSiteUrl();
const SITE_DISPLAY_URL = getSiteDisplayUrl();

const EMPTY_DOCUMENT = {
  type: "doc",
  content: [{ type: "paragraph" }],
} satisfies JSONContent;

const STATUS_CONFIG = [
  { key: "public" as const, label: "公开访问", desc: "所有人可见，出现在首页和搜索", Icon: Globe },
  { key: "draft" as const, label: "草稿自见", desc: "仅自己可见，不会发布", Icon: Eye },
  { key: "encrypted" as const, label: "加密访问", desc: "需要密码才能查看", Icon: Lock },
  {
    key: "unlisted" as const,
    label: "链接访问",
    desc: "不在首页显示，但可通过链接访问",
    Icon: Link2,
  },
];

function calcReadTime(chars: number): string {
  const minutes = Math.max(1, Math.ceil(chars / 400));
  return `约${minutes}分钟阅读`;
}

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  return `${Math.floor(diff / 3600)}小时前`;
}

function getSaveStatusDisplay(saveState: SaveState, lastSavedAt: number) {
  const text = {
    saved: `已保存 · ${relativeTime(lastSavedAt)}`,
    dirty: "未保存",
    saving: "保存中…",
    error: "保存失败",
  }[saveState];
  const color =
    saveState === "saved"
      ? "text-emerald-600"
      : saveState === "error"
        ? "text-orange-500"
        : "text-[var(--stone-gray)]";
  return { saveStatusColor: color, saveStatusText: text };
}

function getInitialPublishStatus(initialData: PostEditorProps["initialData"]): PublishStatus {
  if (initialData?.status === "draft") return "draft";
  if (initialData?.password) return "encrypted";
  return initialData?.is_hidden ? "unlisted" : "public";
}

function valueOrFallback<T>(value: T | null | undefined, fallback: T): T {
  return value ? value : fallback;
}

function nullableSlug(slug: string): string | null {
  return slug ? slug : null;
}

function getInitialEditorState(initialData: PostEditorProps["initialData"]) {
  const data: NonNullable<PostEditorProps["initialData"]> = initialData ?? {
    slug: "",
    title: "",
    html: "",
  };
  return {
    editSlug: nullableSlug(data.slug),
    title: data.title,
    category: valueOrFallback(data.category, "未分类"),
    tags: valueOrFallback(data.tags, []),
    description: valueOrFallback(data.description, ""),
    coverImage: valueOrFallback(data.cover_image, ""),
    slug: data.slug,
    hasHtml: Boolean(data.html),
  };
}

export interface PostEditorProps {
  initialData?: {
    slug: string;
    title: string;
    html: string;
    category?: string;
    status?: PostStatus;
    password?: string | null;
    is_hidden?: number;
    tags?: string[];
    description?: string | null;
    cover_image?: string | null;
  };
}

export function usePostEditorController({ initialData }: PostEditorProps = {}) {
  const initial = getInitialEditorState(initialData);
  // ── Core state ──
  const [draftReady, setDraftReady] = useState(false);
  const [initialContent] = useState<JSONContent>(EMPTY_DOCUMENT);
  const editorRef = useRef<Editor | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileUploadRef = useRef<HTMLInputElement | null>(null);

  // ── Fields ──
  const [editSlug, setEditSlug] = useState(initial.editSlug);
  const [title, setTitle] = useState(initial.title);
  const latestTitleRef = useRef(initial.title);
  const [charCount, setCharCount] = useState(0);
  const [category, setCategory] = useState(initial.category);
  const [publishStatus, setPublishStatus] = useState<PublishStatus>(() =>
    getInitialPublishStatus(initialData),
  );
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [description, setDescription] = useState(initial.description);
  const [coverImage, setCoverImage] = useState(initial.coverImage);
  const [slug, setSlug] = useState(initial.slug);

  // ── UI state ──
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [publishPanelOpen, setPublishPanelOpen] = useState(false);
  const [wechatPublishOpen, setWechatPublishOpen] = useState(false);
  const [referenceImageTarget, setReferenceImageTarget] = useState<EditorImageActionTarget | null>(
    null,
  );
  const [cropImageTarget, setCropImageTarget] = useState<EditorImageActionTarget | null>(null);
  const [, setTick] = useState(0); // force re-render for relative time
  const publishPanelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const toast = useToast();

  const skipNextEditorUpdateRef = useRef(initial.hasHtml);
  const slugInputFocusedRef = useRef(false);
  const {
    abortAutosaveRequest,
    buildAutosaveSnapshot,
    clearAutosaveTimers,
    lastAutosaveSnapshotRef,
    lastSavedAt,
    markDirty,
    saveState,
    scheduleDraftSave,
    setLastSavedAt,
    setSaveState,
    syncPersistedSlug,
  } = usePostEditorAutosave({
    category,
    coverImage,
    description,
    draftReady,
    editSlug,
    editorRef,
    latestTitleRef,
    setEditSlug,
    setSlug,
    slug,
    slugInputFocusedRef,
    tags,
  });
  const { feedback, handleSave, saving, setFeedback } = usePostEditorSave({
    abortAutosaveRequest,
    buildAutosaveSnapshot,
    category,
    clearAutosaveTimers,
    coverImage,
    description,
    editSlug,
    editorRef,
    initialPassword: initialData?.password,
    lastAutosaveSnapshotRef,
    latestTitleRef,
    publishStatus,
    setDescription,
    setLastSavedAt,
    setPublishPanelOpen,
    setSaveState,
    setTitle,
    slug,
    syncPersistedSlug,
    tags,
    title,
  });
  usePostEditorLifecycle({
    draftReady,
    editSlug,
    handleSave,
    publishPanelOpen,
    publishPanelRef,
    setDraftReady,
    setPublishPanelOpen,
    setSidebarOpen,
    setTick,
    sidebarOpen,
    titleRef,
  });
  const { handleCopyWechat, handleDownloadPdf, handleOpenWechatPublish } =
    usePostEditorDocumentActions({ editorRef, setWechatPublishOpen, title, toast });

  const {
    aiModal,
    closeAiModal,
    closeImageModal,
    handleInputModalCancel,
    handleInputModalConfirm,
    imageModal,
    inputModal,
    openDocumentAIModal,
    openDocumentImageModal,
  } = usePostEditorModals(editorRef, title);

  useEditorUploadTriggers(fileInputRef, fileUploadRef);

  const clearFeedback = useCallback(() => setFeedback(null), []);
  const setErrorFeedback = useCallback(
    (message: string) => setFeedback({ type: "error", message }),
    [],
  );
  const handleCoverUploaded = useCallback(
    (url: string) => {
      setCoverImage(url);
      markDirty({ coverImage: url });
    },
    [markDirty],
  );
  const {
    coverInputRef,
    handleCoverUpload,
    handleImageValidationError,
    handleSelectedFiles,
    insertNonImageFile,
    uploadImageAndGetUrl,
    uploadProgress,
    uploadingImage,
  } = usePostEditorUploads({
    editorRef,
    fileInputRef,
    fileUploadRef,
    latestTitleRef,
    onClearFeedback: clearFeedback,
    onCoverUploaded: handleCoverUploaded,
    onError: setErrorFeedback,
    scheduleDraftSave,
  });

  const { applyImageActionResult, imageExtensions, insertGeneratedImage } =
    usePostEditorImageActions({
      closeImageModal,
      editorRef,
      imageInsertPosition: imageModal.insertPos,
      markDirty,
      setCoverImage,
      setCropImageTarget,
      setFeedback,
      setReferenceImageTarget,
    });

  const { addTag, removeTag, setTagInput, tagInput } = usePostEditorTags(tags, setTags, markDirty);
  const { handleGenerateMetadata, isMetadataTargetPending } = usePostEditorMetadata({
    category,
    description,
    editSlug,
    editorRef,
    latestTitleRef,
    markDirty,
    onClearFeedback: clearFeedback,
    onError: setErrorFeedback,
    setCoverImage,
    setDescription,
    setSlug,
    setTagInput,
    setTags,
    slug,
    tags,
    toast,
  });
  // ── Auto resize title ──
  const autoResizeTitle = (el: HTMLTextAreaElement) => {
    resizeTextareaHeight(el);
  };

  useAutoResizeTextarea(titleRef);

  useEffect(() => {
    resizeTextareaHeight(titleRef.current);
  }, [title, sidebarOpen, draftReady]);

  const { saveStatusColor, saveStatusText } = getSaveStatusDisplay(saveState, lastSavedAt);

  const showSidebar = sidebarOpen;
  const wechatSourceUrl = useMemo(() => {
    const currentSlug = normalizePostSlug(editSlug || slug);
    return currentSlug ? `https://${SITE_DISPLAY_URL}/${currentSlug}` : "";
  }, [editSlug, slug]);
  const editorProps = useMemo(
    () =>
      buildEditorProps(
        uploadImageAndGetUrl,
        insertNonImageFile,
        "editor-main-prose",
        handleImageValidationError,
      ),
    [handleImageValidationError, insertNonImageFile, uploadImageAndGetUrl],
  );

  return {
    STATUS_CONFIG,
    SITE_DISPLAY_URL,
    SITE_URL,
    addTag,
    aiModal,
    applyImageActionResult,
    autoResizeTitle,
    buildAutosaveSnapshot,
    category,
    charCount,
    closeAiModal,
    closeImageModal,
    coverImage,
    coverInputRef,
    cropImageTarget,
    description,
    draftReady,
    editSlug,
    editorProps,
    editorRef,
    feedback,
    fileInputRef,
    fileUploadRef,
    handleCopyWechat,
    handleCoverUpload,
    handleDownloadPdf,
    handleGenerateMetadata,
    handleInputModalCancel,
    handleInputModalConfirm,
    handleOpenWechatPublish,
    handleSave,
    handleSelectedFiles,
    imageExtensions,
    imageModal,
    initialContent,
    initialData,
    inputModal,
    insertGeneratedImage,
    isMetadataTargetPending,
    lastAutosaveSnapshotRef,
    latestTitleRef,
    markDirty,
    openDocumentAIModal,
    openDocumentImageModal,
    publishPanelOpen,
    publishPanelRef,
    publishStatus,
    referenceImageTarget,
    removeTag,
    saveState,
    saveStatusColor,
    saveStatusText,
    saving,
    scheduleDraftSave,
    setCategory,
    setCharCount,
    setCoverImage,
    setCropImageTarget,
    setDescription,
    setFeedback,
    setPublishPanelOpen,
    setPublishStatus,
    setReferenceImageTarget,
    setSidebarOpen,
    setSlug,
    setTagInput,
    setTitle,
    setWechatPublishOpen,
    showSidebar,
    sidebarOpen,
    skipNextEditorUpdateRef,
    slug,
    slugInputFocusedRef,
    tagInput,
    tags,
    title,
    titleRef,
    uploadImageAndGetUrl,
    uploadProgress,
    uploadingImage,
    wechatPublishOpen,
    wechatSourceUrl,
    calcReadTime,
  };
}

export type PostEditorController = ReturnType<typeof usePostEditorController>;
