"use client";

import type { Content, Editor, EditorOptions, Extensions } from "@tiptap/core";
import { EditorContent, EditorContext, useEditor, type EditorEvents } from "@tiptap/react";
import { useMemo, useRef, type ReactNode } from "react";

const EMPTY_EDITOR_PROPS: NonNullable<EditorOptions["editorProps"]> = {};

interface TiptapEditorSurfaceProps {
  children?: ReactNode;
  className?: string;
  extensions: Extensions;
  editorProps?: EditorOptions["editorProps"];
  /** Read once when the editor instance is created; later content changes must use editor commands. */
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
  const initialContentRef = useRef(initialContent);
  const editor = useEditor({
    extensions,
    editorProps: editorProps ?? EMPTY_EDITOR_PROPS,
    content: initialContentRef.current,
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
