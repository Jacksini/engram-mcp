import { describe, it, expect, vi } from "vitest";
import { formatGroupedDescription } from "../../src/tools/tool-catalog.js";
import { patchGroupedToolDescriptions } from "../../src/tools/grouped-descriptions.js";

describe("formatGroupedDescription", () => {
  it("prefixes description with tool group when tool exists in catalog", () => {
    const result = formatGroupedDescription("save_memory", "Guarda una memoria");
    expect(result.startsWith("Create · ")).toBe(true);
  });

  it("does not duplicate prefix if description is already prefixed", () => {
    const result = formatGroupedDescription("get_memory", "Read · Devuelve una memoria");
    expect(result).toBe("Read · Devuelve una memoria");
  });

  it("keeps description unchanged for unknown tools", () => {
    const result = formatGroupedDescription("custom_tool", "Custom description");
    expect(result).toBe("Custom description");
  });
});

describe("patchGroupedToolDescriptions", () => {
  it("patches server.tool to inject grouped descriptions", () => {
    const captured: Array<{ name: string; description: string }> = [];
    const fakeServer = {
      tool: vi.fn((name: string, description: string, ..._rest: unknown[]) => {
        captured.push({ name, description });
      }),
    };

    patchGroupedToolDescriptions(fakeServer as never);
    fakeServer.tool("delete_memory", "Elimina una memoria", {});

    expect(captured).toHaveLength(1);
    expect(captured[0]!.name).toBe("delete_memory");
    expect(captured[0]!.description.startsWith("Delete · ")).toBe(true);
  });
});
