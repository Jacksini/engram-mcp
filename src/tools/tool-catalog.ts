export type ToolGroup = "Create" | "Read" | "Update" | "Delete" | "Graph" | "Ops/Admin";

export interface ToolCatalogEntry {
  name: string;
  group: ToolGroup;
  purpose: string;
}

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  { name: "save_memory", group: "Create", purpose: "Save a single memory" },
  { name: "save_memories", group: "Create", purpose: "Save multiple memories in one transaction" },

  { name: "get_memory", group: "Read", purpose: "Fetch one memory by id" },
  { name: "get_memories", group: "Read", purpose: "Fetch multiple memories by ids" },
  { name: "list_memories", group: "Read", purpose: "List memories with filters" },
  { name: "search_memories", group: "Read", purpose: "Full-text search memories" },
  { name: "get_context_snapshot", group: "Read", purpose: "Get compact context snapshot" },
  { name: "get_stats", group: "Read", purpose: "Get aggregate database stats" },
  { name: "export_memories", group: "Read", purpose: "Export memories as JSON array" },
  { name: "get_history", group: "Read", purpose: "Get change history for a memory" },
  { name: "list_projects", group: "Read", purpose: "List projects with memory counts" },

  { name: "update_memory", group: "Update", purpose: "Update a single memory" },
  { name: "update_memories", group: "Update", purpose: "Update multiple memories" },
  { name: "restore_memory", group: "Update", purpose: "Restore memory from history" },
  { name: "rename_tag", group: "Update", purpose: "Rename a tag globally" },
  { name: "update_link", group: "Update", purpose: "Update relation type of an existing link" },
  { name: "migrate_to_project", group: "Update", purpose: "Move memories by tag from a source project to another project" },

  { name: "delete_memory", group: "Delete", purpose: "Delete a single memory" },
  { name: "delete_memories", group: "Delete", purpose: "Delete multiple memories" },
  { name: "purge_expired", group: "Delete", purpose: "Physically delete expired memories" },

  { name: "link_memories", group: "Graph", purpose: "Create or upsert directional link" },
  { name: "unlink_memories", group: "Graph", purpose: "Remove directional link" },
  { name: "get_related", group: "Graph", purpose: "Get linked memories around a node" },
  { name: "get_links", group: "Graph", purpose: "List raw graph edges" },
  { name: "get_graph", group: "Graph", purpose: "Get graph nodes/edges + Mermaid" },
  { name: "get_related_deep", group: "Graph", purpose: "Multi-hop graph traversal" },
  { name: "suggest_links", group: "Graph", purpose: "Suggest links without creating them" },

  { name: "import_memories", group: "Ops/Admin", purpose: "Import memories in bulk" },
  { name: "maintenance", group: "Ops/Admin", purpose: "Run integrity check + WAL checkpoint" },
  { name: "backup", group: "Ops/Admin", purpose: "Create timestamped SQLite backup" },
  { name: "list_tool_groups", group: "Ops/Admin", purpose: "Discover tools grouped by function" },
];

export function getToolGroupsPayload(): {
  total_tools: number;
  groups: Record<ToolGroup, Array<{ name: string; purpose: string }>>;
} {
  const groups: Record<ToolGroup, Array<{ name: string; purpose: string }>> = {
    "Create": [],
    "Read": [],
    "Update": [],
    "Delete": [],
    "Graph": [],
    "Ops/Admin": [],
  };

  for (const entry of TOOL_CATALOG) {
    groups[entry.group].push({ name: entry.name, purpose: entry.purpose });
  }

  for (const groupName of Object.keys(groups) as ToolGroup[]) {
    groups[groupName].sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    total_tools: TOOL_CATALOG.length,
    groups,
  };
}

export function getToolGroupByName(toolName: string): ToolGroup | null {
  const found = TOOL_CATALOG.find((entry) => entry.name === toolName);
  return found?.group ?? null;
}

export function formatGroupedDescription(toolName: string, description: string): string {
  const group = getToolGroupByName(toolName);
  if (!group) return description;

  const prefix = `${group} · `;
  if (description.startsWith(prefix)) return description;
  return `${prefix}${description}`;
}
