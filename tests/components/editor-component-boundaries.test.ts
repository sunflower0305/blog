import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("editor component boundaries", () => {
  it("keeps upload and AI metadata workflows outside PostEditor", () => {
    const editor = readFileSync("components/PostEditor.tsx", "utf8");
    const controller = readFileSync("lib/use-post-editor-controller.tsx", "utf8");
    const metadataHook = readFileSync("lib/use-post-editor-metadata.ts", "utf8");
    const uploadHook = readFileSync("lib/use-post-editor-uploads.ts", "utf8");

    expect(editor).toContain("usePostEditorController");
    expect(editor).not.toContain("usePostEditorUploads");
    expect(editor).not.toContain("usePostEditorMetadata");
    expect(controller).toContain("usePostEditorUploads");
    expect(controller).toContain("usePostEditorMetadata");
    expect(controller).not.toContain("getLatestTitle");
    expect(controller).not.toContain("eslint-disable-line react-hooks/exhaustive-deps");
    expect(controller).not.toContain('fetch("/api/editor/ai-post-metadata"');
    expect(uploadHook).toContain("latestTitleRef: RefObject<string>");
    expect(metadataHook).toContain("latestTitleRef: RefObject<string>");
    expect(metadataHook).not.toMatch(/^\s*title:\s*string;/m);
  });

  it("keeps image history and result rendering outside the modal orchestrator", () => {
    const modal = readFileSync("components/ImageGenerationModal.tsx", "utf8");
    const historyHook = readFileSync("lib/image-generation-history.ts", "utf8");
    const resultPanel = readFileSync("components/ImageGenerationResultPanel.tsx", "utf8");

    expect(modal).toContain("useImageGenerationHistory");
    expect(modal).toContain("DEFAULT_IMAGE_HISTORY_SCOPE");
    expect(modal).toContain("ImageGenerationResultPanel");
    expect(modal).not.toContain("LOCAL_HISTORY_UPDATED_EVENT");
    expect(historyHook).not.toContain("localStorage.setItem");
    expect(resultPanel.startsWith('"use client";')).toBe(true);
  });
});
