import { getSiteUrl } from "@/lib/site-config";

export function GET() {
  const siteUrl = getSiteUrl();
  const lines = [
    "# Leyang Blog",
    "",
    "> A personal knowledge garden for articles about technology, learning, reading, and life.",
    "",
    "## Primary links",
    "",
    `- [Home](${siteUrl}): Browse published articles.`,
    `- [RSS feed](${siteUrl}/feed.xml): Read the latest articles with full content.`,
    `- [Sitemap](${siteUrl}/sitemap.xml): Discover all public pages.`,
    "- [Source code](https://github.com/sunflower0305/blog): Explore the open-source blog project.",
  ];

  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
