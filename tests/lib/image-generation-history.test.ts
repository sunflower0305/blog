import { describe, expect, it } from "vitest";
import {
  createImageHistoryStorageKey,
  DEFAULT_IMAGE_HISTORY_SCOPE,
} from "@/lib/image-generation-history";

describe("image generation history", () => {
  it("creates scoped storage keys with a stable fallback", () => {
    expect(createImageHistoryStorageKey("admin-editor")).toBe("blog:ai-image-history:admin-editor");
    expect(createImageHistoryStorageKey("")).toBe(
      `blog:ai-image-history:${DEFAULT_IMAGE_HISTORY_SCOPE}`,
    );
  });
});
