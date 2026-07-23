"use client";

import type { Editor, JSONContent } from "@tiptap/core";
import { Eye, Globe, Link2, Lock } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { createEditorExtensions, buildEditorProps } from "@/lib/editor-extensions";
import { generatePassword } from "@/lib/password";
import {
  insertGeneratedImageAfterNode,
  insertGeneratedImageAtPosition,
  replaceImageNodeAtPosition,
} from "@/lib/editor-file-upload";
import { copyAsWechatArticleFormat, downloadArticleAsPdf } from "@/lib/wechat-copy";
import { useEditorAuxiliaryModals, useEditorUploadTriggers } from "@/lib/editor-ui";
import type { EditorImageActionTarget } from "@/lib/resizable-image";
import { buildAutoDescription, normalizePostSlug } from "@/lib/post-utils";
import { getSiteDisplayUrl, getSiteUrl } from "@/lib/site-config";
import { resizeTextareaHeight, useAutoResizeTextarea } from "@/lib/textarea-autosize";
import { usePostEditorUploads } from "@/lib/use-post-editor-uploads";
import { usePostEditorMetadata } from "@/lib/use-post-editor-metadata";
import type { PostStatus } from "@/lib/db";

type SaveFeedback = { type: "success" | "error"; message: string; slug?: string } | null;

type PublishStatus = "public" | "draft" | "encrypted" | "unlisted";
type SaveState = "saved" | "dirty" | "saving" | "error";

const SIDEBAR_KEY = "blog:sidebar-open";
const AUTOSAVE_DEBOUNCE_MS = 1500;
const AUTOSAVE_MAX_RETRY_DELAY_MS = 10000;
const SITE_URL = getSiteUrl();
const SITE_DISPLAY_URL = getSiteDisplayUrl();

const EMPTY_DOCUMENT = {
  type: "doc",
  content: [{ type: "paragraph" }],
} satisfies JSONContent;

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

type DraftMetaState = {
  editSlug: string | null;
  slug: string;
  category: string;
  tags: string[];
  description: string;
  coverImage: string;
};

