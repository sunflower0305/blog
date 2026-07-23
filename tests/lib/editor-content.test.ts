import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { parse, fromSchema } = vi.hoisted(() => {
  const parse = vi.fn();
  return {
    parse,
    fromSchema: vi.fn(() => ({ parse })),
  };
});

vi.mock("@tiptap/pm/model", () => ({
  DOMParser: { fromSchema },
}));

import { setEditorHtmlContent } from "@/lib/editor-content";

describe("setEditorHtmlContent", () => {
  beforeEach(() => {
    const template = {
      innerHTML: "",
      content: { nodeType: 11, querySelectorAll: vi.fn(() => []) },
    };
    vi.stubGlobal("document", {
      createElement: vi.fn(() => template),
    });
    parse.mockReturnValue({
      toJSON: () => ({
        type: "doc",
        content: [
          {
            type: "codeBlock",
            attrs: { language: "ts" },
            content: [{ type: "text", text: "const first = 1\n\nconst second = 2" }],
          },
        ],
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses stored HTML before setContent so Markdown does not split code blocks", () => {
    const setContent = vi.fn();
    const editor = {
      schema: { nodes: {} },
      commands: { setContent },
    };
    const html = '<pre><code class="language-ts">const first = 1\n\nconst second = 2</code></pre>';

    setEditorHtmlContent(editor as never, html);

    expect(document.createElement).toHaveBeenCalledWith("template");
    expect(parse).toHaveBeenCalledWith(expect.objectContaining({ nodeType: 11 }));
    expect(setContent).toHaveBeenCalledWith({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "ts" },
          content: [{ type: "text", text: "const first = 1\n\nconst second = 2" }],
        },
      ],
    });
    expect(typeof setContent.mock.calls[0]?.[0]).not.toBe("string");
  });
});
