"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ChevronUp,
  Copy,
  FileDown,
  Globe,
  ImageIcon,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Send,
  WandSparkles,
  X,
} from "lucide-react";
import { AIModal } from "@/lib/ai-modal";
import { CategorySelector } from "@/components/CategorySelector";
import { ImageCropModal } from "@/components/ImageCropModal";
import { ImageGenerationModal } from "@/components/ImageGenerationModal";
import { InputModal } from "@/components/InputModal";
import { TiptapEditorSurface } from "@/components/TiptapEditorSurface";
import { WeChatPublishModal } from "@/components/WeChatPublishModal";
import { FormattingBubble, getEditorCharacterCount } from "@/lib/editor-extensions";
import { getEditorImagePreviewUrl } from "@/lib/editor-file-upload";
import { setEditorHtmlContent } from "@/lib/editor-content";
import { extractFilesFromClipboard } from "@/lib/editor-ui";
import { resolvePostCoverImage } from "@/lib/default-cover-images";
import { normalizePostSlug, sanitizePostSlugInput } from "@/lib/post-utils";
import { usePostEditorController, type PostEditorProps } from "@/lib/use-post-editor-controller";

export function PostEditor(props: PostEditorProps = {}) {
  const {
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
  } = usePostEditorController(props);

  return (
    <div className="min-h-screen bg-[var(--editor-app-bg)]">
      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-40 h-14 border-b border-[var(--editor-line)] bg-[color-mix(in_srgb,var(--background)_90%,transparent)] backdrop-blur-lg">
        <div className="flex h-full items-center gap-2 px-4">
          {/* Left: Back */}
          <Link
            href="/admin/posts"
            className="flex items-center gap-1 shrink-0 text-sm text-[var(--editor-muted)] hover:text-[var(--editor-ink)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">文章列表</span>
          </Link>

          <div className="mx-1 h-4 w-px bg-[var(--editor-line)]" />

          {/* Center: Save status + Word count */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`flex items-center gap-1.5 text-sm min-w-[140px] ${saveStatusColor}`}>
              <span
                className={`inline-block h-2 w-2 rounded-full shrink-0 ${
                  saveState === "saved"
                    ? "bg-emerald-500"
                    : saveState === "dirty"
                      ? "bg-gray-300"
                      : saveState === "saving"
                        ? "bg-gray-400 animate-pulse"
                        : "bg-orange-500"
                }`}
              />
              <span className="truncate">{saveStatusText}</span>
            </div>

            {charCount > 0 && (
              <>
                <div className="hidden sm:block h-4 w-px bg-[var(--editor-line)]" />
                <div className="hidden sm:flex items-center gap-2">
                  <span className="text-sm text-[var(--stone-gray)] whitespace-nowrap tabular-nums">
                    {charCount.toLocaleString()} 字 · {calcReadTime(charCount)}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Upload progress (overlay) */}
          {uploadingImage && (
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-20 h-1.5 bg-[var(--editor-line)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--editor-accent)] transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <span className="text-xs text-[var(--editor-muted)] tabular-nums">
                {uploadProgress}%
              </span>
            </div>
          )}

          {/* Right: Actions */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleCopyWechat}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--editor-muted)] hover:bg-[var(--editor-soft)] hover:text-[var(--editor-accent)] transition"
              title="复制公众号格式"
            >
              <Copy className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={handleOpenWechatPublish}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--editor-muted)] hover:bg-[var(--editor-soft)] hover:text-[var(--editor-accent)] transition"
              title="发布到公众号"
            >
              <Send className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--editor-muted)] hover:bg-[var(--editor-soft)] hover:text-[var(--editor-accent)] transition"
              title="下载 PDF"
            >
              <FileDown className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={(e) => openDocumentAIModal(e.currentTarget)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--editor-muted)] hover:bg-[var(--editor-soft)] hover:text-[var(--editor-accent)] transition"
              title="Ask AI（基于标题和正文）"
            >
              <WandSparkles className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={openDocumentImageModal}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--editor-muted)] hover:bg-[var(--editor-soft)] hover:text-[var(--editor-accent)] transition"
              title="生成图片"
            >
              <ImageIcon className="h-4 w-4" />
            </button>

            {/* Sidebar toggle */}
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--editor-muted)] hover:bg-[var(--editor-soft)] transition"
              title={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
            >
              {sidebarOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </button>

            <div className="mx-0.5 h-5 w-px bg-[var(--editor-line)]" />

            {/* Category selector */}
            <CategorySelector
              value={category}
              onChange={(val) => {
                setCategory(val);
                markDirty({ category: val });
              }}
            />

            {/* Publish button + dropdown */}
            <div className="relative" ref={publishPanelRef}>
              <div className="inline-flex">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || uploadingImage}
                  className="inline-flex items-center gap-1.5 rounded-l-lg bg-[var(--editor-accent)] pl-3 pr-2 py-1.5 text-sm font-semibold text-[var(--editor-accent-ink)] transition hover:brightness-105 disabled:opacity-60"
                >
                  <Globe className="h-3.5 w-3.5" />
                  {saving ? "保存中…" : editSlug ? "更新" : "发布"}
                </button>
                <button
                  type="button"
                  onClick={() => setPublishPanelOpen(!publishPanelOpen)}
                  className="inline-flex items-center rounded-r-lg bg-[var(--editor-accent)] px-1.5 py-1.5 text-[var(--editor-accent-ink)] border-l border-[var(--editor-accent-ink)]/20 hover:brightness-105 transition"
                >
                  <ChevronUp
                    className={`h-3.5 w-3.5 transition-transform ${publishPanelOpen ? "rotate-180" : ""}`}
                  />
                </button>
              </div>

              {/* Publish panel dropdown */}
              {publishPanelOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-[var(--editor-line)] bg-[var(--editor-panel)] shadow-xl z-50 overflow-hidden">
                  <div className="px-4 pt-3 pb-2 text-xs font-semibold text-[var(--editor-muted)] uppercase tracking-wider">
                    选择发布状态
                  </div>
                  {STATUS_CONFIG.map(({ key, label, desc, Icon }) => {
                    const active = publishStatus === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPublishStatus(key)}
                        className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[var(--editor-soft)] transition ${active ? "bg-[var(--editor-accent)]/5" : ""}`}
                      >
                        <Icon
                          className={`h-5 w-5 mt-0.5 shrink-0 ${active ? "text-[var(--editor-accent)]" : "text-[var(--editor-muted)]"}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div
                            className={`text-sm font-medium ${active ? "text-[var(--editor-accent)]" : "text-[var(--editor-ink)]"}`}
                          >
                            {label}
                          </div>
                          <div className="text-xs text-[var(--editor-muted)] mt-0.5">{desc}</div>
                        </div>
                        {active && (
                          <div className="w-2 h-2 rounded-full bg-[var(--editor-accent)] mt-1.5 shrink-0" />
                        )}
                      </button>
                    );
                  })}

                  <div className="border-t border-[var(--editor-line)] px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPublishStatus("draft");
                          handleSave();
                        }}
                        disabled={saving}
                        className="px-3 py-1.5 text-sm text-[var(--editor-ink)] border border-[var(--editor-line)] rounded-lg hover:bg-[var(--editor-soft)] transition disabled:opacity-50"
                      >
                        保存草稿
                      </button>
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="px-3 py-1.5 text-sm font-semibold text-[var(--editor-accent-ink)] bg-[var(--editor-accent)] rounded-lg hover:brightness-105 transition disabled:opacity-50"
                      >
                        {saving ? "保存中…" : editSlug ? "更新文章" : "发布"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Feedback bar */}
        {feedback && (
          <div className="border-t border-[var(--editor-line)] px-4 py-2">
            <div
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                feedback.type === "success"
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-rose-50 text-rose-800"
              }`}
            >
              <span>{feedback.message}</span>
              {feedback.slug && (
                <a href={`/${feedback.slug}`} className="font-medium underline underline-offset-2">
                  打开文章
                </a>
              )}
              <button type="button" onClick={() => setFeedback(null)} className="ml-auto">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleSelectedFiles(e.target.files);
        }}
      />
      <input
        ref={fileUploadRef}
        type="file"
        accept="video/*,audio/*,.pdf,.zip,.rar,.7z,.epub,.mobi,.azw,.azw3,.txt,image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleSelectedFiles(e.target.files);
        }}
      />
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleCoverUpload(f);
        }}
      />

      {/* ── Main layout: editor + sidebar ── */}
      <div className="flex">
        {/* Main editor area */}
        <main className="flex-1 min-w-0">
          <div className="mx-auto max-w-4xl px-4 pt-10 pb-8 sm:px-6">
            {/* Title input */}
            <div className="pb-4">
              <textarea
                ref={titleRef}
                placeholder="无标题"
                value={title}
                rows={1}
                onChange={(e) => {
                  const v = e.target.value;
                  setTitle(v);
                  latestTitleRef.current = v;
                  autoResizeTitle(e.target);
                  markDirty();
                  if (feedback?.type === "error") setFeedback(null);
                }}
                onPaste={(e) => {
                  const files = extractFilesFromClipboard(e);
                  if (files.length === 0) return;

                  e.preventDefault();
                  editorRef.current?.chain().focus().run();
                  void handleSelectedFiles(files);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    editorRef.current?.chain().focus().run();
                  }
                }}
                className="editor-title-textarea block w-full appearance-none bg-transparent p-0 m-0 resize-none overflow-hidden border-0 rounded-none shadow-none outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 text-4xl font-bold leading-tight tracking-tight text-[var(--editor-ink)] placeholder:text-[var(--stone-gray)]"
                style={{ minHeight: "52px" }}
              />
            </div>

            {/* Post editor */}
            {!draftReady ? (
              <div className="editor-surface" />
            ) : (
              <div>
                <TiptapEditorSurface
                  initialContent={initialContent}
                  extensions={imageExtensions}
                  className="editor-surface"
                  editorProps={editorProps}
                  onCreate={({ editor }) => {
                    editorRef.current = editor;
                    setCharCount(getEditorCharacterCount(editor));
                    if (initialData?.html) {
                      skipNextEditorUpdateRef.current = true;
                      setEditorHtmlContent(editor, initialData.html);
                    } else {
                      skipNextEditorUpdateRef.current = false;
                    }

                    if (initialData?.slug) {
                      lastAutosaveSnapshotRef.current = buildAutosaveSnapshot({
                        currentSlug: initialData.slug,
                        nextSlug: initialData.slug,
                        title: initialData.title || "无标题",
                        html: initialData.html || "",
                        description: (initialData.description || "").trim(),
                        category: initialData.category || "未分类",
                        tags: initialData.tags || [],
                        coverImage: initialData.cover_image || "",
                      });
                    } else {
                      lastAutosaveSnapshotRef.current = null;
                    }
                  }}
                  onUpdate={({ editor }) => {
                    editorRef.current = editor;

                    if (skipNextEditorUpdateRef.current) {
                      skipNextEditorUpdateRef.current = false;
                      setCharCount(getEditorCharacterCount(editor));
                      return;
                    }

                    scheduleDraftSave(latestTitleRef.current, editor);
                    setCharCount(getEditorCharacterCount(editor));
                  }}
                  onDestroy={() => {
                    editorRef.current = null;
                  }}
                >
                  <FormattingBubble />
                </TiptapEditorSurface>
              </div>
            )}
          </div>
        </main>

        {/* ── Right Sidebar ── */}
        <aside
          className={`shrink-0 border-l border-[var(--editor-line)] bg-[var(--background)] overflow-y-auto overflow-x-hidden transition-all duration-200 ease-in-out ${
            showSidebar ? "w-[280px]" : "w-0 border-l-0"
          }`}
          style={{ position: "sticky", top: "3.5rem", height: "calc(100vh - 3.5rem)" }}
        >
          {showSidebar && (
            <div className="w-[280px] px-5 py-6 space-y-6">
              {/* Close button */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--stone-gray)] uppercase tracking-wider">
                  文章设置
                </span>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="text-[var(--stone-gray)] hover:text-[var(--editor-ink)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Tags */}
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="block text-xs font-semibold tracking-wider text-[var(--stone-gray)]">
                    标签
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleGenerateMetadata("tags")}
                    disabled={isMetadataTargetPending("tags")}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--editor-line)] bg-[var(--editor-panel)] text-[var(--stone-gray)] transition hover:border-[var(--editor-accent)]/40 hover:text-[var(--editor-accent)] disabled:cursor-not-allowed disabled:opacity-50"
                    title="AI 生成标签"
                    aria-label="AI 生成标签"
                  >
                    {isMetadataTargetPending("tags") ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <WandSparkles className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {tags.map((tag, idx) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-md bg-[var(--editor-accent)]/8 px-2 py-0.5 text-xs text-[var(--editor-accent)]"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(idx)}
                        className="hover:text-[var(--editor-ink)]"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                {tags.length < 10 && (
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
                        e.preventDefault();
                        addTag(tagInput);
                      }
                      if (e.key === "Backspace" && !tagInput && tags.length > 0)
                        removeTag(tags.length - 1);
                    }}
                    placeholder="添加标签…"
                    className="w-full rounded-md border border-[var(--editor-line)] bg-[var(--editor-panel)] px-2.5 py-1.5 text-sm text-[var(--editor-ink)] outline-none focus:border-[var(--editor-accent)]"
                  />
                )}
              </div>

              {/* Description / Excerpt */}
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="block text-xs font-semibold tracking-wider text-[var(--stone-gray)]">
                    摘要
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleGenerateMetadata("summary")}
                    disabled={isMetadataTargetPending("summary")}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--editor-line)] bg-[var(--editor-panel)] text-[var(--stone-gray)] transition hover:border-[var(--editor-accent)]/40 hover:text-[var(--editor-accent)] disabled:cursor-not-allowed disabled:opacity-50"
                    title="AI 生成摘要"
                    aria-label="AI 生成摘要"
                  >
                    {isMetadataTargetPending("summary") ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <WandSparkles className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => {
                    const nextDescription = e.target.value;
                    setDescription(nextDescription);
                    markDirty({ description: nextDescription });
                  }}
                  placeholder="文章摘要（建议 ≤ 160 字）"
                  className="w-full rounded-md border border-[var(--editor-line)] bg-[var(--editor-panel)] px-2.5 py-2 text-sm text-[var(--editor-ink)] outline-none resize-none focus:border-[var(--editor-accent)]"
                />
                <div className="mt-1 text-right text-[10px] text-[var(--stone-gray)]">
                  {description.length}/160
                </div>
              </div>

              {/* Cover Image */}
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="block text-xs font-semibold tracking-wider text-[var(--stone-gray)]">
                    封面图
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleGenerateMetadata("cover")}
                    disabled={isMetadataTargetPending("cover")}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--editor-line)] bg-[var(--editor-panel)] text-[var(--stone-gray)] transition hover:border-[var(--editor-accent)]/40 hover:text-[var(--editor-accent)] disabled:cursor-not-allowed disabled:opacity-50"
                    title="AI 生成封面"
                    aria-label="AI 生成封面"
                  >
                    {isMetadataTargetPending("cover") ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <WandSparkles className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                {coverImage ? (
                  <div
                    className="relative rounded-md overflow-hidden border border-[var(--editor-line)] group"
                    style={{ height: 120 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getEditorImagePreviewUrl(coverImage, SITE_URL)}
                      alt="封面预览"
                      className="w-full h-full object-cover"
                    />
                    {/* 悬停时显示的操作按钮 */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => coverInputRef.current?.click()}
                        className="flex items-center justify-center w-9 h-9 rounded-full bg-[var(--editor-panel)] text-[var(--editor-ink)] hover:bg-[var(--editor-soft)] transition"
                        title="重新上传"
                      >
                        <ImageIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCoverImage("");
                          markDirty({ coverImage: "" });
                        }}
                        className="flex items-center justify-center w-9 h-9 rounded-full bg-[var(--editor-panel)] text-rose-600 hover:bg-[var(--editor-soft)] transition"
                        title="删除封面"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const f = e.dataTransfer.files[0];
                      if (f?.type.startsWith("image/")) void handleCoverUpload(f);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    className="flex w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-[var(--editor-line)] py-8 text-[var(--stone-gray)] hover:border-[var(--editor-accent)]/40 hover:text-[var(--editor-accent)] transition"
                  >
                    <ImageIcon className="h-6 w-6" />
                    <span className="text-xs">点击或拖拽上传封面</span>
                  </button>
                )}
              </div>

              {/* Slug */}
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="block text-xs font-semibold tracking-wider text-[var(--stone-gray)]">
                    链接
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleGenerateMetadata("slug")}
                    disabled={isMetadataTargetPending("slug")}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--editor-line)] bg-[var(--editor-panel)] text-[var(--stone-gray)] transition hover:border-[var(--editor-accent)]/40 hover:text-[var(--editor-accent)] disabled:cursor-not-allowed disabled:opacity-50"
                    title="AI 生成 slug"
                    aria-label="AI 生成 slug"
                  >
                    {isMetadataTargetPending("slug") ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <WandSparkles className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--stone-gray)] shrink-0">slug:</span>
                  <input
                    type="text"
                    value={slug}
                    onFocus={() => {
                      slugInputFocusedRef.current = true;
                    }}
                    onChange={(e) => {
                      const nextSlug = sanitizePostSlugInput(e.target.value);
                      setSlug(nextSlug);
                      markDirty({ slug: nextSlug });
                    }}
                    onBlur={(e) => {
                      slugInputFocusedRef.current = false;
                      const normalizedSlug = normalizePostSlug(e.target.value);
                      if (normalizedSlug !== slug) {
                        setSlug(normalizedSlug);
                        markDirty({ slug: normalizedSlug });
                      }
                    }}
                    placeholder={editSlug || "auto-generated"}
                    className="flex-1 rounded-md border border-[var(--editor-line)] bg-[var(--editor-panel)] px-2 py-1.5 text-sm text-[var(--editor-ink)] outline-none focus:border-[var(--editor-accent)]"
                  />
                </div>
                <div className="mt-1 text-[10px] text-[var(--stone-gray)]">
                  {SITE_DISPLAY_URL}/{normalizePostSlug(slug) || editSlug || "自动生成"}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      <WeChatPublishModal
        isOpen={wechatPublishOpen}
        onClose={() => setWechatPublishOpen(false)}
        title={title.trim() || "无标题"}
        html={editorRef.current?.getHTML() || ""}
        defaultDigest={description}
        defaultSourceUrl={wechatSourceUrl}
        defaultCoverImageUrl={resolvePostCoverImage({
          cover_image: coverImage,
          slug: normalizePostSlug(slug) || editSlug || title,
          title,
        })}
      />

      <InputModal
        open={inputModal.open}
        title={inputModal.title}
        placeholder={inputModal.placeholder}
        onConfirm={handleInputModalConfirm}
        onCancel={handleInputModalCancel}
      />

      <ImageGenerationModal
        open={imageModal.open}
        contextText={imageModal.contextText}
        historyScope="admin-editor"
        closeOnGenerate={false}
        onClose={closeImageModal}
        onInsert={insertGeneratedImage}
      />

      <ImageGenerationModal
        open={Boolean(referenceImageTarget)}
        contextText=""
        historyScope="admin-editor"
        referenceImageUrl={referenceImageTarget?.src}
        allowReplace
        defaultPlacementMode="replace"
        closeOnGenerate={false}
        generationMode="foreground"
        onClose={() => setReferenceImageTarget(null)}
        onInsert={(imageUrl, alt, placementMode) => {
          if (!referenceImageTarget) return;
          applyImageActionResult(referenceImageTarget, imageUrl, alt, placementMode ?? "replace");
          setReferenceImageTarget(null);
        }}
      />

      <ImageCropModal
        open={Boolean(cropImageTarget)}
        imageUrl={cropImageTarget?.src || ""}
        imageAlt={cropImageTarget?.alt}
        defaultPlacementMode="replace"
        onClose={() => setCropImageTarget(null)}
        onApply={async (file, placementMode) => {
          if (!cropImageTarget) return;

          const uploaded = await uploadImageAndGetUrl(file);
          applyImageActionResult(
            cropImageTarget,
            uploaded,
            cropImageTarget.alt || file.name,
            placementMode,
          );
          setCropImageTarget(null);
        }}
      />

      {editorRef.current && (
        <AIModal
          editor={editorRef.current}
          isOpen={aiModal.open}
          onClose={closeAiModal}
          selectedText={aiModal.selectedText}
          position={aiModal.position}
          selectionRange={aiModal.selectionRange}
          initialContext={aiModal.initialContext}
          documentTitle={aiModal.documentTitle}
          documentText={aiModal.documentText}
          historyScope="admin-editor"
          onApplyTitle={(nextTitle) => {
            latestTitleRef.current = nextTitle;
            setTitle(nextTitle);
            markDirty();
          }}
        />
      )}
    </div>
  );
}
