export interface Memory {
  id: string;
  content: string;
  category: string;
  tags: string[];
  metadata: Record<string, unknown>;
  project: string;
  created_at: string;
  updated_at: string;
  /** ISO datetime string. Null means no expiration. */
  expires_at: string | null;
  /**
   * Present (and true) only when `deduplicate: true` was passed to create() and
   * an existing memory with the same content hash was found. The returned object
   * is the pre-existing memory, not a newly inserted one.
   */
  _deduplicated?: boolean;
}

export interface CreateMemoryInput {
  content: string;
  category?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  /** Project namespace. When omitted, uses the server's default project. */
  project?: string;
  /** Optional expiration. ISO datetime string. Null or omit for no expiration. */
  expires_at?: string | null;
  /** Set to false to skip automatic link inference on creation. Default: true. */
  auto_link?: boolean;
  /**
   * When true, compute a SHA-256 hash of the trimmed content and skip insertion
   * if a memory with the same hash already exists in the same project.
   * The existing memory is returned with `_deduplicated: true`.
   * Default: false.
   */
  deduplicate?: boolean;
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
  /** Project namespace to scope the search. When omitted, uses the server's default project. */
  project?: string;
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
  /** Project namespace to scope the listing. When omitted, uses the server's default project. */
  project?: string;
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
  project: string;
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
  /** Project namespace to scope the export. When omitted, uses the server's default project. */
  project?: string;
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
  /** Project namespace. When omitted, uses the server's default project. */
  project?: string;
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
  /** Link strength 0.0–1.0. Manual links default to 1.0; auto-generated links carry a computed score. */
  weight: number;
  /** 1 if the link was created automatically by the auto-link engine; 0 for manual links. */
  auto_generated: number;
  created_at: string;
}

export interface RelatedMemory {
  memory: Memory;
  relation: RelationType;
  /** "from" = id → other (id caused/references other), "to" = other → id */
  direction: "from" | "to";
  linked_at: string;
  /** Link strength 0.0–1.0. */
  weight: number;
  /** True if the link was auto-generated. */
  auto_generated: boolean;
}

export interface LinkMemoriesInput {
  from_id: string;
  to_id: string;
  relation?: RelationType;
  /** Link strength 0.0–1.0. Defaults to 1.0 for manual links. */
  weight?: number;
  /** Internal flag. Set to 1 only by the auto-link engine. */
  auto_generated?: number;
}

// ---------------------------------------------------------------------------
// get_related_deep — multi-hop traversal (Fase 2)
// ---------------------------------------------------------------------------

export interface GetRelatedDeepInput {
  id: string;
  /** Maximum traversal depth (1–5). Default: 3. */
  max_depth?: number;
  relation?: RelationType;
  /** Project namespace. When omitted, uses the server's default project. */
  project?: string;
  /** Max total results to return across all depths. Default: 50. */
  limit?: number;
}

export interface RelatedMemoryDeep {
  memory: Memory;
  relation: RelationType;
  /** Hop distance from the origin memory (1 = direct link). */
  depth: number;
  weight: number;
  auto_generated: boolean;
}

export interface GetRelatedDeepResult {
  total: number;
  results: RelatedMemoryDeep[];
}

// ---------------------------------------------------------------------------
// suggest_links — link suggestions without creating them (Fase 2)
// ---------------------------------------------------------------------------

export type SuggestLinkReason = "shared_tags" | "content_similarity" | "temporal_proximity";

export interface SuggestLink {
  from_id: string;
  to_id: string;
  to_content_preview: string;
  to_category: string;
  to_tags: string[];
  suggested_relation: RelationType;
  weight: number;
  reason: SuggestLinkReason;
}

export interface SuggestLinksInput {
  /** Specific memory to analyse. If omitted, orphan memories in the project are analysed. */
  id?: string;
  /** Project namespace. When omitted, uses the server's default project. */
  project?: string;
  /** Max suggestions to return. Default: 20. */
  limit?: number;
}

export interface SuggestLinksResult {
  analysed: number;
  suggestions: SuggestLink[];
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
  /** Project namespace to scope the graph. When omitted, uses the server's default project. */
  project?: string;
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
  project: string;
  expires_at: string | null;
  changed_at: string;
}

export interface GetHistoryInput {
  memory_id: string;
  /** Project namespace. When omitted, uses the server's default project. */
  project?: string;
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

// ---------------------------------------------------------------------------
// Projects (Ronda 29)
// ---------------------------------------------------------------------------

export interface ProjectInfo {
  project: string;
  count: number;
}

export interface MigrateToProjectInput {
  tag: string;
  project: string;
}