export function usePostEditorController({ initialData }: PostEditorProps = {}) {
  // ── Core state ──
  const [draftReady, setDraftReady] = useState(false);
  const [initialContent] = useState<JSONContent>(EMPTY_DOCUMENT);
  const editorRef = useRef<Editor | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileUploadRef = useRef<HTMLInputElement | null>(null);

  // ── Fields ──
  const [editSlug, setEditSlug] = useState(initialData?.slug ?? null);
  const [title, setTitle] = useState(initialData?.title ?? "");
  const latestTitleRef = useRef(initialData?.title ?? "");
  const [charCount, setCharCount] = useState(0);
  const [category, setCategory] = useState(initialData?.category || "未分类");
  const [publishStatus, setPublishStatus] = useState<PublishStatus>(
    initialData?.status === "draft"
      ? "draft"
      : initialData?.password
        ? "encrypted"
        : initialData?.is_hidden
          ? "unlisted"
          : "public",
  );
  const [tags, setTags] = useState<string[]>(initialData?.tags || []);
  const [description, setDescription] = useState(initialData?.description || "");
  const [coverImage, setCoverImage] = useState(initialData?.cover_image || "");
  const [slug, setSlug] = useState(initialData?.slug || "");

  // ── UI state ──
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [publishPanelOpen, setPublishPanelOpen] = useState(false);
  const [wechatPublishOpen, setWechatPublishOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<SaveFeedback>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<number>(Date.now());
  const [referenceImageTarget, setReferenceImageTarget] = useState<EditorImageActionTarget | null>(
    null,
  );
  const [cropImageTarget, setCropImageTarget] = useState<EditorImageActionTarget | null>(null);
  const [, setTick] = useState(0); // force re-render for relative time
  const publishPanelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const toast = useToast();

  // Draft save refs
  const draftSaveTimerRef = useRef<number | null>(null);
  const retrySaveTimerRef = useRef<number | null>(null);
  const autosaveAbortRef = useRef<AbortController | null>(null);
  const autosaveSeqRef = useRef(0);
  const lastAutosaveSnapshotRef = useRef<string | null>(null);
  const skipNextEditorUpdateRef = useRef(Boolean(initialData?.html));
  const slugInputFocusedRef = useRef(false);
  const latestMetaRef = useRef<DraftMetaState>({
    editSlug: initialData?.slug ?? null,
    slug: initialData?.slug || "",
    category: initialData?.category || "未分类",
    tags: initialData?.tags || [],
    description: initialData?.description || "",
    coverImage: initialData?.cover_image || "",
  });

  // ── Init ──
  useEffect(() => {
    setDraftReady(true);

    // Load sidebar preference
    if (typeof window !== "undefined") {
      setSidebarOpen(window.localStorage.getItem(SIDEBAR_KEY) === "true");
    }
  }, []);

  // Persist sidebar preference
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SIDEBAR_KEY, String(sidebarOpen));
    }
  }, [sidebarOpen]);

  useEffect(() => {
    latestMetaRef.current = {
      editSlug,
      slug,
      category,
      tags,
      description,
      coverImage,
    };
  }, [editSlug, slug, category, tags, description, coverImage]);

  // Relative time ticker
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (draftSaveTimerRef.current !== null) window.clearTimeout(draftSaveTimerRef.current);
      if (retrySaveTimerRef.current !== null) window.clearTimeout(retrySaveTimerRef.current);
      autosaveAbortRef.current?.abort();
    };
  }, []);

  // Auto-focus title on new post
  useEffect(() => {
    if (draftReady && !editSlug && titleRef.current) {
      titleRef.current.focus();
    }
  }, [draftReady, editSlug]);

  // Click outside to close publish panel
  useEffect(() => {
    if (!publishPanelOpen) return;
    const handler = (e: MouseEvent) => {
      if (publishPanelRef.current && !publishPanelRef.current.contains(e.target as Node)) {
        setPublishPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [publishPanelOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
      if (e.key === "Escape") {
        setPublishPanelOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  });

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
  } = useEditorAuxiliaryModals({
    title,
    getDocumentText: () => editorRef.current?.getText({ blockSeparator: "\n\n" }).trim() || "",
    getSelectionContext: () => {
      const selection = editorRef.current?.state.selection;
      return {
        insertPos: selection?.to ?? null,
        selectedText: selection
          ? editorRef.current?.state.doc.textBetween(selection.from, selection.to, "\n").trim() ||
            ""
          : "",
      };
    },
  });

  useEditorUploadTriggers(fileInputRef, fileUploadRef);

  const insertGeneratedImage = useCallback(
    (imageUrl: string, alt: string) => {
      const editor = editorRef.current;
      if (!editor) return;

      insertGeneratedImageAtPosition(editor, imageUrl, alt, imageModal.insertPos);
      closeImageModal();
    },
    [closeImageModal, imageModal.insertPos],
  );

  const applyImageActionResult = useCallback(
    (
      target: EditorImageActionTarget,
      imageUrl: string,
      alt: string,
      placementMode: "insert" | "replace" = "replace",
    ) => {
      const editor = editorRef.current;
      if (!editor) return;

      const nextAlt = alt || target.alt || "";

      if (placementMode === "replace") {
        replaceImageNodeAtPosition(editor, imageUrl, nextAlt, target.pos);
      } else {
        insertGeneratedImageAfterNode(editor, imageUrl, nextAlt, target.pos);
      }
    },
    [],
  );

  const buildAutosaveSnapshot = useCallback(
    (payload: {
      currentSlug: string | null;
      nextSlug: string;
      title: string;
      html: string;
      description: string;
      category: string;
      tags: string[];
      coverImage: string;
    }) => {
      return JSON.stringify({
        currentSlug: payload.currentSlug,
        nextSlug: payload.nextSlug,
        title: payload.title,
        html: payload.html,
        description: payload.description,
        category: payload.category,
        tags: payload.tags,
        coverImage: payload.coverImage,
      });
    },
    [],
  );

  const clearAutosaveTimers = useCallback(() => {
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    if (retrySaveTimerRef.current !== null) {
      window.clearTimeout(retrySaveTimerRef.current);
      retrySaveTimerRef.current = null;
    }
  }, []);

  const abortAutosaveRequest = useCallback(() => {
    autosaveAbortRef.current?.abort();
    autosaveAbortRef.current = null;
  }, []);

  const syncPersistedSlug = useCallback(
    (persistedSlug: string, previousSlug: string | null, forceVisibleSync = false) => {
      const shouldSyncVisibleSlug =
        forceVisibleSync ||
        !slugInputFocusedRef.current ||
        latestMetaRef.current.slug === persistedSlug;

      latestMetaRef.current = {
        ...latestMetaRef.current,
        editSlug: persistedSlug,
        slug: shouldSyncVisibleSlug ? persistedSlug : latestMetaRef.current.slug,
      };

      setEditSlug(persistedSlug);
      if (shouldSyncVisibleSlug) {
        setSlug(persistedSlug);
      }

      if (persistedSlug !== previousSlug) {
        window.history.replaceState({}, "", `/editor?edit=${encodeURIComponent(persistedSlug)}`);
      }
    },
    [],
  );

  const persistDraft = useCallback(
    async (nextTitle = latestTitleRef.current, editor = editorRef.current, retryAttempt = 0) => {
      if (typeof window === "undefined" || !draftReady || !editor) return;

      const {
        editSlug: currentSlug,
        slug: nextSlugRaw,
        category,
        tags,
        description,
        coverImage,
      } = latestMetaRef.current;
      const nextSlug = normalizePostSlug(nextSlugRaw);
      const normalizedTitle = nextTitle.trim() || "无标题";
      const contentJson = editor.getJSON();
      const html = editor.getHTML();
      const plainText = editor.getText({ blockSeparator: "\n\n" }).trim();
      const hasMedia = /<(img|video|audio|iframe)\b/i.test(html);
      const hasMeaningfulContent = Boolean(nextTitle.trim() || plainText || hasMedia);

      if (!hasMeaningfulContent) {
        setSaveState("saved");
        return;
      }

      const normalizedDescription = (description || buildAutoDescription(plainText) || "").trim();
      const snapshot = buildAutosaveSnapshot({
        currentSlug,
        nextSlug,
        title: normalizedTitle,
        html,
        description: normalizedDescription,
        category,
        tags,
        coverImage,
      });

      if (snapshot === lastAutosaveSnapshotRef.current) {
        setSaveState("saved");
        return;
      }

      const requestId = autosaveSeqRef.current + 1;
      autosaveSeqRef.current = requestId;

      abortAutosaveRequest();
      const controller = new AbortController();
      autosaveAbortRef.current = controller;

      setSaveState("saving");

      try {
        if (currentSlug) {
          const res = await fetch("/api/posts", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              current_slug: currentSlug,
              new_slug: nextSlug && nextSlug !== currentSlug ? nextSlug : undefined,
              title: normalizedTitle,
              html,
              content: plainText || JSON.stringify(contentJson),
              description: normalizedDescription,
              category,
              tags,
              cover_image: coverImage,
            }),
            signal: controller.signal,
          });

          const data = (await res.json().catch(() => ({}))) as { error?: string; slug?: string };
          if (!res.ok) {
            throw new Error(data.error || "自动保存失败");
          }

          if (requestId !== autosaveSeqRef.current) return;

          const persistedSlug = typeof data.slug === "string" ? data.slug : currentSlug;
          if (persistedSlug !== currentSlug || latestMetaRef.current.slug !== persistedSlug) {
            syncPersistedSlug(persistedSlug, currentSlug);
          }
        } else {
          const res = await fetch("/api/posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: normalizedTitle,
              html,
              content: plainText || JSON.stringify(contentJson),
              category,
              status: "draft",
              tags,
              description: normalizedDescription,
              cover_image: coverImage,
            }),
            signal: controller.signal,
          });

          const data = (await res.json().catch(() => ({}))) as { error?: string; slug?: string };
          if (!res.ok) {
            throw new Error(data.error || "自动保存失败");
          }

          if (requestId !== autosaveSeqRef.current) return;

          if (typeof data.slug === "string" && data.slug) {
            syncPersistedSlug(data.slug, null, true);
          }
        }

        if (requestId !== autosaveSeqRef.current) return;

        lastAutosaveSnapshotRef.current = snapshot;
        setSaveState("saved");
        setLastSavedAt(Date.now());
      } catch (error) {
        if (controller.signal.aborted) return;
        if (requestId !== autosaveSeqRef.current) return;

        console.error("Auto-save failed:", error);
        setSaveState("error");

        const nextAttempt = retryAttempt + 1;
        const delay = Math.min(AUTOSAVE_MAX_RETRY_DELAY_MS, 2000 * 2 ** retryAttempt);
        retrySaveTimerRef.current = window.setTimeout(() => {
          if (editorRef.current) {
            void persistDraft(latestTitleRef.current, editorRef.current, nextAttempt);
          }
        }, delay);
      } finally {
        if (autosaveAbortRef.current === controller) {
          autosaveAbortRef.current = null;
        }
      }
    },
    [abortAutosaveRequest, buildAutosaveSnapshot, draftReady, syncPersistedSlug],
  );

  // ── Draft save ──
  const scheduleDraftSave = useCallback(
    (nextTitle = latestTitleRef.current, editor = editorRef.current) => {
      if (typeof window === "undefined" || !draftReady || !editor) return;

      latestTitleRef.current = nextTitle;
      clearAutosaveTimers();
      setSaveState((prev) => (prev === "saving" ? prev : "dirty"));

      draftSaveTimerRef.current = window.setTimeout(() => {
        void persistDraft(nextTitle, editor);
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [clearAutosaveTimers, draftReady, persistDraft],
  );

  const markDirty = useCallback(
    (metaOverrides?: Partial<DraftMetaState>) => {
      if (metaOverrides && Object.keys(metaOverrides).length > 0) {
        latestMetaRef.current = {
          ...latestMetaRef.current,
          ...metaOverrides,
        };
      }
      scheduleDraftSave();
    },
    [scheduleDraftSave],
  );

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

  const imageExtensions = useMemo(
    () =>
      createEditorExtensions({
        imageActions: {
          onSetCover: (target) => {
            setCoverImage(target.src);
            markDirty({ coverImage: target.src });
            setFeedback({ type: "success", message: "已设为封面" });
          },
          onOpenReferenceImage: (target) => {
            setReferenceImageTarget(target);
          },
          onOpenCrop: (target) => {
            setCropImageTarget(target);
          },
        },
      }),
    [markDirty],
  );

  // ── Save ──
  const handleSave = async () => {
    const editor = editorRef.current;
    const normalizedTitle = title.trim();
    const normalizedSlug = normalizePostSlug(slug);
    if (!normalizedTitle) {
      setFeedback({ type: "error", message: "先把文章标题写上。" });
      return;
    }
    if (!editor) {
      setFeedback({ type: "error", message: "编辑器还没准备好。" });
      return;
    }
    const content = editor.getText({ blockSeparator: "\n\n" }).trim();
    const html = editor.getHTML();
    const hasContent = content || /<(img|video|audio|iframe)\s/.test(html);
    if (!hasContent) {
      setFeedback({ type: "error", message: "正文还是空的。" });
      return;
    }
    const normalizedDescription = (description || buildAutoDescription(content) || "").trim();

    clearAutosaveTimers();
    abortAutosaveRequest();

    setSaving(true);
    setSaveState("saving");
    setFeedback(null);

    try {
      const isEdit = editSlug !== null;
      const url = isEdit ? `/api/admin/posts/${editSlug}` : "/api/posts";
      const method = isEdit ? "PUT" : "POST";

      let statusFields: { status: string; is_hidden: number; password?: string | null };
      if (publishStatus === "encrypted") {
        statusFields = {
          status: "published",
          is_hidden: 0,
          password: initialData?.password || generatePassword(),
        };
      } else {
        const m = {
          public: { status: "published", is_hidden: 0, password: null },
          draft: { status: "draft", is_hidden: 0, password: null },
          unlisted: { status: "published", is_hidden: 1, password: null },
        };
        statusFields = m[publishStatus as "public" | "draft" | "unlisted"];
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: normalizedSlug || (isEdit ? editSlug : undefined),
          title: normalizedTitle,
          content,
          html,
          category,
          ...statusFields,
          tags,
          description: normalizedDescription,
          cover_image: coverImage || null,
        }),
      });
      const result = (await response.json()) as {
        success?: boolean;
        slug?: string;
        error?: string;
      };
      if (!response.ok || !result.success) throw new Error(result.error || "保存失败");

      const persistedSlug: string | null =
        typeof result.slug === "string" ? result.slug : isEdit ? editSlug : null;
      const snapshot = buildAutosaveSnapshot({
        currentSlug: persistedSlug,
        nextSlug: persistedSlug || "",
        title: normalizedTitle,
        html,
        description: (description || buildAutoDescription(content) || "").trim(),
        category,
        tags,
        coverImage,
      });
      lastAutosaveSnapshotRef.current = snapshot;

      setSaveState("saved");
      setLastSavedAt(Date.now());

      if (isEdit) {
        if (!description && normalizedDescription) {
          setDescription(normalizedDescription);
        }
        if (persistedSlug) {
          syncPersistedSlug(persistedSlug, editSlug, true);
        }
        setFeedback({
          type: "success",
          message: "文章已更新。",
          slug: persistedSlug || editSlug || undefined,
        });
      } else {
        if (!description && normalizedDescription) {
          setDescription(normalizedDescription);
        }
        const msgs = {
          public: "已发布",
          draft: "草稿已保存",
          encrypted: "已发布（加密）",
          unlisted: "已发布（链接访问）",
        };
        setFeedback({ type: "success", message: `${msgs[publishStatus]}`, slug: result.slug });
        setTitle("");
        latestTitleRef.current = "";
        lastAutosaveSnapshotRef.current = null;
        editor.commands.clearContent();
      }
      setPublishPanelOpen(false);
    } catch (error) {
      setSaveState("error");
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "保存失败" });
    } finally {
      setSaving(false);
    }
  };

  const handleCopyWechat = async () => {
    const editor = editorRef.current;
    const normalizedTitle = title.trim() || "无标题";

    if (!editor) {
      toast.error("编辑器还没准备好。");
      return;
    }

    const content = editor.getText({ blockSeparator: "\n\n" }).trim();
    const html = editor.getHTML();
    const hasContent = content || /<(img|video|audio|iframe)\s/i.test(html);

    if (!hasContent) {
      toast.error("正文还是空的。");
      return;
    }

    try {
      await copyAsWechatArticleFormat(normalizedTitle, html);
      toast.success("已复制公众号格式");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "复制公众号格式失败");
    }
  };

  const handleDownloadPdf = async () => {
    const editor = editorRef.current;
    const normalizedTitle = title.trim() || "无标题";

    if (!editor) {
      toast.error("编辑器还没准备好。");
      return;
    }

    const content = editor.getText({ blockSeparator: "\n\n" }).trim();
    const html = editor.getHTML();
    const hasContent = content || /<(img|video|audio|iframe)\s/i.test(html);

    if (!hasContent) {
      toast.error("正文还是空的。");
      return;
    }

    try {
      await downloadArticleAsPdf(normalizedTitle, html);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出 PDF 失败");
    }
  };

  const handleOpenWechatPublish = () => {
    const editor = editorRef.current;

    if (!editor) {
      toast.error("编辑器还没准备好。");
      return;
    }

    const content = editor.getText({ blockSeparator: "\n\n" }).trim();
    const html = editor.getHTML();
    const hasContent = content || /<(img|video|audio|iframe)\s/i.test(html);

    if (!hasContent) {
      toast.error("正文还是空的。");
      return;
    }

    setWechatPublishOpen(true);
  };

  // ── Tag input ──
  const [tagInput, setTagInput] = useState("");
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
  const addTag = (value: string) => {
    const t = value.trim().slice(0, 20);
    if (!t || tags.includes(t) || tags.length >= 10) return;
    const nextTags = [...tags, t];
    setTags(nextTags);
    setTagInput("");
    markDirty({ tags: nextTags });
  };
  const removeTag = (idx: number) => {
    const nextTags = tags.filter((_, i) => i !== idx);
    setTags(nextTags);
    markDirty({ tags: nextTags });
  };

  // ── Auto resize title ──
  const autoResizeTitle = (el: HTMLTextAreaElement) => {
    resizeTextareaHeight(el);
  };

  useAutoResizeTextarea(titleRef);

  useEffect(() => {
    resizeTextareaHeight(titleRef.current);
  }, [title, sidebarOpen, draftReady]);

  // ── Status config ──
  const STATUS_CONFIG = [
    {
      key: "public" as const,
      label: "公开访问",
      desc: "所有人可见，出现在首页和搜索",
      Icon: Globe,
    },
    { key: "draft" as const, label: "草稿自见", desc: "仅自己可见，不会发布", Icon: Eye },
    { key: "encrypted" as const, label: "加密访问", desc: "需要密码才能查看", Icon: Lock },
    {
      key: "unlisted" as const,
      label: "链接访问",
      desc: "不在首页显示，但可通过链接访问",
      Icon: Link2,
    },
  ];

  // ── Save status display ──
  const saveStatusText =
    saveState === "saved"
      ? `已保存 · ${relativeTime(lastSavedAt)}`
      : saveState === "dirty"
        ? "未保存"
        : saveState === "saving"
          ? "保存中…"
          : "保存失败";

  const saveStatusColor =
    saveState === "saved"
      ? "text-emerald-600"
      : saveState === "error"
        ? "text-orange-500"
        : "text-[var(--stone-gray)]";

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
