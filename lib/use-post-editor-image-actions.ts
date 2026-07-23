"use client";

import type { Editor } from "@tiptap/core";
import { useCallback, useMemo, type Dispatch, type RefObject, type SetStateAction } from "react";
import { createEditorExtensions } from "@/lib/editor-extensions";
import {
  insertGeneratedImageAfterNode,
  insertGeneratedImageAtPosition,
  replaceImageNodeAtPosition,
} from "@/lib/editor-file-upload";
import type { EditorImageActionTarget } from "@/lib/resizable-image";
import type { DraftMetaState } from "@/lib/use-post-editor-autosave";
import type { SaveFeedback } from "@/lib/use-post-editor-save";

interface Options {
  closeImageModal: () => void;
  editorRef: RefObject<Editor | null>;
  imageInsertPosition: number | null;
  markDirty: (overrides?: Partial<DraftMetaState>) => void;
  setCoverImage: Dispatch<SetStateAction<string>>;
  setCropImageTarget: Dispatch<SetStateAction<EditorImageActionTarget | null>>;
  setFeedback: Dispatch<SetStateAction<SaveFeedback>>;
  setReferenceImageTarget: Dispatch<SetStateAction<EditorImageActionTarget | null>>;
}

export function usePostEditorImageActions(options: Options) {
  const insertGeneratedImage = useCallback(
    (imageUrl: string, alt: string) => {
      const editor = options.editorRef.current;
      if (!editor) return;
      insertGeneratedImageAtPosition(editor, imageUrl, alt, options.imageInsertPosition);
      options.closeImageModal();
    },
    [options.closeImageModal, options.editorRef, options.imageInsertPosition],
  );

  const applyImageActionResult = useCallback(
    (
      target: EditorImageActionTarget,
      imageUrl: string,
      alt: string,
      placementMode: "insert" | "replace" = "replace",
    ) => {
      const editor = options.editorRef.current;
      if (!editor) return;
      const nextAlt = alt || target.alt || "";
      if (placementMode === "replace") {
        replaceImageNodeAtPosition(editor, imageUrl, nextAlt, target.pos);
      } else {
        insertGeneratedImageAfterNode(editor, imageUrl, nextAlt, target.pos);
      }
    },
    [options.editorRef],
  );

  const imageExtensions = useMemo(
    () =>
      createEditorExtensions({
        imageActions: {
          onSetCover: (target) => {
            options.setCoverImage(target.src);
            options.markDirty({ coverImage: target.src });
            options.setFeedback({ type: "success", message: "已设为封面" });
          },
          onOpenReferenceImage: options.setReferenceImageTarget,
          onOpenCrop: options.setCropImageTarget,
        },
      }),
    [
      options.markDirty,
      options.setCoverImage,
      options.setCropImageTarget,
      options.setFeedback,
      options.setReferenceImageTarget,
    ],
  );

  return { applyImageActionResult, imageExtensions, insertGeneratedImage };
}
