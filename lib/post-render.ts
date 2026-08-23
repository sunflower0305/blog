import { addArticleTocToHtml, type ArticleTocHeading } from "@/lib/article-toc";
import { getPublicContentCached } from "@/lib/cache";
import { highlightCodeBlocksInHtml } from "@/lib/code-highlight-html";
import { optimizePostImageUrls } from "@/lib/post-utils";
import { getSiteUrl } from "@/lib/site-config";

interface RenderablePost {
  slug: string;
  html: string;
  updated_at: number;
}

export interface RenderedPostHtml {
  html: string;
  headings: ArticleTocHeading[];
}

async function renderPostHtml(post: RenderablePost): Promise<RenderedPostHtml> {
  const optimizedHtml = optimizePostImageUrls(post.html, getSiteUrl());
  const highlightedHtml = await highlightCodeBlocksInHtml(optimizedHtml);
  return addArticleTocToHtml(highlightedHtml);
}

/** Cache the CPU-heavy code highlighting and heading extraction by post revision. */
export async function getRenderedPostHtml(
  env: Partial<CloudflareEnv> | null | undefined,
  post: RenderablePost,
): Promise<RenderedPostHtml> {
  return getPublicContentCached(
    env,
    `post-render:${post.slug}:${post.updated_at}`,
    () => renderPostHtml(post),
    86400,
  );
}
