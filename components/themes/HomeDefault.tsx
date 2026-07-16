"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Pagination } from "@/components/Pagination";
import type { HomeProps } from "@/components/HomeClient";

const CATEGORY_COLORS = [
  "#c96442",
  "#7c5cbf",
  "#2e8fbb",
  "#3d9466",
  "#b57a12",
  "#cf4f70",
  "#8b6b47",
] as const;

function formatDateShort(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}.${day}`;
}

function getCategoryColor(category: string | null) {
  if (!category) return CATEGORY_COLORS[0];

  let hash = 0;
  for (const character of category) {
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  }
  return CATEGORY_COLORS[hash % CATEGORY_COLORS.length];
}

function LockIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block ml-2 align-middle text-[var(--stone-gray)]"
      aria-label="加密文章"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function PinnedLabel() {
  return (
    <span className="text-[10px] tracking-[0.05em] text-[var(--stone-gray)] font-mono">置顶</span>
  );
}

export function HomeDefault({
  initialTheme,
  posts,
  categories,
  navLinks,
  currentPage,
  totalPages,
  categorySlugMap,
}: HomeProps) {
  return (
    <div className="theme-home-default min-h-full flex flex-col bg-[var(--background)]">
      <SiteHeader initialTheme={initialTheme} navLinks={navLinks} categories={categories} />
      <main className="default-home-main flex-1 mx-auto w-full max-w-[860px] px-4 sm:px-8 pb-24 sm:pb-[120px]">
        {posts.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-[var(--editor-muted)] mb-3">还没有文章</p>
            <p className="text-sm text-[var(--stone-gray)]">开始写作，记录思考</p>
          </div>
        ) : (
          <>
            <div>
              {posts.map((post, index) => {
                const categoryColor = getCategoryColor(post.category);
                const categorySlug = post.category ? categorySlugMap[post.category] : undefined;
                const publishedDate = new Date(post.published_at * 1000);
                const dateLabel = formatDateShort(publishedDate);
                const year = publishedDate.getFullYear();

                return (
                  <article
                    key={post.slug}
                    className="default-post border-t border-[var(--editor-line)] first:mt-5"
                    style={
                      {
                        "--category-color": categoryColor,
                        animation: `fadeInUp 0.4s ease-out ${index * 0.05}s both`,
                      } as CSSProperties
                    }
                  >
                    <div className="default-post-grid grid grid-cols-[72px_minmax(0,1fr)] gap-7 py-8">
                      <time
                        dateTime={publishedDate.toISOString()}
                        className="default-post-date pt-1 text-xs leading-relaxed text-[var(--stone-gray)] font-mono"
                      >
                        <span className="block">{dateLabel}</span>
                        <span className="block text-[11px] text-[var(--editor-muted)]">{year}</span>
                      </time>

                      <div className="min-w-0">
                        <div className="default-post-meta mb-2.5 flex min-h-4 flex-wrap items-center gap-2">
                          <time
                            dateTime={publishedDate.toISOString()}
                            className="default-post-date-mobile hidden text-[11px] text-[var(--stone-gray)] font-mono"
                          >
                            {dateLabel} · {year}
                          </time>
                          {post.category && (
                            <>
                              <span
                                className="h-1.5 w-1.5 shrink-0 rounded-full"
                                style={{ backgroundColor: categoryColor }}
                                aria-hidden
                              />
                              {categorySlug ? (
                                <Link
                                  href={`/category/${categorySlug}`}
                                  className="text-xs font-medium hover:underline underline-offset-4"
                                  style={{ color: categoryColor }}
                                >
                                  {post.category}
                                </Link>
                              ) : (
                                <span
                                  className="text-xs font-medium"
                                  style={{ color: categoryColor }}
                                >
                                  {post.category}
                                </span>
                              )}
                            </>
                          )}
                          {post.is_pinned === 1 && <PinnedLabel />}
                        </div>

                        <Link href={`/${post.slug}`} className="block">
                          <h2
                            className="default-post-title m-0 text-xl sm:text-[22px] font-bold leading-[1.35] tracking-[-0.01em] text-[var(--editor-ink)]"
                            style={{ fontFamily: 'Georgia, "Noto Serif SC", serif' }}
                          >
                            {post.title}
                            {post.password && <LockIcon />}
                          </h2>

                          {post.description && (
                            <p className="mt-2.5 text-sm leading-7 text-[var(--editor-muted)] line-clamp-2">
                              {post.description}
                            </p>
                          )}

                          <span className="mt-3 flex items-center gap-1 text-xs text-[var(--stone-gray)]">
                            阅读全文
                            <span className="default-post-arrow inline-block" aria-hidden>
                              →
                            </span>
                          </span>
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="pt-4">
              <Pagination currentPage={currentPage} totalPages={totalPages} basePath="/" />
            </div>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
