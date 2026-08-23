"use client";

import { useState } from "react";
import { ArticleToc } from "@/components/ArticleToc";
import { DownloadMarkdown } from "@/components/DownloadMarkdown";
import { PostViewTracker } from "@/components/PostViewTracker";
import { TwitterEmbedsEnhancer } from "@/components/TwitterEmbedsEnhancer";
import type { ArticleTocHeading } from "@/lib/article-toc";

interface PasswordPromptProps {
  slug: string;
}

interface UnlockedPost {
  slug: string;
  title: string;
  category?: string | null;
  publishedAt: number;
  viewCount: number;
  html: string;
  headings: ArticleTocHeading[];
}

export function PasswordPrompt({ slug }: PasswordPromptProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [post, setPost] = useState<UnlockedPost | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = password.trim();
    if (!input || loading) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/posts/${encodeURIComponent(slug)}/unlock`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: input }),
      });
      const data = (await response.json().catch(() => ({}))) as UnlockedPost & { error?: string };
      if (!response.ok) throw new Error(data.error || "解锁失败，请重试");
      setPost(data);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "解锁失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  if (post) {
    const contentContainerId = `post-content-${post.slug}`;
    return (
      <>
        <PostViewTracker slug={post.slug} />
        <div className="article-reading-layout">
          <ArticleToc headings={post.headings} />
          <article className="min-w-0 lg:col-start-1 lg:row-start-1">
            <header className="mb-4 sm:mb-6">
              <h1 className="article-display-title text-2xl sm:text-3xl lg:text-4xl font-bold text-[var(--editor-ink)] leading-snug mb-4 sm:mb-5">
                {post.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--stone-gray)]">
                {post.category && <span>{post.category}</span>}
                {post.category && <span aria-hidden>·</span>}
                <time>
                  {new Date(post.publishedAt * 1000).toLocaleDateString("zh-CN", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </time>
                <span aria-hidden>·</span>
                <span>{post.viewCount} 次阅读</span>
                <DownloadMarkdown title={post.title} containerId={contentContainerId} />
              </div>
            </header>
            <div
              id={contentContainerId}
              className="rich-content"
              dangerouslySetInnerHTML={{ __html: post.html }}
            />
            <TwitterEmbedsEnhancer containerId={contentContainerId} />
          </article>
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-[var(--editor-panel)] rounded-xl border border-[var(--editor-line)] p-8 shadow-lg">
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--editor-accent)]/10 flex items-center justify-center">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-[var(--editor-accent)]"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-[var(--editor-ink)] mb-2">此文章已加密</h2>
            <p className="text-sm text-[var(--editor-muted)]">请输入密码查看内容</p>
          </div>

          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoFocus
                className="w-full px-4 py-3 rounded-lg border border-[var(--editor-line)] bg-[var(--background)] text-[var(--editor-ink)] placeholder:text-[var(--editor-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--editor-accent)] focus:border-transparent transition"
              />
              {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
            </div>

            <button
              type="submit"
              disabled={!password.trim() || loading}
              className="w-full px-4 py-3 rounded-lg bg-[var(--editor-accent)] text-[var(--editor-accent-ink)] font-medium hover:brightness-105 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "正在解锁…" : "解锁文章"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
