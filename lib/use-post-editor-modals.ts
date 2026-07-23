"use client";

import type { Editor } from "@tiptap/core";
import type { RefObject } from "react";
import { useEditorAuxiliaryModals } from "@/lib/editor-ui";

export function usePostEditorModals(editorRef: RefObject<Editor | null>, title: string) {
  return useEditorAuxiliaryModals({
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
}
