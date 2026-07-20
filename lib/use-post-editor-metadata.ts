"use client";

import type { Editor } from "@tiptap/core";
import { useCallback, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { startBackgroundTask, type BackgroundTaskToastApi } from "@/lib/client-background-task";
import { normalizePostSlug } from "@/lib/post-utils";

export type MetaGenerationTarget = "summary" | "tags" | "slug" | "cover";

interface MetadataDraftOverrides {
  description?: string;
  tags?: string[];
  slug?: string;
  coverImage?: string;
}

interface UsePostEditorMetadataOptions {
  category: string;
  description: string;
  editSlug: string | null;
  editorRef: RefObject<Editor | null>;
  latestTitleRef: RefObject<string>;
  markDirty: (overrides?: MetadataDraftOverrides) => void;
  onClearFeedback: () => void;
  onError: (message: string) => void;
  setCoverImage: Dispatch<SetStateAction<string>>;
  setDescription: Dispatch<SetStateAction<string>>;
  setSlug: Dispatch<SetStateAction<string>>;
  setTagInput: Dispatch<SetStateAction<string>>;
  setTags: Dispatch<SetStateAction<string[]>>;
  slug: string;
  tags: string[];
  toast: BackgroundTaskToastApi;
}

export function usePostEditorMetadata({
  category,
  description,
  editSlug,
  editorRef,
  latestTitleRef,
  markDirty,
  onClearFeedback,
  onError,
  setCoverImage,
  setDescription,
  setSlug,
  setTagInput,
  setTags,
  slug,
  tags,
  toast,
}: UsePostEditorMetadataOptions) {
  const [pendingTargets, setPendingTargets] = useState<MetaGenerationTarget[]>([]);

  const setTargetPending = useCallback((target: MetaGenerationTarget, pending: boolean) => {
    setPendingTargets((current) => {
      if (pending) return current.includes(target) ? current : [...current, target];
      return current.filter((item) => item !== target);
    });
  }, []);

  const isMetadataTargetPending = useCallback(
    (target: MetaGenerationTarget) => pendingTargets.includes(target),
    [pendingTargets],
  );

  const handleGenerateMetadata = useCallback(
    (target: MetaGenerationTarget) => {
      const normalizedTitle = latestTitleRef.current.trim();
      const content = editorRef.current?.getText({ blockSeparator: "\n\n" }).trim() || "";

      if (!normalizedTitle && !content) {
        onError("先写标题或正文，再生成内容。");
        return;
      }
      if (pendingTargets.includes(target)) return;

      onClearFeedback();
      setTargetPending(target, true);
      startBackgroundTask({
        toast,
        errorPrefix: "AI 生成失败",
        run: async () => {
          const response = await fetch("/api/editor/ai-post-metadata", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              target,
              title: normalizedTitle,
              content,
              category,
              description,
              tags,
              currentSlug: normalizePostSlug(slug) || editSlug || "",
            }),
          });
          const data = (await response.json().catch(() => ({}))) as {
            error?: string;
            value?: string | string[];
            image?: { url?: string };
          };
          if (!response.ok) throw new Error(data.error || "AI 生成失败");
          return data;
        },
        onSuccess: (data) => {
          if (target === "summary") {
            const value = typeof data.value === "string" ? data.value.trim() : "";
            if (!value) throw new Error("摘要生成结果为空");
            setDescription(value);
            markDirty({ description: value });
            return;
          }
          if (target === "tags") {
            const value = Array.isArray(data.value)
              ? data.value.map((item) => String(item).trim()).filter(Boolean)
              : [];
            if (value.length === 0) throw new Error("标签生成结果为空");
            setTagInput("");
            setTags(value);
            markDirty({ tags: value });
            return;
          }
          if (target === "slug") {
            const value = typeof data.value === "string" ? normalizePostSlug(data.value) : "";
            if (!value) throw new Error("slug 生成结果为空");
            setSlug(value);
            markDirty({ slug: value });
            return;
          }

          const value = typeof data.image?.url === "string" ? data.image.url : "";
          if (!value) throw new Error("封面生成失败");
          setCoverImage(value);
          markDirty({ coverImage: value });
        },
        onError,
        onSettled: () => setTargetPending(target, false),
      });
    },
    [
      category,
      description,
      editSlug,
      editorRef,
      latestTitleRef,
      markDirty,
      onClearFeedback,
      onError,
      pendingTargets,
      setCoverImage,
      setDescription,
      setSlug,
      setTagInput,
      setTags,
      setTargetPending,
      slug,
      tags,
      toast,
    ],
  );

  return { handleGenerateMetadata, isMetadataTargetPending };
}
