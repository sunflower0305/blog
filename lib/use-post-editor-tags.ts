"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { DraftMetaState } from "@/lib/use-post-editor-autosave";

export function usePostEditorTags(
  tags: string[],
  setTags: Dispatch<SetStateAction<string[]>>,
  markDirty: (overrides?: Partial<DraftMetaState>) => void,
) {
  const [tagInput, setTagInput] = useState("");
  const addTag = (value: string) => {
    const tag = value.trim().slice(0, 20);
    if (!tag || tags.includes(tag) || tags.length >= 10) return;
    const nextTags = [...tags, tag];
    setTags(nextTags);
    setTagInput("");
    markDirty({ tags: nextTags });
  };
  const removeTag = (index: number) => {
    const nextTags = tags.filter((_, currentIndex) => currentIndex !== index);
    setTags(nextTags);
    markDirty({ tags: nextTags });
  };
  return { addTag, removeTag, setTagInput, tagInput };
}
