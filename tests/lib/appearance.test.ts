import { describe, expect, it } from "vitest";
import { isTheme, normalizeTheme, THEME_OPTIONS } from "@/lib/appearance";

describe("appearance themes", () => {
  it("exposes only the three distinct themes", () => {
    expect(THEME_OPTIONS.map((theme) => theme.id)).toEqual(["default", "editorial", "terminal"]);
  });

  it("migrates the removed refined theme to default", () => {
    expect(isTheme("refined")).toBe(false);
    expect(normalizeTheme("refined")).toBe("default");
  });
});
