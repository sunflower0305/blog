"use client";

import type { Editor } from "@tiptap/core";
import { useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { generatePassword } from "@/lib/password";
import { buildAutoDescription, normalizePostSlug } from "@/lib/post-utils";
import type { SaveState } from "@/lib/use-post-editor-autosave";

export type SaveFeedback = { type: "success" | "error"; message: string; slug?: string } | null;
export type PublishStatus = "public" | "draft" | "encrypted" | "unlisted";

interface SaveOptions {
  abortAutosaveRequest: () => void;
  buildAutosaveSnapshot: (payload: {
    currentSlug: string | null;
    nextSlug: string;
    title: string;
    html: string;
    description: string;
    category: string;
    tags: string[];
    coverImage: string;
  }) => string;
  category: string;
  clearAutosaveTimers: () => void;
  coverImage: string;
  description: string;
  editSlug: string | null;
  editorRef: RefObject<Editor | null>;
  initialPassword?: string | null;
  lastAutosaveSnapshotRef: RefObject<string | null>;
  latestTitleRef: RefObject<string>;
  publishStatus: PublishStatus;
  setDescription: Dispatch<SetStateAction<string>>;
  setLastSavedAt: Dispatch<SetStateAction<number>>;
  setPublishPanelOpen: Dispatch<SetStateAction<boolean>>;
  setSaveState: Dispatch<SetStateAction<SaveState>>;
  setTitle: Dispatch<SetStateAction<string>>;
  slug: string;
  syncPersistedSlug: (slug: string, previousSlug: string | null, force?: boolean) => void;
  tags: string[];
  title: string;
}

interface SaveContent {
  title: string;
  slug: string;
  content: string;
  html: string;
  description: string;
}

type SaveContentResult = { error: string } | { value: SaveContent };

function readSaveContent(
  editor: Editor | null,
  title: string,
  slug: string,
  description: string,
): SaveContentResult {
  if (!title.trim()) return { error: "先把文章标题写上。" } as const;
  if (!editor) return { error: "编辑器还没准备好。" } as const;
  const content = editor.getText({ blockSeparator: "\n\n" }).trim();
  const html = editor.getHTML();
  if (!content && !/<(img|video|audio|iframe)\s/.test(html)) {
    return { error: "正文还是空的。" } as const;
  }
  return {
    value: {
      title: title.trim(),
      slug: normalizePostSlug(slug),
      content,
      html,
      description: (description || buildAutoDescription(content) || "").trim(),
    } satisfies SaveContent,
  } as const;
}

export function buildPublishStatusFields(status: PublishStatus, initialPassword?: string | null) {
  if (status === "encrypted") {
    return { status: "published", is_hidden: 0, password: initialPassword || generatePassword() };
  }
  return {
    public: { status: "published", is_hidden: 0, password: null },
    draft: { status: "draft", is_hidden: 0, password: null },
    unlisted: { status: "published", is_hidden: 1, password: null },
  }[status];
}

async function sendSaveRequest(
  content: SaveContent,
  options: Pick<
    SaveOptions,
    "category" | "coverImage" | "editSlug" | "initialPassword" | "publishStatus" | "tags"
  >,
) {
  const editing = options.editSlug !== null;
  const response = await fetch(editing ? `/api/admin/posts/${options.editSlug}` : "/api/posts", {
    method: editing ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: content.slug || (editing ? options.editSlug : undefined),
      title: content.title,
      content: content.content,
      html: content.html,
      category: options.category,
      ...buildPublishStatusFields(options.publishStatus, options.initialPassword),
      tags: options.tags,
      description: content.description,
      cover_image: options.coverImage || null,
    }),
  });
  const result = (await response.json()) as { success?: boolean; slug?: string; error?: string };
  if (!response.ok || !result.success) throw new Error(result.error || "保存失败");
  return result;
}

const PUBLISH_MESSAGES: Record<PublishStatus, string> = {
  public: "已发布",
  draft: "草稿已保存",
  encrypted: "已发布（加密）",
  unlisted: "已发布（链接访问）",
};

export function usePostEditorSave(options: SaveOptions) {
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<SaveFeedback>(null);

  const handleSave = async () => {
    const checked = readSaveContent(
      options.editorRef.current,
      options.title,
      options.slug,
      options.description,
    );
    if ("error" in checked) {
      setFeedback({ type: "error", message: checked.error });
      return;
    }

    options.clearAutosaveTimers();
    options.abortAutosaveRequest();
    setSaving(true);
    options.setSaveState("saving");
    setFeedback(null);

    try {
      const result = await sendSaveRequest(checked.value, options);
      const editing = options.editSlug !== null;
      const persistedSlug = result.slug || options.editSlug;
      options.lastAutosaveSnapshotRef.current = options.buildAutosaveSnapshot({
        currentSlug: persistedSlug,
        nextSlug: persistedSlug || "",
        title: checked.value.title,
        html: checked.value.html,
        description: checked.value.description,
        category: options.category,
        tags: options.tags,
        coverImage: options.coverImage,
      });
      options.setSaveState("saved");
      options.setLastSavedAt(Date.now());
      if (!options.description && checked.value.description) {
        options.setDescription(checked.value.description);
      }

      if (editing) {
        if (persistedSlug) options.syncPersistedSlug(persistedSlug, options.editSlug, true);
        setFeedback({ type: "success", message: "文章已更新。", slug: persistedSlug || undefined });
      } else {
        setFeedback({
          type: "success",
          message: PUBLISH_MESSAGES[options.publishStatus],
          slug: result.slug,
        });
        options.setTitle("");
        options.latestTitleRef.current = "";
        options.lastAutosaveSnapshotRef.current = null;
        options.editorRef.current?.commands.clearContent();
      }
      options.setPublishPanelOpen(false);
    } catch (error) {
      options.setSaveState("error");
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "保存失败" });
    } finally {
      setSaving(false);
    }
  };

  return { feedback, handleSave, saving, setFeedback };
}
