"use client";

import { PostEditorCanvas } from "@/components/post-editor/PostEditorCanvas";
import { PostEditorHeader } from "@/components/post-editor/PostEditorHeader";
import { PostEditorModals } from "@/components/post-editor/PostEditorModals";
import { PostEditorSidebar } from "@/components/post-editor/PostEditorSidebar";
import { usePostEditorController, type PostEditorProps } from "@/lib/use-post-editor-controller";

export function PostEditor(props: PostEditorProps = {}) {
  const controller = usePostEditorController(props);

  return (
    <div className="min-h-screen bg-[var(--editor-app-bg)]">
      <PostEditorHeader controller={controller} />
      <div className="flex">
        <PostEditorCanvas controller={controller} />
        <PostEditorSidebar controller={controller} />
      </div>
      <PostEditorModals controller={controller} />
    </div>
  );
}
