import { describe, expect, it } from "vitest";
import { POST_STATUS_VALUES } from "@/lib/db";
import { asBit, asOptionalEnum, asStringArray, whenDefined } from "@/lib/server/input-coerce";

describe("asBit", () => {
  it("maps only 1/true to 1", () => {
    expect(asBit(1)).toBe(1);
    expect(asBit(true)).toBe(1);
  });

  it("maps everything else to 0", () => {
    for (const value of [0, false, undefined, null, "1", "true", 2, {}, []]) {
      expect(asBit(value)).toBe(0);
    }
  });
});

describe("asStringArray", () => {
  it("trims, drops empties, and keeps only strings", () => {
    expect(asStringArray(["a", " b ", "", 3, null, "c"])).toEqual(["a", "b", "c"]);
  });

  it("returns [] for non-arrays", () => {
    for (const value of [undefined, null, "a,b", 5, {}]) {
      expect(asStringArray(value)).toEqual([]);
    }
  });

  it("caps length at the default 10", () => {
    const many = Array.from({ length: 25 }, (_, index) => `tag-${index}`);
    expect(asStringArray(many)).toHaveLength(10);
  });

  it("honors a custom max", () => {
    expect(asStringArray(["a", "b", "c"], 2)).toEqual(["a", "b"]);
  });
});

describe("asOptionalEnum", () => {
  it("passes allowed values through", () => {
    expect(asOptionalEnum("deleted", POST_STATUS_VALUES)).toBe("deleted");
  });

  it("returns undefined for anything illegal or omitted", () => {
    for (const value of ["nope", undefined, null, 1, {}]) {
      expect(asOptionalEnum(value, POST_STATUS_VALUES)).toBeUndefined();
    }
  });
});

describe("whenDefined", () => {
  it("preserves undefined so partial updates skip the column", () => {
    expect(whenDefined(undefined, asBit)).toBeUndefined();
  });

  it("applies the coercer when the field is present, including falsy values", () => {
    expect(whenDefined(0, asBit)).toBe(0);
    expect(whenDefined(true, asBit)).toBe(1);
    expect(whenDefined(["x", "", "y"], asStringArray)).toEqual(["x", "y"]);
    // A malformed non-array tags payload becomes [] rather than reaching JSON.stringify raw.
    expect(whenDefined("not-an-array", asStringArray)).toEqual([]);
  });
});
