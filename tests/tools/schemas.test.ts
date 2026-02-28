import { describe, it, expect } from "vitest";
import { CategoryEnum, SortByParam } from "../../src/tools/schemas.js";

describe("CategoryEnum Zod schema", () => {
  it("accepts all valid categories", () => {
    for (const cat of ["general", "code", "decision", "bug", "architecture", "convention"] as const) {
      expect(() => CategoryEnum.parse(cat)).not.toThrow();
      expect(CategoryEnum.parse(cat)).toBe(cat);
    }
  });

  it("rejects unknown category strings", () => {
    expect(() => CategoryEnum.parse("invalid")).toThrow();
    expect(() => CategoryEnum.parse("tech")).toThrow();
    expect(() => CategoryEnum.parse("GENERAL")).toThrow(); // case-sensitive
  });

  it("accepts undefined (optional field)", () => {
    expect(CategoryEnum.parse(undefined)).toBeUndefined();
  });
});

describe("SortByParam Zod schema", () => {
  it("accepts all valid sort values", () => {
    const valid = ["created_at_desc", "created_at_asc", "updated_at_desc"] as const;
    for (const v of valid) {
      expect(() => SortByParam.parse(v)).not.toThrow();
      expect(SortByParam.parse(v)).toBe(v);
    }
  });

  it("rejects unknown sort strings", () => {
    expect(() => SortByParam.parse("newest_first")).toThrow();
    expect(() => SortByParam.parse("created_at")).toThrow();
  });

  it("accepts undefined (optional field)", () => {
    expect(SortByParam.parse(undefined)).toBeUndefined();
  });
});
