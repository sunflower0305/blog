// @vitest-environment happy-dom

import type { Editor } from "@tiptap/core";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startBackgroundTask: vi.fn(
    async (options: {
      run: () => Promise<unknown>;
      onSuccess: (data: never) => void;
      onError: (message: string) => void;
      onSettled: () => void;
    }) => {
      try {
        options.onSuccess((await options.run()) as never);
      } catch (error) {
        options.onError(error instanceof Error ? error.message : "failed");
      } finally {
        options.onSettled();
      }
    },
  ),
}));

vi.mock("@/lib/client-background-task", () => ({
  startBackgroundTask: mocks.startBackgroundTask,
}));

import { usePostEditorMetadata } from "@/lib/use-post-editor-metadata";

let metadata: ReturnType<typeof usePostEditorMetadata>;

function Harness({ options }: { options: Parameters<typeof usePostEditorMetadata>[0] }) {
  metadata = usePostEditorMetadata(options);
  return null;
}

describe("usePostEditorMetadata", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("applies generated summaries, tags, slugs and covers", async () => {
    const options = createOptions();
    const responses = [
      { value: "Generated summary" },
      { value: [" one ", "two", ""] },
      { value: " Generated Slug " },
      { image: { url: "/generated-cover.png" } },
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response(JSON.stringify(responses.shift()), { status: 200 }),
    );
    act(() => root.render(createElement(Harness, { options })));

    for (const target of ["summary", "tags", "slug", "cover"] as const) {
      await act(async () => {
        metadata.handleGenerateMetadata(target);
        await Promise.resolve();
      });
      await vi.waitFor(() => expect(metadata.isMetadataTargetPending(target)).toBe(false));
    }

    expect(options.setDescription).toHaveBeenCalledWith("Generated summary");
    expect(options.setTags).toHaveBeenCalledWith(["one", "two"]);
    expect(options.setTagInput).toHaveBeenCalledWith("");
    expect(options.setSlug).toHaveBeenCalledWith("generatedslug");
    expect(options.setCoverImage).toHaveBeenCalledWith("/generated-cover.png");
    expect(options.markDirty).toHaveBeenCalledWith({ coverImage: "/generated-cover.png" });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("rejects empty source content before starting a background task", () => {
    const options = createOptions({
      editorRef: { current: createEditor("") },
      latestTitleRef: { current: "" },
    });
    act(() => root.render(createElement(Harness, { options })));

    act(() => metadata.handleGenerateMetadata("summary"));

    expect(options.onError).toHaveBeenCalledWith("先写标题或正文，再生成内容。");
    expect(mocks.startBackgroundTask).not.toHaveBeenCalled();
  });

  it("surfaces API and empty-result errors", async () => {
    const options = createOptions();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "provider unavailable" }), { status: 503 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: "" }), { status: 200 }));
    act(() => root.render(createElement(Harness, { options })));

    await act(async () => {
      metadata.handleGenerateMetadata("summary");
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(options.onError).toHaveBeenCalledWith("provider unavailable"));
    await act(async () => {
      metadata.handleGenerateMetadata("slug");
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(options.onError).toHaveBeenCalledWith("slug 生成结果为空"));
  });
});

function createEditor(text = "Article body") {
  return { getText: vi.fn(() => text) } as unknown as Editor;
}

function createOptions(
  overrides: Partial<Parameters<typeof usePostEditorMetadata>[0]> = {},
): Parameters<typeof usePostEditorMetadata>[0] {
  return {
    category: "Notes",
    description: "Existing summary",
    editSlug: "existing",
    editorRef: { current: createEditor() },
    latestTitleRef: { current: "Article title" },
    markDirty: vi.fn(),
    onClearFeedback: vi.fn(),
    onError: vi.fn(),
    setCoverImage: vi.fn(),
    setDescription: vi.fn(),
    setSlug: vi.fn(),
    setTagInput: vi.fn(),
    setTags: vi.fn(),
    slug: "article",
    tags: ["existing"],
    toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } as never,
    ...overrides,
  };
}
