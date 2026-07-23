import { ImageIcon, Loader2, WandSparkles, X } from "lucide-react";
import { getEditorImagePreviewUrl } from "@/lib/editor-file-upload";
import { normalizePostSlug, sanitizePostSlugInput } from "@/lib/post-utils";
import type { PostEditorController } from "@/lib/use-post-editor-controller";

interface Props {
  controller: PostEditorController;
}

export function PostEditorSidebar({ controller }: Props) {
  return (
    <aside
      className={`sticky top-14 shrink-0 border-l border-[var(--editor-line)] bg-[var(--background)] overflow-y-auto overflow-x-hidden transition-all duration-200 ease-in-out ${
        controller.showSidebar ? "w-[280px]" : "w-0 border-l-0"
      }`}
      style={{ height: "calc(100vh - 3.5rem)" }}
    >
      {controller.showSidebar && (
        <div className="w-[280px] px-5 py-6 space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--stone-gray)] uppercase tracking-wider">
              文章设置
            </span>
            <button
              type="button"
              onClick={() => controller.setSidebarOpen(false)}
              className="text-[var(--stone-gray)] hover:text-[var(--editor-ink)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <TagsField controller={controller} />
          <DescriptionField controller={controller} />
          <CoverField controller={controller} />
          <SlugField controller={controller} />
        </div>
      )}
    </aside>
  );
}

function GenerateButton({
  target,
  controller,
}: {
  target: "tags" | "summary" | "cover" | "slug";
  controller: PostEditorController;
}) {
  const pending = controller.isMetadataTargetPending(target);
  return (
    <button
      type="button"
      onClick={() => void controller.handleGenerateMetadata(target)}
      disabled={pending}
      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--editor-line)] bg-[var(--editor-panel)] text-[var(--stone-gray)] transition hover:border-[var(--editor-accent)]/40 hover:text-[var(--editor-accent)] disabled:opacity-50"
      title={`AI 生成${target}`}
      aria-label={`AI 生成${target}`}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <WandSparkles className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function FieldHeader({
  label,
  target,
  controller,
}: {
  label: string;
  target: "tags" | "summary" | "cover" | "slug";
  controller: PostEditorController;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <label className="block text-xs font-semibold tracking-wider text-[var(--stone-gray)]">
        {label}
      </label>
      <GenerateButton target={target} controller={controller} />
    </div>
  );
}

function TagsField({ controller }: Props) {
  const { addTag, removeTag, setTagInput, tagInput, tags } = controller;
  return (
    <div>
      <FieldHeader label="标签" target="tags" controller={controller} />
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag, index) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-md bg-[var(--editor-accent)]/8 px-2 py-0.5 text-xs text-[var(--editor-accent)]"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(index)}
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
          onChange={(event) => setTagInput(event.target.value)}
          onKeyDown={(event) => {
            if ((event.key === "Enter" || event.key === ",") && tagInput.trim()) {
              event.preventDefault();
              addTag(tagInput);
            }
            if (event.key === "Backspace" && !tagInput && tags.length > 0)
              removeTag(tags.length - 1);
          }}
          placeholder="添加标签…"
          className="w-full rounded-md border border-[var(--editor-line)] bg-[var(--editor-panel)] px-2.5 py-1.5 text-sm text-[var(--editor-ink)] outline-none focus:border-[var(--editor-accent)]"
        />
      )}
    </div>
  );
}

function DescriptionField({ controller }: Props) {
  return (
    <div>
      <FieldHeader label="摘要" target="summary" controller={controller} />
      <textarea
        rows={4}
        value={controller.description}
        onChange={(event) => {
          controller.setDescription(event.target.value);
          controller.markDirty({ description: event.target.value });
        }}
        placeholder="文章摘要（建议 ≤ 160 字）"
        className="w-full rounded-md border border-[var(--editor-line)] bg-[var(--editor-panel)] px-2.5 py-2 text-sm text-[var(--editor-ink)] outline-none resize-none focus:border-[var(--editor-accent)]"
      />
      <div className="mt-1 text-right text-[10px] text-[var(--stone-gray)]">
        {controller.description.length}/160
      </div>
    </div>
  );
}

function CoverField({ controller }: Props) {
  const { coverImage, coverInputRef, handleCoverUpload, markDirty, setCoverImage, SITE_URL } =
    controller;
  return (
    <div>
      <FieldHeader label="封面图" target="cover" controller={controller} />
      {coverImage ? (
        <div className="relative h-[120px] rounded-md overflow-hidden border border-[var(--editor-line)] group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getEditorImagePreviewUrl(coverImage, SITE_URL)}
            alt="封面预览"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-[var(--editor-panel)]"
            >
              <ImageIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setCoverImage("");
                markDirty({ coverImage: "" });
              }}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-[var(--editor-panel)] text-rose-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => coverInputRef.current?.click()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file?.type.startsWith("image/")) void handleCoverUpload(file);
          }}
          onDragOver={(event) => event.preventDefault()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-[var(--editor-line)] py-8 text-[var(--stone-gray)]"
        >
          <ImageIcon className="h-6 w-6" />
          <span className="text-xs">点击或拖拽上传封面</span>
        </button>
      )}
    </div>
  );
}

function SlugField({ controller }: Props) {
  const { editSlug, markDirty, setSlug, slug, slugInputFocusedRef, SITE_DISPLAY_URL } = controller;
  return (
    <div>
      <FieldHeader label="链接" target="slug" controller={controller} />
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--stone-gray)] shrink-0">slug:</span>
        <input
          type="text"
          value={slug}
          onFocus={() => {
            slugInputFocusedRef.current = true;
          }}
          onChange={(event) => {
            const nextSlug = sanitizePostSlugInput(event.target.value);
            setSlug(nextSlug);
            markDirty({ slug: nextSlug });
          }}
          onBlur={(event) => {
            slugInputFocusedRef.current = false;
            const normalizedSlug = normalizePostSlug(event.target.value);
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
  );
}
