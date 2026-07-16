import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("filters false values and joins conditional classes", () => {
    expect(cn("base", false, null, undefined, { active: true })).toBe("base active");
  });

  it("lets later Tailwind utilities override earlier utilities", () => {
    expect(cn("px-2 text-red-500", "px-4 text-[var(--editor-ink)]")).toBe(
      "px-4 text-[var(--editor-ink)]",
    );
  });

  it("merges responsive, state, and arbitrary variants independently", () => {
    expect(
      cn(
        "sm:px-2 hover:text-red-500 data-[state=open]:bg-red-500",
        "sm:px-4 hover:text-[var(--editor-ink)] data-[state=open]:bg-[var(--editor-soft)]",
      ),
    ).toBe("sm:px-4 hover:text-[var(--editor-ink)] data-[state=open]:bg-[var(--editor-soft)]");
  });
});
