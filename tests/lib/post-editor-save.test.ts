import { describe, expect, it } from "vitest";
import { buildAutosaveSnapshot } from "@/lib/use-post-editor-autosave";
import { buildPublishStatusFields } from "@/lib/use-post-editor-save";

describe("post editor save helpers", () => {
  it("builds a stable autosave snapshot from persisted fields", () => {
    const payload = {
      currentSlug: "before",
      nextSlug: "after",
      title: "Title",
      html: "<p>Body</p>",
      description: "Summary",
      category: "Notes",
      tags: ["one", "two"],
      coverImage: "/cover.png",
    };

    expect(buildAutosaveSnapshot(payload)).toBe(JSON.stringify(payload));
  });

  it("maps public, draft and unlisted publication states", () => {
    expect(buildPublishStatusFields("public")).toEqual({
      status: "published",
      is_hidden: 0,
      password: null,
    });
    expect(buildPublishStatusFields("draft")).toEqual({
      status: "draft",
      is_hidden: 0,
      password: null,
    });
    expect(buildPublishStatusFields("unlisted")).toEqual({
      status: "published",
      is_hidden: 1,
      password: null,
    });
  });

  it("keeps an existing password for encrypted publication", () => {
    expect(buildPublishStatusFields("encrypted", "existing-password")).toEqual({
      status: "published",
      is_hidden: 0,
      password: "existing-password",
    });
  });
});
