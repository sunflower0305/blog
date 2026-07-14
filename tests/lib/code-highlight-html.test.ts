import { describe, expect, it } from "vitest";
import { highlightCodeBlocksInHtml } from "@/lib/code-highlight-html";

describe("highlightCodeBlocksInHtml", () => {
  it("highlights explicit TypeScript code blocks", async () => {
    const result = await highlightCodeBlocksInHtml(
      '<pre><code class="language-typescript">const answer: number = 42</code></pre>',
    );

    expect(result).toContain('class="hljs language-typescript"');
    expect(result).toContain("hljs-keyword");
    expect(result).toContain("hljs-number");
  });

  it("normalizes the ts alias before highlighting", async () => {
    const result = await highlightCodeBlocksInHtml(
      '<pre><code class="language-ts">interface User { name: string }</code></pre>',
    );

    expect(result).toContain("language-typescript");
    expect(result).not.toContain('language-ts"');
    expect(result).toContain("hljs-keyword");
  });

  it("treats legacy unmarked code blocks as TypeScript", async () => {
    const result = await highlightCodeBlocksInHtml(
      "<pre><code>type Result&lt;T&gt; = Promise&lt;T&gt;</code></pre>",
    );

    expect(result).toContain('class="hljs language-typescript"');
    expect(result).toContain("hljs-keyword");
  });

  it.each(["nohighlight", "no-highlight"])(
    "leaves %s code blocks unhighlighted",
    async (className) => {
      const html = `<pre><code class="${className}">const value = 1</code></pre>`;
      const result = await highlightCodeBlocksInHtml(html);

      expect(result).toBe(html);
      expect(result).not.toContain("hljs-keyword");
    },
  );

  it("leaves unregistered languages unchanged", async () => {
    const html = '<pre><code class="language-python">print("hello")</code></pre>';
    const result = await highlightCodeBlocksInHtml(html);

    expect(result).toBe(html);
    expect(result).not.toContain("hljs");
  });

  it("preserves special characters, generics, and multiline code", async () => {
    const result = await highlightCodeBlocksInHtml(
      '<pre><code class="language-typescript">const node = &lt;T extends Record&lt;string, unknown&gt;&gt;(value: T) =&gt; {\n  return value\n}</code></pre>',
    );

    expect(result).toContain("&#x3C;");
    expect(result).toContain(">>>");
    expect(result).toContain("\n");
    expect(result).not.toContain("<T extends");
  });

  it("is idempotent for already highlighted HTML", async () => {
    const once = await highlightCodeBlocksInHtml(
      '<pre><code class="language-typescript">const value = 1</code></pre>',
    );
    const twice = await highlightCodeBlocksInHtml(once);

    expect(twice).toBe(once);
    expect(twice.match(/hljs-keyword/g)).toHaveLength(1);
  });

  it("does not highlight inline code", async () => {
    const html = "<p>Use <code>const value = 1</code> inline.</p>";
    await expect(highlightCodeBlocksInHtml(html)).resolves.toBe(html);
  });

  it("handles HTML tag names case-insensitively", async () => {
    const result = await highlightCodeBlocksInHtml(
      "<PRE><CODE>const value: number = 1</CODE></PRE>",
    );

    expect(result).toContain('class="hljs language-typescript"');
    expect(result).toContain("hljs-keyword");
  });

  it("preserves article embeds and rich content while highlighting code", async () => {
    const html = [
      "<p>before</p>",
      '<img src="/demo.png" width="640" height="320">',
      "<table><tbody><tr><td>cell</td></tr></tbody></table>",
      '<div data-twitter src="https://x.com/vista8/status/123"></div>',
      '<div data-youtube-video><iframe src="https://youtube.com/embed/abc"></iframe></div>',
      '<audio controls src="/demo.mp3"></audio>',
      '<video controls src="/demo.mp4"></video>',
      '<span data-type="math" data-latex="x^2">x^2</span>',
      "<pre><code>const value = 1</code></pre>",
    ].join("");

    const result = await highlightCodeBlocksInHtml(html);

    expect(result).toContain('<img src="/demo.png" width="640" height="320">');
    expect(result).toContain("data-twitter");
    expect(result).toContain("https://x.com/vista8/status/123");
    expect(result).toContain("data-youtube-video");
    expect(result).toContain('<audio controls src="/demo.mp3"></audio>');
    expect(result).toContain('<video controls src="/demo.mp4"></video>');
    expect(result).toContain('data-type="math"');
    expect(result).toContain('class="hljs language-typescript"');
  });

  it("returns empty and code-free HTML without parsing changes", async () => {
    await expect(highlightCodeBlocksInHtml("")).resolves.toBe("");
    await expect(highlightCodeBlocksInHtml("<p>plain text</p>")).resolves.toBe("<p>plain text</p>");
  });
});
