import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/site-config", () => ({
  getSiteUrl: () => "https://blog.example.test",
}));

import { GET } from "@/app/llms.txt/route";

describe("/llms.txt route", () => {
  it("provides stable discovery links without duplicating the RSS feed", async () => {
    const response = GET();
    const body = await response.text();

    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(body).toContain("# Leyang Blog");
    expect(body).toContain("[RSS feed](https://blog.example.test/feed.xml)");
    expect(body).toContain("[Sitemap](https://blog.example.test/sitemap.xml)");
    expect(body).toContain("[Source code](https://github.com/sunflower0305/blog)");
    expect(body).not.toContain("## Articles");
  });
});
