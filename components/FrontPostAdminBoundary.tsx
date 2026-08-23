"use client";

import { useCallback, useEffect, useState } from "react";
import { InlineArticleEditorClient } from "@/components/InlineArticleEditorClient";
import { useAdminSession } from "@/lib/admin-session-client";

interface EditablePost {
  slug: string;
  title: string;
  html: string;
  category?: string | null;
  cover_image?: string | null;
  password?: string | null;
  published_at?: number;
  view_count?: number;
  content?: string;
}

interface FrontPostAdminBoundaryProps {
  slug: string;
  readingRootId: string;
}

/** Adds inline editing without sending the complete article through a client boundary. */
export function FrontPostAdminBoundary({ slug, readingRootId }: FrontPostAdminBoundaryProps) {
  const { authenticated } = useAdminSession();
  const [post, setPost] = useState<EditablePost | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setReadingVisibility = useCallback(
    (visible: boolean) => {
      const readingRoot = document.getElementById(readingRootId);
      if (readingRoot) readingRoot.hidden = !visible;
    },
    [readingRootId],
  );

  const openEditor = useCallback(async () => {
    if (!authenticated || loading || post) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/posts/${encodeURIComponent(slug)}`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) throw new Error("加载文章编辑数据失败");

      const editablePost = (await response.json()) as EditablePost;
      setPost(editablePost);
      setReadingVisibility(false);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "加载文章编辑数据失败");
    } finally {
      setLoading(false);
    }
  }, [authenticated, loading, post, setReadingVisibility, slug]);

  useEffect(() => {
    if (!authenticated || post) return;

    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.closest(`#${CSS.escape(readingRootId)}`)) return;
      if (target.closest("a, button, input, textarea, select, summary, label, video, audio"))
        return;
      if (!target.closest<HTMLElement>("[data-admin-edit-trigger]")) return;

      event.preventDefault();
      void openEditor();
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [authenticated, openEditor, post, readingRootId]);

  useEffect(() => () => setReadingVisibility(true), [setReadingVisibility]);

  if (post) {
    return (
      <section>
        <InlineArticleEditorClient
          slug={post.slug}
          title={post.title}
          html={post.html}
          category={post.category}
          coverImage={post.cover_image}
          password={post.password}
          publishedAt={post.published_at}
          viewCount={post.view_count}
          content={post.content}
          onExitReading={() => {
            setPost(null);
            setReadingVisibility(true);
          }}
        />
      </section>
    );
  }

  if (!authenticated) return null;

  return (
    <div aria-live="polite" className="sr-only">
      {loading ? "正在加载编辑器" : error}
    </div>
  );
}
