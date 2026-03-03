import { describe, it, expect } from "vitest";
import { TOOL_CATALOG, getToolGroupsPayload } from "../../src/tools/tool-catalog.js";

describe("tool catalog grouping", () => {
  it("contains unique tool names", () => {
    const names = TOOL_CATALOG.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("returns grouped payload with expected groups", () => {
    const payload = getToolGroupsPayload();
    expect(payload.total_tools).toBe(31);
    expect(payload.groups["Create"].length).toBeGreaterThan(0);
    expect(payload.groups["Read"].length).toBeGreaterThan(0);
    expect(payload.groups["Update"].length).toBeGreaterThan(0);
    expect(payload.groups["Delete"].length).toBeGreaterThan(0);
    expect(payload.groups["Graph"].length).toBeGreaterThan(0);
    expect(payload.groups["Ops/Admin"].length).toBeGreaterThan(0);
  });

  it("includes the discovery tool in Ops/Admin", () => {
    const payload = getToolGroupsPayload();
    const opsToolNames = payload.groups["Ops/Admin"].map((t) => t.name);
    expect(opsToolNames).toContain("list_tool_groups");
  });
});
