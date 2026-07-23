import Link from "next/link";
import {
  ArrowLeft,
  ChevronUp,
  Copy,
  FileDown,
  Globe,
  ImageIcon,
  PanelRightClose,
  PanelRightOpen,
  Send,
  WandSparkles,
  X,
} from "lucide-react";
import { CategorySelector } from "@/components/CategorySelector";
import type { PostEditorController } from "@/lib/use-post-editor-controller";

interface Props {
  controller: PostEditorController;
}

export function PostEditorHeader({ controller }: Props) {
  const {
    category,
    charCount,
    feedback,
    handleCopyWechat,
    handleDownloadPdf,
    handleOpenWechatPublish,
    markDirty,
    openDocumentAIModal,
    openDocumentImageModal,
    saveState,
    saveStatusColor,
    saveStatusText,
    setCategory,
    setFeedback,
    setSidebarOpen,
    sidebarOpen,
    uploadingImage,
    uploadProgress,
    calcReadTime,
  } = controller;

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-[var(--editor-line)] bg-[color-mix(in_srgb,var(--background)_90%,transparent)] backdrop-blur-lg">
      <div className="flex h-full items-center gap-2 px-4">
        <Link
          href="/admin/posts"
          className="flex items-center gap-1 shrink-0 text-sm text-[var(--editor-muted)] hover:text-[var(--editor-ink)] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">文章列表</span>
        </Link>
        <div className="mx-1 h-4 w-px bg-[var(--editor-line)]" />

        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={`flex items-center gap-1.5 text-sm min-w-[140px] ${saveStatusColor}`}>
            <SaveStateDot saveState={saveState} />
            <span className="truncate">{saveStatusText}</span>
          </div>
          {charCount > 0 && (
            <>
              <div className="hidden sm:block h-4 w-px bg-[var(--editor-line)]" />
              <span className="hidden sm:block text-sm text-[var(--stone-gray)] whitespace-nowrap tabular-nums">
                {charCount.toLocaleString()} 字 · {calcReadTime(charCount)}
              </span>
            </>
          )}
        </div>

        {uploadingImage && <UploadProgress progress={uploadProgress} />}

        <div className="flex items-center gap-1">
          <HeaderAction title="复制公众号格式" onClick={handleCopyWechat} icon={<Copy />} />
          <HeaderAction title="发布到公众号" onClick={handleOpenWechatPublish} icon={<Send />} />
          <HeaderAction title="下载 PDF" onClick={handleDownloadPdf} icon={<FileDown />} />
          <HeaderAction
            title="Ask AI（基于标题和正文）"
            onClick={(target) => openDocumentAIModal(target)}
            icon={<WandSparkles />}
          />
          <HeaderAction title="生成图片" onClick={openDocumentImageModal} icon={<ImageIcon />} />
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
          <CategorySelector
            value={category}
            onChange={(value) => {
              setCategory(value);
              markDirty({ category: value });
            }}
          />
          <PublishControl controller={controller} />
        </div>
      </div>

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
  );
}

function SaveStateDot({ saveState }: { saveState: PostEditorController["saveState"] }) {
  const color = {
    saved: "bg-emerald-500",
    dirty: "bg-gray-300",
    saving: "bg-gray-400 animate-pulse",
    error: "bg-orange-500",
  }[saveState];
  return <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${color}`} />;
}

function UploadProgress({ progress }: { progress: number }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className="w-20 h-1.5 bg-[var(--editor-line)] rounded-full overflow-hidden">
        <div
          className="h-full bg-[var(--editor-accent)] transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-xs text-[var(--editor-muted)] tabular-nums">{progress}%</span>
    </div>
  );
}

function HeaderAction({
  title,
  onClick,
  icon,
}: {
  title: string;
  onClick: (() => void) | ((target: HTMLButtonElement) => void);
  icon: React.ReactElement<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      onClick={(event) => onClick(event.currentTarget)}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--editor-muted)] hover:bg-[var(--editor-soft)] hover:text-[var(--editor-accent)] transition"
      title={title}
    >
      {icon}
    </button>
  );
}

function PublishControl({ controller }: Props) {
  const {
    STATUS_CONFIG,
    editSlug,
    handleSave,
    publishPanelOpen,
    publishPanelRef,
    publishStatus,
    saving,
    setPublishPanelOpen,
    setPublishStatus,
    uploadingImage,
  } = controller;
  return (
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
                  <div className="w-2 h-2 rounded-full bg-[var(--editor-accent)] mt-1.5" />
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
                  void handleSave();
                }}
                disabled={saving}
                className="px-3 py-1.5 text-sm text-[var(--editor-ink)] border border-[var(--editor-line)] rounded-lg hover:bg-[var(--editor-soft)] disabled:opacity-50"
              >
                保存草稿
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 text-sm font-semibold text-[var(--editor-accent-ink)] bg-[var(--editor-accent)] rounded-lg hover:brightness-105 disabled:opacity-50"
              >
                {saving ? "保存中…" : editSlug ? "更新文章" : "发布"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
