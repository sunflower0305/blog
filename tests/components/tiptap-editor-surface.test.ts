// @vitest-environment happy-dom

import type { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { act, createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TiptapEditorSurface } from "@/components/TiptapEditorSurface";

describe("TiptapEditorSurface", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("initializes with SSR-safe rendering and destroys the editor on unmount", async () => {
    const onCreate = vi.fn();
    const onDestroy = vi.fn();

    act(() => {
      root.render(
        createElement(TiptapEditorSurface, {
          extensions: [StarterKit],
          initialContent: { type: "doc", content: [{ type: "paragraph" }] },
          onCreate,
          onDestroy,
        }),
      );
    });
    await vi.waitFor(() => expect(onCreate).toHaveBeenCalledOnce());

    act(() => root.unmount());
    await vi.waitFor(() => expect(onDestroy).toHaveBeenCalledOnce());
    root = createRoot(container);
  });

  it("keeps two editor instances isolated", async () => {
    const editors: Editor[] = [];

    act(() => {
      root.render(
        createElement(
          Fragment,
          null,
          createElement(TiptapEditorSurface, {
            extensions: [StarterKit],
            initialContent: "<p>第一个</p>",
            onCreate: ({ editor }) => editors.push(editor),
          }),
          createElement(TiptapEditorSurface, {
            extensions: [StarterKit],
            initialContent: "<p>第二个</p>",
            onCreate: ({ editor }) => editors.push(editor),
          }),
        ),
      );
    });
    await vi.waitFor(() => expect(editors).toHaveLength(2));

    act(() => editors[0]?.commands.setContent("<p>只修改第一个</p>"));
    expect(editors[0]?.getText()).toBe("只修改第一个");
    expect(editors[1]?.getText()).toBe("第二个");
  });
});
