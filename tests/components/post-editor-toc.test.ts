// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { EditorEvents } from "@tiptap/core";
import type { PostEditorController } from "@/lib/use-post-editor-controller";
import { PostEditorCanvas } from "@/components/post-editor/PostEditorCanvas";

const surface = vi.hoisted(() => ({
  props: {} as {
    onCreate: (event: EditorEvents["create"]) => void;
    onUpdate: (event: EditorEvents["update"]) => void;
  },
}));
vi.mock("@/components/TiptapEditorSurface", () => ({
  TiptapEditorSurface: (props: typeof surface.props) => {
    surface.props = props;
    return null;
  },
}));
vi.mock("@/lib/editor-extensions", () => ({
  FormattingBubble: () => null,
  getEditorCharacterCount: () => 0,
}));
vi.mock("@/lib/editor-content", () => ({ setEditorHtmlContent: vi.fn() }));

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it("shows headings on editor creation and follows heading edits and removal", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const host = document.createElement("div");
  const content = document.createElement("div");
  content.innerHTML = "<h2>第一节</h2><h3>子标题</h3>";
  document.body.appendChild(host);
  document.body.appendChild(content);
  const root = createRoot(host);
  const controller = {
    draftReady: true,
    title: "测试",
    editorRef: { current: null },
    skipNextEditorUpdateRef: { current: false },
    lastAutosaveSnapshotRef: { current: null },
    latestTitleRef: { current: "测试" },
    setCharCount: vi.fn(),
    scheduleDraftSave: vi.fn(),
  } as unknown as PostEditorController;
  const event = { editor: { view: { dom: content } } } as unknown as EditorEvents["create"];
  try {
    act(() => root.render(createElement(PostEditorCanvas, { controller })));
    act(() => surface.props.onCreate(event));
    expect(host.querySelector("aside nav")?.textContent).toBe("第一节子标题");
    expect(host.querySelector("aside a")?.getAttribute("href")).toBe(
      `#${content.querySelector("h2")!.id}`,
    );

    content.querySelector("h3")!.textContent = "已修改";
    act(() => surface.props.onUpdate(event as EditorEvents["update"]));
    expect(host.querySelector("aside nav")?.textContent).toBe("第一节已修改");

    content.querySelector("h3")!.remove();
    act(() => surface.props.onUpdate(event as EditorEvents["update"]));
    expect(host.querySelector("aside")).toBeNull();
  } finally {
    act(() => root.unmount());
  }
});
