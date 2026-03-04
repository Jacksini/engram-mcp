import { describe, it, expect } from "vitest";
import {
  CategoryEnum,
  SortByParam,
  OptionalIsoDateTimeParam,
  OptionalNullableIsoDateTimeParam,
  DateRangeParams,
} from "../../src/tools/schemas.js";

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

describe("ISO datetime schemas", () => {
  it("accepts valid ISO datetime with Z suffix", () => {
    const value = "2026-03-03T10:30:45Z";
    expect(OptionalIsoDateTimeParam.parse(value)).toBe(value);
  });

  it("accepts valid ISO datetime with timezone offset", () => {
    const value = "2026-03-03T10:30:45+02:00";
    expect(OptionalIsoDateTimeParam.parse(value)).toBe(value);
  });

  it("rejects non-ISO datetime strings", () => {
    expect(() => OptionalIsoDateTimeParam.parse("2026-03-03 10:30:45")).toThrow();
    expect(() => OptionalIsoDateTimeParam.parse("not-a-date")).toThrow();
  });

  it("nullable ISO schema accepts null and undefined", () => {
    expect(OptionalNullableIsoDateTimeParam.parse(null)).toBeNull();
    expect(OptionalNullableIsoDateTimeParam.parse(undefined)).toBeUndefined();
  });

  it("DateRangeParams validate each range field as ISO datetime", () => {
    expect(DateRangeParams.created_after.parse("2026-03-03T10:30:45Z")).toBe("2026-03-03T10:30:45Z");
    expect(() => DateRangeParams.updated_before.parse("2026-03-03")).toThrow();
  });
});
