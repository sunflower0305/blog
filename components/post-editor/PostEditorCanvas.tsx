import { FormattingBubble, getEditorCharacterCount } from "@/lib/editor-extensions";
import { setEditorHtmlContent } from "@/lib/editor-content";
import { extractFilesFromClipboard } from "@/lib/editor-ui";
import { TiptapEditorSurface } from "@/components/TiptapEditorSurface";
import type { PostEditorController } from "@/lib/use-post-editor-controller";

export function PostEditorCanvas({ controller }: { controller: PostEditorController }) {
  const {
    autoResizeTitle,
    buildAutosaveSnapshot,
    coverInputRef,
    draftReady,
    editorProps,
    editorRef,
    feedback,
    fileInputRef,
    fileUploadRef,
    handleCoverUpload,
    handleSelectedFiles,
    imageExtensions,
    initialContent,
    initialData,
    lastAutosaveSnapshotRef,
    latestTitleRef,
    markDirty,
    scheduleDraftSave,
    setCharCount,
    setFeedback,
    setTitle,
    skipNextEditorUpdateRef,
    title,
    titleRef,
  } = controller;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => void handleSelectedFiles(event.target.files)}
      />
      <input
        ref={fileUploadRef}
        type="file"
        accept="video/*,audio/*,.pdf,.zip,.rar,.7z,.epub,.mobi,.azw,.azw3,.txt,image/*"
        multiple
        className="hidden"
        onChange={(event) => void handleSelectedFiles(event.target.files)}
      />
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleCoverUpload(file);
        }}
      />

      <main className="flex-1 min-w-0">
        <div className="mx-auto max-w-4xl px-4 pt-10 pb-8 sm:px-6">
          <div className="pb-4">
            <textarea
              ref={titleRef}
              placeholder="无标题"
              value={title}
              rows={1}
              onChange={(event) => {
                const value = event.target.value;
                setTitle(value);
                latestTitleRef.current = value;
                autoResizeTitle(event.target);
                markDirty();
                if (feedback?.type === "error") setFeedback(null);
              }}
              onPaste={(event) => {
                const files = extractFilesFromClipboard(event);
                if (files.length === 0) return;
                event.preventDefault();
                editorRef.current?.chain().focus().run();
                void handleSelectedFiles(files);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                editorRef.current?.chain().focus().run();
              }}
              className="editor-title-textarea block w-full appearance-none bg-transparent p-0 m-0 resize-none overflow-hidden border-0 rounded-none shadow-none outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 text-4xl font-bold leading-tight tracking-tight text-[var(--editor-ink)] placeholder:text-[var(--stone-gray)]"
              style={{ minHeight: "52px" }}
            />
          </div>

          {!draftReady ? (
            <div className="editor-surface" />
          ) : (
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
                lastAutosaveSnapshotRef.current = initialData?.slug
                  ? buildAutosaveSnapshot({
                      currentSlug: initialData.slug,
                      nextSlug: initialData.slug,
                      title: initialData.title || "无标题",
                      html: initialData.html || "",
                      description: (initialData.description || "").trim(),
                      category: initialData.category || "未分类",
                      tags: initialData.tags || [],
                      coverImage: initialData.cover_image || "",
                    })
                  : null;
              }}
              onUpdate={({ editor }) => {
                editorRef.current = editor;
                if (skipNextEditorUpdateRef.current) {
                  skipNextEditorUpdateRef.current = false;
                } else {
                  scheduleDraftSave(latestTitleRef.current, editor);
                }
                setCharCount(getEditorCharacterCount(editor));
              }}
              onDestroy={() => {
                editorRef.current = null;
              }}
            >
              <FormattingBubble />
            </TiptapEditorSurface>
          )}
        </div>
      </main>
    </>
  );
}
