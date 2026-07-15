// @vitest-environment happy-dom

import { Editor, Extension } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createImageUpload, UploadImagesPlugin } from "@/lib/editor-image-upload-plugin";

function createEditor() {
  const UploadExtension = Extension.create({
    name: "testImageUpload",
    addProseMirrorPlugins() {
      return [UploadImagesPlugin({ imageClass: "opacity-40" })];
    },
  });

  return new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit, Image, UploadExtension],
    content: "<p>before after</p>",
  });
}

describe("editor image upload plugin", () => {
  beforeEach(() => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a translucent placeholder and replaces it with an image on success", async () => {
    const editor = createEditor();
    const upload = createImageUpload({ onUpload: vi.fn().mockResolvedValue("/image.png") });
    const file = new File(["image"], "image.png", { type: "image/png" });

    editor.commands.setTextSelection(8);
    upload(file, editor.view, editor.state.selection.from);
    expect(editor.view.dom.querySelector(".img-placeholder img")?.className).toContain(
      "opacity-40",
    );

    await vi.waitFor(() => expect(editor.getHTML()).toContain('src="/image.png"'));
    expect(editor.view.dom.querySelector(".img-placeholder")).toBeNull();
    expect(editor.getText().replace(/\s+/g, " ")).toContain("before after");
    editor.destroy();
  });

  it("removes the placeholder without inserting an image on failure", async () => {
    const editor = createEditor();
    const upload = createImageUpload({ onUpload: vi.fn().mockRejectedValue(new Error("failed")) });
    const file = new File(["image"], "image.png", { type: "image/png" });

    upload(file, editor.view, editor.state.selection.from);
    expect(editor.view.dom.querySelector(".img-placeholder")).not.toBeNull();

    await vi.waitFor(() => expect(editor.view.dom.querySelector(".img-placeholder")).toBeNull());
    expect(editor.getHTML()).not.toContain("<img");
    editor.destroy();
  });
});
