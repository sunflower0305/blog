import "../content.css";
import { getPostBySlug, isPubliclyAccessiblePost, isSearchIndexablePost } from "@/lib/db";
import { getAppCloudflareEnv } from "@/lib/cloudflare";
import { notFound } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { FrontPostAdminBoundary } from "@/components/FrontPostAdminBoundary";
import { PasswordPrompt } from "@/components/PasswordPrompt";
import { DownloadMarkdown } from "@/components/DownloadMarkdown";
import { TwitterEmbedsEnhancer } from "@/components/TwitterEmbedsEnhancer";
import { getSiteHeaderData } from "@/lib/site";
import { getRelatedPosts } from "@/lib/related-content";
import { getPublicContentCacheNamespace } from "@/lib/cache";
import { getSiteUrl } from "@/lib/site-config";
import { resolvePostCoverImage } from "@/lib/default-cover-images";
import { PostViewTracker } from "@/components/PostViewTracker";
import { ArticleToc } from "@/components/ArticleToc";
import { getRenderedPostHtml } from "@/lib/post-render";

// Cloudflare Workers 缓存策略
export const revalidate = 86400; // 24小时缓存
export const dynamicParams = true;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const baseUrl = getSiteUrl();
  try {
    const env = await getAppCloudflareEnv();
    const { slug } = await params;

    if (!env?.DB) return {};

    const post = await getPostBySlug(env.DB, slug, getPublicContentCacheNamespace(env)).catch(
      () => null,
    );
    if (!post || !isPubliclyAccessiblePost(post)) return {};
    const searchIndexable = isSearchIndexablePost(post);

    const ogImage = resolvePostCoverImage(post, { baseUrl });

    // Password-protected articles should not expose metadata to crawlers.
    if (post.password) {
      return {
        title: post.title,
        robots: { index: false, follow: false },
      };
    }

    return {
      title: post.title,
      description: post.description,
      robots: searchIndexable ? undefined : { index: false, follow: false },
      authors: [{ name: "乐扬" }],
      alternates: {
        canonical: `${baseUrl}/${post.slug}`,
      },
      openGraph: {
        title: post.title,
        description: post.description,
        type: "article",
        publishedTime: new Date(post.published_at * 1000).toISOString(),
        modifiedTime: new Date(post.updated_at * 1000).toISOString(),
        authors: ["乐扬"],
        images: [{ url: ogImage }],
      },
      twitter: {
        card: "summary_large_image" as const,
        site: "@vista8",
        creator: "@vista8",
        title: post.title,
        description: post.description || undefined,
        images: [ogImage],
      },
    };
  } catch {
    return {};
  }
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let env: Awaited<ReturnType<typeof getAppCloudflareEnv>> | undefined;
  try {
    env = await getAppCloudflareEnv();
  } catch {
    notFound();
  }
  if (!env?.DB) notFound();
  const db = env!.DB;

  const post = await getPostBySlug(db, slug, getPublicContentCacheNamespace(env)).catch(() => null);
  if (!post) notFound();
  if (!isPubliclyAccessiblePost(post)) notFound();

  const headerData = await getSiteHeaderData(db);
  const categorySlugMap = new Map(
    headerData.categories.map((category) => [category.name, category.slug]),
  );
  const activeCategorySlug =
    headerData.categories.find((category) => category.name === post.category)?.slug ?? null;

  const needsPassword = Boolean(post.password);
  const readingRootId = `post-reading-${post.slug}`;

  if (needsPassword) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex flex-col">
        <SiteHeader
          initialTheme={headerData.defaultTheme}
          navLinks={headerData.navLinks}
          categories={headerData.categories}
          activeCategorySlug={activeCategorySlug}
          stickyOnMobile={false}
        />
        <main className="page-main article-page-main mx-auto w-full px-4 sm:px-6 flex-1 py-8 sm:py-12">
          <PasswordPrompt slug={post.slug} />
        </main>
        <SiteFooter />
      </div>
    );
  }

  // 阅读时间估算（中文按 400 字/分钟）
  const textLength = post.content?.length || 0;
  const readingMinutes = Math.max(1, Math.ceil(textLength / 400));
  const searchIndexable = isSearchIndexablePost(post);
  const related = !post.password
    ? await getRelatedPosts(db, env, post, 3).catch(() => ({
        strategy: "fts" as const,
        source: "rules" as const,
        results: [],
      }))
    : { strategy: "fts" as const, source: "rules" as const, results: [] };
  const contentContainerId = `post-content-${post.slug}`;
  const { html: deliveredHtml, headings: articleToc } = await getRenderedPostHtml(env, post);

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      <SiteHeader
        initialTheme={headerData.defaultTheme}
        navLinks={headerData.navLinks}
        categories={headerData.categories}
        activeCategorySlug={activeCategorySlug}
        stickyOnMobile={false}
      />

      <main className="page-main article-page-main mx-auto w-full px-4 sm:px-6 flex-1 py-8 sm:py-12">
        {searchIndexable &&
          (() => {
            const baseUrl = getSiteUrl();
            const ogImage = resolvePostCoverImage(post, { baseUrl });
            const jsonLd = {
              "@context": "https://schema.org",
              "@type": "BlogPosting",
              headline: post.title,
              description: post.description || "",
              image: ogImage,
              author: {
                "@type": "Person",
                name: "乐扬",
                url: "https://x.com/vista8",
              },
              publisher: {
                "@type": "Organization",
                name: "乐扬博客",
                url: baseUrl,
                logo: {
                  "@type": "ImageObject",
                  url: `${baseUrl}/icon-512.png`,
                },
              },
              datePublished: new Date(post.published_at * 1000).toISOString(),
              dateModified: new Date(post.updated_at * 1000).toISOString(),
              mainEntityOfPage: {
                "@type": "WebPage",
                "@id": `${baseUrl}/${post.slug}`,
              },
              url: `${baseUrl}/${post.slug}`,
            };
            const breadcrumbLd = {
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                {
                  "@type": "ListItem",
                  position: 1,
                  name: "首页",
                  item: baseUrl,
                },
                ...(post.category && activeCategorySlug
                  ? [
                      {
                        "@type": "ListItem",
                        position: 2,
                        name: post.category,
                        item: `${baseUrl}/category/${activeCategorySlug}`,
                      },
                    ]
                  : []),
                {
                  "@type": "ListItem",
                  position: post.category ? 3 : 2,
                  name: post.title,
                  item: `${baseUrl}/${post.slug}`,
                },
              ],
            };
            return (
              <>
                <script
                  type="application/ld+json"
                  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
                />
                <script
                  type="application/ld+json"
                  dangerouslySetInnerHTML={{
                    __html: JSON.stringify(breadcrumbLd),
                  }}
                />
              </>
            );
          })()}
        <div id={readingRootId}>
          {!needsPassword && <PostViewTracker slug={post.slug} />}
          <div className="article-reading-layout">
            <ArticleToc headings={articleToc} />
            <article className="min-w-0 lg:col-start-1 lg:row-start-1">
              <header className="mb-4 sm:mb-6">
                <h1
                  data-admin-edit-trigger
                  className="article-display-title text-2xl sm:text-3xl lg:text-4xl font-bold text-[var(--editor-ink)] leading-snug mb-4 sm:mb-5"
                >
                  {post.title}
                </h1>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--stone-gray)]">
                  {post.category && (
                    <>
                      {activeCategorySlug ? (
                        <Link
                          href={`/category/${activeCategorySlug}`}
                          className="px-2 py-0.5 rounded-full bg-[var(--editor-accent)]/8 text-[var(--editor-accent)] font-medium border border-[var(--editor-accent)]/15 hover:bg-[var(--editor-accent)]/12 transition-colors"
                        >
                          {post.category}
                        </Link>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-[var(--editor-accent)]/8 text-[var(--editor-accent)] font-medium border border-[var(--editor-accent)]/15">
                          {post.category}
                        </span>
                      )}
                      <span aria-hidden>·</span>
                    </>
                  )}
                  <time>
                    {new Date(post.published_at * 1000).toLocaleDateString("zh-CN", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </time>
                  <span aria-hidden>·</span>
                  <span>{post.view_count} 次阅读</span>
                  <span aria-hidden>·</span>
                  <span>约 {readingMinutes} 分钟</span>
                  <DownloadMarkdown title={post.title} containerId={contentContainerId} />
                </div>
              </header>

              <div
                id={contentContainerId}
                data-admin-edit-trigger
                className="rich-content"
                dangerouslySetInnerHTML={{ __html: deliveredHtml }}
              />
              <TwitterEmbedsEnhancer containerId={contentContainerId} />

              {related.results.length > 0 && (
                <section className="mt-14 sm:mt-16 border-t border-[var(--editor-line)] pt-8 sm:pt-10">
                  <div className="flex items-center justify-between gap-3 mb-5">
                    <div>
                      <h2 className="text-lg sm:text-xl font-semibold text-[var(--editor-ink)]">
                        继续阅读
                      </h2>
                      <p className="text-xs text-[var(--stone-gray)] mt-1">
                        {related.source === "vectorize"
                          ? "基于向量召回"
                          : "基于全文检索与主题相似度"}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {related.results.map((item) => {
                      const itemCategorySlug = item.category
                        ? categorySlugMap.get(item.category)
                        : null;
                      return (
                        <Link
                          key={item.slug}
                          href={`/${item.slug}`}
                          className="group rounded-2xl border border-[var(--editor-line)] bg-[var(--editor-panel)]/55 p-4 transition-colors hover:border-[var(--editor-accent)]/35 hover:bg-[var(--editor-panel)]"
                        >
                          <div className="text-xs text-[var(--stone-gray)] mb-3 flex items-center gap-2 flex-wrap">
                            {item.category &&
                              (itemCategorySlug ? (
                                <span className="rounded-full border border-[var(--editor-accent)]/15 bg-[var(--editor-accent)]/8 px-2 py-0.5 text-[var(--editor-accent)]">
                                  {item.category}
                                </span>
                              ) : (
                                <span>{item.category}</span>
                              ))}
                            <time>
                              {new Date(item.published_at * 1000).toLocaleDateString("zh-CN", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                            </time>
                          </div>
                          <h3 className="text-base font-semibold leading-snug text-[var(--editor-ink)] group-hover:text-[var(--editor-accent)] transition-colors">
                            {item.title}
                          </h3>
                          {item.description && (
                            <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-[var(--editor-muted)]">
                              {item.description}
                            </p>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </section>
              )}
            </article>
          </div>
        </div>
        <FrontPostAdminBoundary slug={post.slug} readingRootId={readingRootId} />
      </main>

      <SiteFooter />
    </div>
  );
}
