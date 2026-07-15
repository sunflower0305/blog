"use client";

import type { Content, Editor, EditorOptions, Extensions } from "@tiptap/core";
import { EditorContent, EditorContext, useEditor, type EditorEvents } from "@tiptap/react";
import { useMemo, type ReactNode } from "react";

interface TiptapEditorSurfaceProps {
  children?: ReactNode;
  className?: string;
  extensions: Extensions;
  editorProps?: EditorOptions["editorProps"];
  initialContent?: Content;
  onCreate?: (props: EditorEvents["create"]) => void;
  onDestroy?: (props: EditorEvents["destroy"]) => void;
  onUpdate?: (props: EditorEvents["update"]) => void;
}

export function TiptapEditorSurface({
  children,
  className,
  extensions,
  editorProps,
  initialContent,
  onCreate,
  onDestroy,
  onUpdate,
}: TiptapEditorSurfaceProps) {
  const editor = useEditor({
    extensions,
    editorProps: editorProps ?? {},
    content: initialContent,
    immediatelyRender: false,
    onCreate,
    onDestroy,
    onUpdate,
  });
  const contextValue = useMemo<{ editor: Editor | null }>(() => ({ editor }), [editor]);

  if (!editor) return null;

  return (
    <EditorContext.Provider value={contextValue}>
      <div className={className}>
        <EditorContent editor={editor} />
        {children}
      </div>
    </EditorContext.Provider>
  );
}
