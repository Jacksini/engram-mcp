export interface Memory {
  id: string;
  content: string;
  category: string;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  /** ISO datetime string. Null means no expiration. */
  expires_at: string | null;
}

export interface CreateMemoryInput {
  content: string;
  category?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  /** Optional expiration. ISO datetime string. Null or omit for no expiration. */
  expires_at?: string | null;
}

export interface UpdateMemoryInput {
  content?: string;
  category?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  /** Set to a future ISO datetime to add/update expiration. Set to null to remove expiration. Omit to leave unchanged. */
  expires_at?: string | null;
}

export type SearchMode = "any" | "all" | "near";

export interface SearchMemoriesInput {
  query: string;
  category?: string;
  tag?: string;
  limit?: number;
  offset?: number;
  /** "any" = OR between terms (default), "all" = AND, "near" = FTS5 NEAR(terms, distance) */
  mode?: SearchMode;
  /** Used only when mode="near". Max token distance between terms (default 10). */
  near_distance?: number;
  /** Filter by a specific key in the metadata JSON object. Must be combined with metadata_value. */
  metadata_key?: string;
  /** Value to match for metadata_key via json_extract. */
  metadata_value?: string;
  /** ISO datetime string. Only return memories created at or after this time. */
  created_after?: string;
  /** ISO datetime string. Only return memories created at or before this time. */
  created_before?: string;
  /** ISO datetime string. Only return memories updated at or after this time. */
  updated_after?: string;
  /** ISO datetime string. Only return memories updated at or before this time. */
  updated_before?: string;
  /** Sort order for search results. Default: rank (FTS relevance). */
  sort_by?: SortBy;
}

/** Validated category values. Using other strings is still accepted at the DB layer (normalised to lowercase). */
export const VALID_CATEGORIES = ["general", "code", "decision", "bug", "architecture", "convention"] as const;
export type ValidCategory = typeof VALID_CATEGORIES[number];

export type SortBy = "created_at_desc" | "created_at_asc" | "updated_at_desc";

export interface ListMemoriesInput {
  category?: string;
  tag?: string;
  limit?: number;
  offset?: number;
  /** Filter by a specific key in the metadata JSON object. Must be combined with metadata_value. */
  metadata_key?: string;
  /** Value to match for metadata_key via json_extract. */
  metadata_value?: string;
  /** Sort order for results. Default: created_at_desc (newest first). */
  sort_by?: SortBy;
  /** ISO datetime string. Only return memories created at or after this time. */
  created_after?: string;
  /** ISO datetime string. Only return memories created at or before this time. */
  created_before?: string;
  /** ISO datetime string. Only return memories updated at or after this time. */
  updated_after?: string;
  /** ISO datetime string. Only return memories updated at or before this time. */
  updated_before?: string;
}

/** One item in a bulk update request. Requires id + at least one field to change. */
export interface BatchUpdateItem extends UpdateMemoryInput {
  id: string;
}

/**
 * Slim view of a memory — only the fields needed for context retrieval.
 * Omits timestamps and metadata to minimize token usage.
 */
export interface MemorySlim {
  id: string;
  content: string;
  category: string;
  tags: string[];
}

export interface CategorySnapshot {
  count: number;
  recent: MemorySlim[];
}

export interface ContextSnapshot {
  total: number;
  by_category: Record<string, CategorySnapshot>;
  /** tag → number of memories that carry it */
  tags_index: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------

export interface ExportMemoriesInput {
  category?: string;
  tag?: string;
  limit?: number;
}

export type ImportMode = "insert" | "upsert";

/** Full memory row as provided by the caller for import. id is optional for insert mode. */
export interface ImportMemoryRow {
  id?: string;
  content: string;
  category?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  ids: string[];
}

// ---------------------------------------------------------------------------
// Stats / Audit
// ---------------------------------------------------------------------------

export interface StatsResult {
  total: number;
  by_category: Record<string, number>;
  top_tags: Array<{ tag: string; count: number }>;
  oldest: Memory | null;
  newest: Memory | null;
  avg_content_len: number;
  memories_without_tags: number;
  memories_without_metadata: number;
}

// ---------------------------------------------------------------------------
// Relations (Ronda 25)
// ---------------------------------------------------------------------------

export type RelationType = "caused" | "references" | "supersedes" | "related";

export interface MemoryLink {
  from_id: string;
  to_id: string;
  relation: RelationType;
  created_at: string;
}

export interface RelatedMemory {
  memory: Memory;
  relation: RelationType;
  /** "from" = id → other (id caused/references other), "to" = other → id */
  direction: "from" | "to";
  linked_at: string;
}

export interface LinkMemoriesInput {
  from_id: string;
  to_id: string;
  relation?: RelationType;
}

export interface GetRelatedInput {
  id: string;
  relation?: RelationType;
  /** "from" = outgoing links, "to" = incoming links, "both" = all */
  direction?: "from" | "to" | "both";
}

// ---------------------------------------------------------------------------
// rename_tag
// ---------------------------------------------------------------------------

export interface RenameTagResult {
  updated: number;
  old_tag: string;
  new_tag: string;
}

// ---------------------------------------------------------------------------
// get_links
// ---------------------------------------------------------------------------

export interface ListLinksInput {
  from_id?: string;
  to_id?: string;
  relation?: RelationType;
  limit?: number;
  offset?: number;
}

export interface ListLinksResult {
  total: number;
  offset: number;
  limit: number;
  links: MemoryLink[];
}

// ---------------------------------------------------------------------------
// get_graph (Ronda 28)
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string;
  content_preview: string;
  category: string;
  tags: string[];
}

export interface GraphEdge {
  from_id: string;
  to_id: string;
  relation: RelationType;
}

export interface GetGraphInput {
  include_orphans?: boolean;
  relation?: RelationType;
}

export interface GraphResult {
  node_count: number;
  edge_count: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  mermaid: string;
}

// ---------------------------------------------------------------------------
// memory_history / versioning (Ronda 28)
// ---------------------------------------------------------------------------

export type HistoryOperation = "create" | "update" | "delete";

export interface MemoryHistoryEntry {
  history_id: number;
  memory_id: string;
  operation: HistoryOperation;
  content: string;
  category: string;
  tags: string[];
  metadata: Record<string, unknown>;
  expires_at: string | null;
  changed_at: string;
}

export interface GetHistoryInput {
  memory_id: string;
  limit?: number;
  offset?: number;
}

export interface GetHistoryResult {
  total: number;
  offset: number;
  limit: number;
  entries: MemoryHistoryEntry[];
}

export interface RestoreMemoryInput {
  memory_id: string;
  history_id: number;
}
