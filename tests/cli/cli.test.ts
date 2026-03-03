import { describe, it, expect } from "vitest";
import { parseArgs, getHelpText } from "../../src/cli.js";

describe("CLI parser", () => {
  it("parses global --project before command", () => {
    const parsed = parseArgs([
      "node",
      "cli.js",
      "--db",
      "/tmp/mem.db",
      "--project",
      "engram-mcp",
      "search",
      "sqlite",
      "--limit",
      "5",
    ]);

    expect(parsed.command).toBe("search");
    expect(parsed.positional).toEqual(["sqlite"]);
    expect(parsed.flags["db"]).toBe("/tmp/mem.db");
    expect(parsed.flags["project"]).toBe("engram-mcp");
    expect(parsed.flags["limit"]).toBe("5");
  });

  it("parses --project after command as regular flag", () => {
    const parsed = parseArgs([
      "node",
      "cli.js",
      "list",
      "--project",
      "p2",
      "--limit",
      "10",
      "--json",
    ]);

    expect(parsed.command).toBe("list");
    expect(parsed.flags["project"]).toBe("p2");
    expect(parsed.flags["limit"]).toBe("10");
    expect(parsed.flags["json"]).toBe(true);
  });

  it("parses new deep traversal command flags", () => {
    const parsed = parseArgs([
      "node",
      "cli.js",
      "get-related-deep",
      "abc-123",
      "--max-depth",
      "4",
      "--relation",
      "caused",
      "--project",
      "engram-mcp",
      "--limit",
      "30",
    ]);

    expect(parsed.command).toBe("get-related-deep");
    expect(parsed.positional).toEqual(["abc-123"]);
    expect(parsed.flags["max-depth"]).toBe("4");
    expect(parsed.flags["relation"]).toBe("caused");
    expect(parsed.flags["project"]).toBe("engram-mcp");
    expect(parsed.flags["limit"]).toBe("30");
  });
});

describe("CLI help text", () => {
  it("documents global project flag", () => {
    const help = getHelpText();
    expect(help).toContain("--project <p>");
  });

  it("documents new advanced commands", () => {
    const help = getHelpText();
    expect(help).toContain("get-related-deep <id>");
    expect(help).toContain("suggest-links [id]");
    expect(help).toContain("list-projects");
    expect(help).toContain("migrate-to-project <tag> <project>");
  });
});
