import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { MemoryDatabase } from "../../src/db/database.js";

describe("get_graph (getGraph)", () => {
  let db: MemoryDatabase;
  let idA: string;
  let idB: string;
  let idC: string;
  let idD: string; // orphan

  beforeEach(() => {
    db = createTestDb();
    idA = db.create({ content: "Memory A about cats", category: "code" }).id;
    idB = db.create({ content: "Memory B about dogs", category: "decision" }).id;
    idC = db.create({ content: "Memory C about fish", category: "general" }).id;
    idD = db.create({ content: "Orphan memory with no links", category: "bug" }).id;

    db.linkMemories({ from_id: idA, to_id: idB, relation: "caused" });
    db.linkMemories({ from_id: idA, to_id: idC, relation: "references" });
    db.linkMemories({ from_id: idB, to_id: idC, relation: "supersedes" });
  });

  afterEach(() => { db.close(); });

  // ─── basic shape ──────────────────────────────────────────────────────────

  it("returns correct node_count and edge_count", () => {
    const g = db.getGraph();
    expect(g.node_count).toBe(3); // A, B, C — not D (orphan)
    expect(g.edge_count).toBe(3);
  });

  it("nodes include all IDs referenced in links", () => {
    const g = db.getGraph();
    const ids = g.nodes.map((n) => n.id);
    expect(ids).toContain(idA);
    expect(ids).toContain(idB);
    expect(ids).toContain(idC);
    expect(ids).not.toContain(idD);
  });

  it("edges have correct from_id, to_id and relation", () => {
    const g = db.getGraph();
    const ab = g.edges.find((e) => e.from_id === idA && e.to_id === idB);
    expect(ab?.relation).toBe("caused");
    const bc = g.edges.find((e) => e.from_id === idB && e.to_id === idC);
    expect(bc?.relation).toBe("supersedes");
  });

  it("nodes have content_preview, category and tags fields", () => {
    const g = db.getGraph();
    const nodeA = g.nodes.find((n) => n.id === idA);
    expect(nodeA?.content_preview).toBeTruthy();
    expect(nodeA?.category).toBe("code");
    expect(Array.isArray(nodeA?.tags)).toBe(true);
  });

  it("content_preview truncates at 60 characters", () => {
    const longContent = "A".repeat(100);
    const idLong = db.create({ content: longContent }).id;
    db.linkMemories({ from_id: idA, to_id: idLong });

    const g = db.getGraph();
    const node = g.nodes.find((n) => n.id === idLong);
    expect(node?.content_preview.length).toBeLessThanOrEqual(60);
  });

  // ─── include_orphans ──────────────────────────────────────────────────────

  it("include_orphans=false (default) excludes orphan nodes", () => {
    const g = db.getGraph({ include_orphans: false });
    const ids = g.nodes.map((n) => n.id);
    expect(ids).not.toContain(idD);
  });

  it("include_orphans=true includes all active memories", () => {
    const g = db.getGraph({ include_orphans: true });
    const ids = g.nodes.map((n) => n.id);
    expect(ids).toContain(idD);
    expect(g.node_count).toBe(4);
  });

  // ─── relation filter ──────────────────────────────────────────────────────

  it("relation filter restricts edges to only those of that type", () => {
    const g = db.getGraph({ relation: "caused" });
    expect(g.edge_count).toBe(1);
    expect(g.edges[0]!.relation).toBe("caused");
  });

  it("relation filter also restricts nodes to only those in matching edges", () => {
    // Only A→B (caused). So nodes should be A and B, not C.
    const g = db.getGraph({ relation: "caused" });
    const ids = g.nodes.map((n) => n.id);
    expect(ids).toContain(idA);
    expect(ids).toContain(idB);
    expect(ids).not.toContain(idC);
  });

  it("relation filter with no matches returns empty graph", () => {
    const g = db.getGraph({ relation: "related" });
    expect(g.node_count).toBe(0);
    expect(g.edge_count).toBe(0);
  });

  // ─── empty graph ──────────────────────────────────────────────────────────

  it("returns empty graph when no links exist", () => {
    const emptyDb = createTestDb();
    emptyDb.create({ content: "Lonely memory" });
    const g = emptyDb.getGraph();
    expect(g.node_count).toBe(0);
    expect(g.edge_count).toBe(0);
    emptyDb.close();
  });

  // ─── mermaid output ───────────────────────────────────────────────────────

  it("mermaid starts with 'flowchart LR'", () => {
    const g = db.getGraph();
    expect(g.mermaid.startsWith("flowchart LR")).toBe(true);
  });

  it("mermaid contains relation labels for edges", () => {
    const g = db.getGraph();
    expect(g.mermaid).toContain("caused");
    expect(g.mermaid).toContain("supersedes");
    expect(g.mermaid).toContain("references");
  });

  it("mermaid contains node category labels", () => {
    const g = db.getGraph();
    expect(g.mermaid).toContain("code");
    expect(g.mermaid).toContain("decision");
  });

  it("empty graph mermaid contains 'No memories in graph'", () => {
    const emptyDb = createTestDb();
    const g = emptyDb.getGraph();
    expect(g.mermaid).toContain("No memories in graph");
    emptyDb.close();
  });
});
