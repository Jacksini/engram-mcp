import Database from "better-sqlite3";
import type { Statement } from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { SCHEMA_SQL } from "./schema.js";
import type {
  Memory,
  MemorySlim,
  ContextSnapshot,
  CreateMemoryInput,
  UpdateMemoryInput,
  BatchUpdateItem,
  SearchMemoriesInput,
  ListMemoriesInput,
  SortBy,
  ExportMemoriesInput,
  ImportMode,
  ImportMemoryRow,
  ImportResult,
  StatsResult,
  MemoryLink,
  RelatedMemory,
  RelationType,
  LinkMemoriesInput,
  GetRelatedInput,
  RenameTagResult,
  ListLinksInput,
  ListLinksResult,
  GetGraphInput,
  GraphResult,
  GraphNode,
  GraphEdge,
  GetHistoryInput,
  GetHistoryResult,
  MemoryHistoryEntry,
  RestoreMemoryInput,
  ProjectInfo,
  MigrateToProjectInput,
  GetRelatedDeepInput,
  GetRelatedDeepResult,
  RelatedMemoryDeep,
  SuggestLinksInput,
  SuggestLinksResult,
  SuggestLink,
  SuggestLinkReason,
} from "../types/memory.js";


interface MemoryRow {
  id: string;
  content: string;
  category: string;
  tags: string;
  metadata: string;
  project: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

/** Internal row returned by link JOIN queries */
interface LinkQueryRow extends MemoryRow {
  relation: string;
  link_created_at: string;
  weight: number;
  auto_generated: number;
}

/** Internal row returned by deep-traversal CTE */
interface DeepTraversalRow extends MemoryRow {
  relation: string;
  depth: number;
  weight: number;
  auto_generated: number;
}

/** Internal row returned by memory_history queries */
interface HistoryRow {
  history_id: number;
  memory_id: string;
  operation: string;
  content: string;
  category: string;
  tags: string;
  metadata: string;
  project: string;
  expires_at: string | null;
  changed_at: string;
  total_count?: number;
}

const DEFAULT_DB_PATH = process.env["ENGRAM_DB_PATH"] ??
  join(homedir(), ".engram", "memories.db");

export class MemoryDatabase {
  private readonly db: Database.Database;
  /** Absolute path to the SQLite file, or ':memory:' for in-memory databases. */
  readonly dbPath: string;
  /** Default project namespace for all operations when not explicitly specified. */
  readonly defaultProject: string;

  // Prepared statements cached at construction time for maximum performance
  private readonly stmtCreate: Statement;
  private readonly stmtGetById: Statement;
  private readonly stmtGetByIds: Statement;
  private readonly stmtUpdate: Statement;
  private readonly stmtDelete: Statement;
  private readonly stmtSnapshot: Statement;
  private readonly stmtTagFreq: Statement;
  private readonly stmtPurgeExpired: Statement;

  // Relations (Ronda 25)
  private readonly stmtLinkUpsert: Statement;
  private readonly stmtUnlink: Statement;
  private readonly stmtGetLink: Statement;
  private readonly stmtUpdateLink: Statement;
  private readonly stmtLinksFrom: Statement;
  private readonly stmtLinksFromRel: Statement;
  private readonly stmtLinksTo: Statement;
  private readonly stmtLinksToRel: Statement;

  // History statements (Ronda 28)
  private readonly stmtHistoryCount: Statement;
  private readonly stmtHistoryRows: Statement;
  private readonly stmtHistoryEntry: Statement;

  // Lazy statement cache: key → compiled statement. Built on first use.
  private readonly stmtCache = new Map<string, Statement>();

  constructor(dbPath: string = DEFAULT_DB_PATH, project?: string) {
    this.dbPath = dbPath;
    this.defaultProject = project ?? process.env["ENGRAM_PROJECT"] ?? "default";
    if (dbPath !== ":memory:") {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.db = new Database(dbPath);
    this.initialize();

    // Pre-compile all fixed statements; RETURNING avoids an extra SELECT round-trip
    this.stmtCreate = this.db.prepare(
      `INSERT INTO memories (id, content, category, tags, metadata, project, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING *`
    );
    this.stmtGetById = this.db.prepare(
      "SELECT * FROM memories WHERE id = ?"
    );
    // json_each allows a pre-compiled IN query with a JSON array parameter
    this.stmtGetByIds = this.db.prepare(
      "SELECT * FROM memories WHERE id IN (SELECT value FROM json_each(?)) ORDER BY created_at DESC, rowid DESC"
    );
    this.stmtUpdate = this.db.prepare(
      `UPDATE memories
       SET content = ?, category = ?, tags = ?, metadata = ?, expires_at = ?, updated_at = datetime('now')
       WHERE id = ?
       RETURNING *`
    );
    this.stmtDelete = this.db.prepare(
      "DELETE FROM memories WHERE id = ?"
    );

    // Window-function query: category count + row rank in a single pass.
    // Scoped to a specific project.
    this.stmtSnapshot = this.db.prepare(
      `SELECT id, content, category, tags, project,
              COUNT(*) OVER (PARTITION BY category) AS cat_count,
              ROW_NUMBER() OVER (PARTITION BY category ORDER BY created_at DESC, rowid DESC) AS rn
       FROM memories
       WHERE project = ? AND (expires_at IS NULL OR expires_at > datetime('now'))`
    );

    this.stmtTagFreq = this.db.prepare(
      "SELECT json_each.value AS tag FROM memories, json_each(memories.tags) WHERE project = ? AND (expires_at IS NULL OR expires_at > datetime('now'))"
    );

    this.stmtPurgeExpired = this.db.prepare(
      "DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at <= datetime('now') RETURNING id"
    );

    // Relations statements
    const LINKS_SEL_FROM = `
      SELECT m.*, l.relation, l.created_at AS link_created_at, l.weight, l.auto_generated
      FROM memory_links l JOIN memories m ON l.to_id = m.id
      WHERE l.from_id = ?`;
    const LINKS_SEL_TO = `
      SELECT m.*, l.relation, l.created_at AS link_created_at, l.weight, l.auto_generated
      FROM memory_links l JOIN memories m ON l.from_id = m.id
      WHERE l.to_id = ?`;

    this.stmtLinkUpsert = this.db.prepare(
      "INSERT OR REPLACE INTO memory_links (from_id, to_id, relation, weight, auto_generated) VALUES (?, ?, ?, ?, ?) RETURNING *"
    );
    this.stmtUnlink = this.db.prepare(
      "DELETE FROM memory_links WHERE from_id = ? AND to_id = ? RETURNING from_id"
    );
    this.stmtGetLink = this.db.prepare(
      "SELECT * FROM memory_links WHERE from_id = ? AND to_id = ?"
    );
    this.stmtUpdateLink = this.db.prepare(
      "UPDATE memory_links SET relation = ? WHERE from_id = ? AND to_id = ? RETURNING *"
    );
    this.stmtLinksFrom    = this.db.prepare(`${LINKS_SEL_FROM} ORDER BY l.created_at DESC`);
    this.stmtLinksFromRel = this.db.prepare(`${LINKS_SEL_FROM} AND l.relation = ? ORDER BY l.created_at DESC`);
    this.stmtLinksTo      = this.db.prepare(`${LINKS_SEL_TO} ORDER BY l.created_at DESC`);
    this.stmtLinksToRel   = this.db.prepare(`${LINKS_SEL_TO} AND l.relation = ? ORDER BY l.created_at DESC`);

    // History statements (Ronda 28)
    this.stmtHistoryCount = this.db.prepare(
      "SELECT COUNT(*) AS cnt FROM memory_history WHERE memory_id = ?"
    );
    this.stmtHistoryRows = this.db.prepare(
      "SELECT * FROM memory_history WHERE memory_id = ? ORDER BY changed_at DESC, history_id DESC LIMIT ? OFFSET ?"
    );
    this.stmtHistoryEntry = this.db.prepare(
      "SELECT * FROM memory_history WHERE history_id = ? AND memory_id = ?"
    );
  }

  /**
   * Get or compile a prepared statement on first use, then cache it.
   * Avoids the combinatorial explosion of pre-compiling every filter combo upfront.
   */
  private getOrPrepare(key: string, sql: string): Statement {
    let stmt = this.stmtCache.get(key);
    if (!stmt) {
      stmt = this.db.prepare(sql);
      this.stmtCache.set(key, stmt);
    }
    return stmt;
  }

  private initialize(): void {
    this.db.pragma("journal_mode = WAL");
    // NORMAL is safe with WAL and significantly faster than the default FULL
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("foreign_keys = ON");
    // 64 MB memory-mapped I/O: reduces syscall overhead on repeated reads
    this.db.pragma("mmap_size = 67108864");
    // 2000 pages × 4 KB = ~8 MB page cache; default is 2000 but explicit is clearer
    this.db.pragma("cache_size = -8000"); // negative = kibibytes
    this.db.exec(SCHEMA_SQL);
    // Schema migration: version 1 introduces the expires_at column.
    // For fresh DBs it is already in CREATE TABLE; for old DBs we ALTER TABLE.
    const dbVersion = this.db.pragma("user_version", { simple: true }) as number;
    if (dbVersion < 1) {
      const cols = (this.db.prepare("PRAGMA table_info(memories)").all() as Array<{ name: string }>).map(c => c.name);
      if (!cols.includes("expires_at")) {
        this.db.exec("ALTER TABLE memories ADD COLUMN expires_at TEXT;");
      }
      // Create the index here (safe for both fresh and migrated DBs)
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_memories_expires_at ON memories(expires_at);");
      this.db.pragma("user_version = 1");
    }
    if (dbVersion < 2) {
      // v2: memory_links table (already in SCHEMA_SQL for fresh DBs; safe to re-run IF NOT EXISTS)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS memory_links (
          from_id    TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
          to_id      TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
          relation   TEXT NOT NULL DEFAULT 'related',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (from_id, to_id)
        );
        CREATE INDEX IF NOT EXISTS idx_memory_links_to ON memory_links(to_id);
      `);
      this.db.pragma("user_version = 2");
    }
    if (dbVersion < 3) {
      // v3: memory_history table + triggers (already in SCHEMA_SQL for fresh DBs)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS memory_history (
          history_id  INTEGER PRIMARY KEY AUTOINCREMENT,
          memory_id   TEXT NOT NULL,
          operation   TEXT NOT NULL CHECK(operation IN ('create', 'update', 'delete')),
          content     TEXT NOT NULL,
          category    TEXT NOT NULL DEFAULT 'general',
          tags        TEXT NOT NULL DEFAULT '[]',
          metadata    TEXT NOT NULL DEFAULT '{}',
          expires_at  TEXT,
          changed_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_memory_history_memory_id
          ON memory_history(memory_id, changed_at DESC);
        CREATE TRIGGER IF NOT EXISTS memories_history_ai AFTER INSERT ON memories BEGIN
          INSERT INTO memory_history (memory_id, operation, content, category, tags, metadata, expires_at)
          VALUES (new.id, 'create', new.content, new.category, new.tags, new.metadata, new.expires_at);
        END;
        CREATE TRIGGER IF NOT EXISTS memories_history_au AFTER UPDATE ON memories BEGIN
          INSERT INTO memory_history (memory_id, operation, content, category, tags, metadata, expires_at)
          VALUES (new.id, 'update', new.content, new.category, new.tags, new.metadata, new.expires_at);
        END;
        CREATE TRIGGER IF NOT EXISTS memories_history_ad AFTER DELETE ON memories BEGIN
          INSERT INTO memory_history (memory_id, operation, content, category, tags, metadata, expires_at)
          VALUES (old.id, 'delete', old.content, old.category, old.tags, old.metadata, old.expires_at);
        END;
      `);
      this.db.pragma("user_version = 3");
    }
    if (dbVersion < 4) {
      // v4: project column for multi-project isolation (Ronda 29)
      const memCols = (this.db.prepare("PRAGMA table_info(memories)").all() as Array<{ name: string }>).map(c => c.name);
      if (!memCols.includes("project")) {
        this.db.exec("ALTER TABLE memories ADD COLUMN project TEXT NOT NULL DEFAULT 'default';");
      }
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project);");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_memories_project_category ON memories(project, category);");

      const histCols = (this.db.prepare("PRAGMA table_info(memory_history)").all() as Array<{ name: string }>).map(c => c.name);
      if (!histCols.includes("project")) {
        this.db.exec("ALTER TABLE memory_history ADD COLUMN project TEXT NOT NULL DEFAULT 'default';");
      }

      // Recreate history triggers to include project column
      this.db.exec(`
        DROP TRIGGER IF EXISTS memories_history_ai;
        DROP TRIGGER IF EXISTS memories_history_au;
        DROP TRIGGER IF EXISTS memories_history_ad;
        CREATE TRIGGER memories_history_ai AFTER INSERT ON memories BEGIN
          INSERT INTO memory_history (memory_id, operation, content, category, tags, metadata, project, expires_at)
          VALUES (new.id, 'create', new.content, new.category, new.tags, new.metadata, new.project, new.expires_at);
        END;
        CREATE TRIGGER memories_history_au AFTER UPDATE ON memories BEGIN
          INSERT INTO memory_history (memory_id, operation, content, category, tags, metadata, project, expires_at)
          VALUES (new.id, 'update', new.content, new.category, new.tags, new.metadata, new.project, new.expires_at);
        END;
        CREATE TRIGGER memories_history_ad AFTER DELETE ON memories BEGIN
          INSERT INTO memory_history (memory_id, operation, content, category, tags, metadata, project, expires_at)
          VALUES (old.id, 'delete', old.content, old.category, old.tags, old.metadata, old.project, old.expires_at);
        END;
      `);
      this.db.pragma("user_version = 4");
    }
    if (dbVersion < 5) {
      // v5: weight and auto_generated columns in memory_links (Fase 2 — Conexiones Inteligentes)
      const linkCols = (this.db.prepare("PRAGMA table_info(memory_links)").all() as Array<{ name: string }>).map(c => c.name);
      if (!linkCols.includes("weight")) {
        this.db.exec("ALTER TABLE memory_links ADD COLUMN weight REAL NOT NULL DEFAULT 1.0;");
      }
      if (!linkCols.includes("auto_generated")) {
        this.db.exec("ALTER TABLE memory_links ADD COLUMN auto_generated INTEGER NOT NULL DEFAULT 0;");
      }
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_memory_links_auto ON memory_links(auto_generated);");
      this.db.pragma("user_version = 5");
    }
  }

  /** Normalize category: trim + lowercase, default "general" */
  private normalizeCategory(category: string | undefined): string {
    return (category ?? "general").trim().toLowerCase() || "general";
  }

  /** Normalize tags: trim each, discard empty strings, deduplicate */
  private normalizeTags(tags: string[] | undefined): string[] {
    if (!tags) return [];
    return [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
  }

  /**
   * Build the FTS5 query string from user input.
   * - "any"  → `"t1"* OR "t2"*`   (at least one term matches)
   * - "all"  → `"t1"* "t2"*`      (all terms must appear, implicit AND)
   * - "near" → `NEAR("t1" "t2", n)` (terms within n tokens of each other)
   *
   * Terms are double-quote–escaped to prevent FTS injection.
   * Prefix `*` is appended for any/all to enable prefix matching.
   * NEAR does not support prefix matching, so `*` is omitted there.
   */
  private buildFtsQuery(query: string, mode: "any" | "all" | "near" = "any", nearDistance = 10): string | null {
    const terms = query.split(/\s+/).filter(Boolean);
    if (terms.length === 0) return null;

    // Escape inner double-quotes to prevent FTS injection
    const sanitized = terms.map((t) => t.replace(/"/g, '""'));

    if (mode === "near") {
      // NEAR("term1" "term2", distance) — no prefix * inside NEAR()
      const inner = sanitized.map((t) => `"${t}"`).join(" ");
      return `NEAR(${inner}, ${nearDistance})`;
    }

    const quoted = sanitized.map((t) => `"${t}"*`);
    return quoted.join(mode === "all" ? " " : " OR ");
  }

  private rowToMemory(row: MemoryRow): Memory {
    return {
      ...row,
      tags: JSON.parse(row.tags) as string[],
      metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    };
  }

  create(input: CreateMemoryInput): Memory {
    const id = randomUUID();
    const content = input.content.trim();
    const category = this.normalizeCategory(input.category);
    const tags = JSON.stringify(this.normalizeTags(input.tags));
    const metadata = JSON.stringify(input.metadata ?? {});
    const project = input.project ?? this.defaultProject;
    const expires_at = input.expires_at ?? null;

    // RETURNING * eliminates the extra getById round-trip
    const row = this.stmtCreate.get(
      id, content, category, tags, metadata, project, expires_at
    ) as MemoryRow;

    const memory = this.rowToMemory(row);

    // Fase 2: auto-link unless explicitly opted out
    if (input.auto_link !== false) {
      try {
        this.autoLink(memory);
      } catch {
        // Auto-link failures must never surface to the caller
      }
    }

    return memory;
  }

  /**
   * Bulk-insert multiple memories in a single SQLite transaction.
   * Significantly faster than calling create() in a loop for large batches.
   * Skips empty inputs arrays without touching the database.
   */
  createBatch(inputs: CreateMemoryInput[]): Memory[] {
    if (inputs.length === 0) return [];
    const insertAll = this.db.transaction((items: CreateMemoryInput[]) =>
      items.map((input) => this.create(input))
    );
    return insertAll(inputs);
  }

  getById(id: string): Memory | null {
    const row = this.stmtGetById.get(id) as MemoryRow | undefined;
    return row ? this.rowToMemory(row) : null;
  }

  /**
   * Fetch multiple memories by id in a single query.
   * Uses `json_each(?)` to pass all ids as a JSON array — avoids N round-trips.
   * Preserves recency order (created_at DESC, rowid DESC).
   * ids not found are simply absent from the result (no error).
   */
  getByIds(ids: string[]): Memory[] {
    if (ids.length === 0) return [];
    const rows = this.stmtGetByIds.all(JSON.stringify(ids)) as MemoryRow[];
    return rows.map((row) => this.rowToMemory(row));
  }

  update(id: string, input: UpdateMemoryInput): Memory | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const content = (input.content ?? existing.content).trim();
    const category = input.category !== undefined
      ? this.normalizeCategory(input.category)
      : existing.category;
    const tags = JSON.stringify(
      input.tags !== undefined ? this.normalizeTags(input.tags) : existing.tags
    );
    const metadata = JSON.stringify(input.metadata ?? existing.metadata);
    // expires_at: undefined = keep existing, null = clear, string = set new
    const expires_at = input.expires_at !== undefined
      ? (input.expires_at ?? null)
      : (existing.expires_at ?? null);

    // RETURNING * eliminates the extra getById round-trip after the update
    const row = this.stmtUpdate.get(
      content, category, tags, metadata, expires_at, id
    ) as MemoryRow;

    return this.rowToMemory(row);
  }

  /**
   * Bulk-update memories in a single SQLite transaction.
   * Returns successfully updated memories and ids that were not found.
   * Reuses update() internally — full normalization + merge of missing fields.
   */
  updateBatch(updates: BatchUpdateItem[]): { updated: Memory[]; notFound: string[] } {
    if (updates.length === 0) return { updated: [], notFound: [] };
    const updateAll = this.db.transaction((items: Array<{ id: string } & UpdateMemoryInput>) => {
      const updated: Memory[] = [];
      const notFound: string[] = [];
      for (const { id, ...input } of items) {
        const result = this.update(id, input);
        if (result) {
          updated.push(result);
        } else {
          notFound.push(id);
        }
      }
      return { updated, notFound };
    });
    return updateAll(updates);
  }

  delete(id: string): boolean {
    const result = this.stmtDelete.run(id);
    return result.changes > 0;
  }

  /**
   * Bulk-delete memories by id in a single SQLite transaction.
   * Returns how many were actually deleted and which ids were not found.
   */
  deleteBatch(ids: string[]): { deleted: number; notFound: string[] } {
    if (ids.length === 0) return { deleted: 0, notFound: [] };
    const deleteAll = this.db.transaction((idList: string[]) => {
      const notFound: string[] = [];
      let deleted = 0;
      for (const id of idList) {
        const result = this.stmtDelete.run(id);
        if (result.changes > 0) {
          deleted++;
        } else {
          notFound.push(id);
        }
      }
      return { deleted, notFound };
    });
    return deleteAll(ids);
  }

  /** @deprecated Use searchWithTotal() instead — delegates to it internally. */
  search(input: SearchMemoriesInput): Memory[] {
    return this.searchWithTotal(input).memories;
  }

  searchWithTotal(input: SearchMemoriesInput): { memories: Memory[]; total: number } {
    const { query, tag, limit = 10, mode = "any", near_distance = 10 } = input;
    const category = input.category ? input.category.trim().toLowerCase() : undefined;
    const project = input.project ?? this.defaultProject;

    const ftsQuery = this.buildFtsQuery(query, mode, near_distance);
    if (!ftsQuery) return { memories: [], total: 0 };

    const offset = input.offset ?? 0;
    const mk = input.metadata_key;
    const mv = input.metadata_value;
    const hasMeta = mk !== undefined && mv !== undefined;
    const ca = input.created_after ?? null;
    const cb = input.created_before ?? null;
    const ua = input.updated_after ?? null;
    const ub = input.updated_before ?? null;
    const sortKey = input.sort_by ?? "";

    const EXPIRES_ALIVE_M = "(m.expires_at IS NULL OR m.expires_at > datetime('now'))";
    const FTS_TAG     = "EXISTS (SELECT 1 FROM json_each(m.tags) WHERE json_each.value = ?)";
    const META_COND_M = "json_extract(m.metadata, '$.' || ?) = ?";
    const DATE_COND_M = "(? IS NULL OR m.created_at >= ?) AND (? IS NULL OR m.created_at <= ?) AND (? IS NULL OR m.updated_at >= ?) AND (? IS NULL OR m.updated_at <= ?)";
    const SEARCH_SORT_ORDERS: Record<string, string> = {
      "":               "ORDER BY rank",
      "created_at_desc": "ORDER BY m.created_at DESC, m.rowid DESC",
      "created_at_asc":  "ORDER BY m.created_at ASC,  m.rowid ASC",
      "updated_at_desc": "ORDER BY m.updated_at DESC, m.rowid DESC",
    };

    const fk = `search_${category ? "c" : ""}${tag ? "t" : ""}${hasMeta ? "m" : ""}${sortKey ? `_${sortKey}` : ""}`;

    const stmt = this.getOrPrepare(fk, (() => {
      const FTS_WT = `SELECT m.*, COUNT(*) OVER () AS total_count FROM memories m JOIN memories_fts fts ON m.rowid = fts.rowid WHERE memories_fts MATCH ? AND m.project = ? AND ${EXPIRES_ALIVE_M}`;
      const conds: string[] = [];
      if (category) conds.push("m.category = ?");
      if (tag) conds.push(FTS_TAG);
      if (hasMeta) conds.push(META_COND_M);
      conds.push(DATE_COND_M);
      const sorder = SEARCH_SORT_ORDERS[sortKey] ?? "ORDER BY rank";
      return `${FTS_WT}${conds.length ? " AND " + conds.join(" AND ") : ""} ${sorder} LIMIT ? OFFSET ?`;
    })());

    const params: unknown[] = [ftsQuery, project];
    if (category) params.push(category);
    if (tag) params.push(tag);
    if (hasMeta) params.push(mk, mv);
    params.push(ca, ca, cb, cb, ua, ua, ub, ub, limit, offset);

    type RowWithTotal = MemoryRow & { total_count: number };
    const rows = stmt.all(...params) as RowWithTotal[];
    const total = rows.length > 0 ? rows[0].total_count : 0;
    const memories = rows.map(({ total_count: _tc, ...memRow }) => this.rowToMemory(memRow as MemoryRow));
    return { memories, total };
  }

  /** @deprecated Use listWithTotal() instead — delegates to it internally. */
  count(input: ListMemoriesInput = {}): number {
    return this.listWithTotal({ ...input, limit: 1, offset: 0 }).total;
  }

  /** @deprecated Use listWithTotal() instead — delegates to it internally. */
  list(input: ListMemoriesInput = {}): Memory[] {
    return this.listWithTotal(input).memories;
  }

  /**
   * Returns a compact session-context snapshot using at most **2 SQL queries** regardless
   * of how many categories exist.
   *
   * Query 1 — window-function scan: retrieves every row annotated with
   *   `cat_count` (total per category) and `rn` (recency rank within category).
   *   Rows where `rn <= recentPerCategory` are selected as recent items;
   *   `cat_count` provides the total for each category — all in one pass.
   *
   * Query 2 — tag frequency (only if `includeTagsIndex = true`, default):
   *   json_each flattens tag arrays into individual rows counted in JS.
   *
   * @param recentPerCategory How many recent memories to surface per category (default 3)
   * @param contentPreviewLen If set, truncates content in recent items to this many characters
   * @param includeTagsIndex Whether to compute the tags frequency index (default true)
   */
  getContextSnapshot(
    recentPerCategory = 3,
    contentPreviewLen?: number,
    includeTagsIndex = true,
    project?: string,
  ): ContextSnapshot {
    const proj = project ?? this.defaultProject;
    type SnapshotRow = {
      id: string;
      content: string;
      category: string;
      tags: string;
      project: string;
      cat_count: number;
      rn: number;
    };

    // Single pass over the table: window functions compute count + rank atomically
    const rows = this.stmtSnapshot.all(proj) as SnapshotRow[];

    const by_category: ContextSnapshot["by_category"] = {};
    let total = 0;
    const seenCategories = new Set<string>();

    for (const row of rows) {
      if (!seenCategories.has(row.category)) {
        by_category[row.category] = { count: row.cat_count, recent: [] };
        total += row.cat_count;
        seenCategories.add(row.category);
      }
      if (row.rn <= recentPerCategory) {
        const content = contentPreviewLen != null
          ? row.content.slice(0, contentPreviewLen)
          : row.content;
        by_category[row.category].recent.push({
          id: row.id,
          content,
          category: row.category,
          tags: JSON.parse(row.tags) as string[],
          project: row.project,
        } satisfies MemorySlim);
      }
    }

    // Tag frequency index: flatten all tag arrays via json_each (skipped if not needed)
    const tags_index: Record<string, number> = {};
    if (includeTagsIndex) {
      const tagRows = this.stmtTagFreq.all(proj) as { tag: string }[];
      for (const { tag } of tagRows) {
        tags_index[tag] = (tags_index[tag] ?? 0) + 1;
      }
    }

    return { total, by_category, tags_index };
  }

  /**
   * List memories and return the total filtered count in a single query.
   * Uses `COUNT(*) OVER ()` window function — eliminates the separate `count()` call.
   * Supports sort_by, date range filters (created_after, updated_after), and metadata filtering.
   */
  listWithTotal(input: ListMemoriesInput = {}): { memories: Memory[]; total: number } {
    const { tag, limit = 10, offset = 0 } = input;
    const category = input.category ? input.category.trim().toLowerCase() : undefined;
    const project = input.project ?? this.defaultProject;
    const mk = input.metadata_key;
    const mv = input.metadata_value;
    const hasMeta = mk !== undefined && mv !== undefined;
    const sortBy: SortBy = input.sort_by ?? "created_at_desc";
    const ca = input.created_after ?? null;
    const cb = input.created_before ?? null;
    const ua = input.updated_after ?? null;
    const ub = input.updated_before ?? null;

    const EXPIRES_ALIVE = "(expires_at IS NULL OR expires_at > datetime('now'))";
    const TAG_EXISTS    = "EXISTS (SELECT 1 FROM json_each(tags) WHERE json_each.value = ?)";
    const META_COND     = "json_extract(metadata, '$.' || ?) = ?";
    const DATE_COND     = "(? IS NULL OR created_at >= ?) AND (? IS NULL OR created_at <= ?) AND (? IS NULL OR updated_at >= ?) AND (? IS NULL OR updated_at <= ?)";
    const SORT_ORDERS: Record<string, string> = {
      created_at_desc: "ORDER BY created_at DESC, rowid DESC",
      created_at_asc:  "ORDER BY created_at ASC,  rowid ASC",
      updated_at_desc: "ORDER BY updated_at DESC, rowid DESC",
    };

    const fk = `list_${category ? "c" : ""}${tag ? "t" : ""}${hasMeta ? "m" : ""}_${sortBy}`;

    const stmt = this.getOrPrepare(fk, (() => {
      const WT_SEL = "SELECT *, COUNT(*) OVER () AS total_count";
      const conds: string[] = [EXPIRES_ALIVE, "project = ?"];
      if (category) conds.push("category = ?");
      if (tag) conds.push(TAG_EXISTS);
      if (hasMeta) conds.push(META_COND);
      conds.push(DATE_COND);
      const order = SORT_ORDERS[sortBy] ?? SORT_ORDERS.created_at_desc;
      return `${WT_SEL} FROM memories WHERE ${conds.join(" AND ")} ${order} LIMIT ? OFFSET ?`;
    })());

    const params: unknown[] = [project];
    if (category) params.push(category);
    if (tag) params.push(tag);
    if (hasMeta) params.push(mk, mv);
    params.push(ca, ca, cb, cb, ua, ua, ub, ub, limit, offset);

    type RowWithTotal = MemoryRow & { total_count: number };
    const rows = stmt.all(...params) as RowWithTotal[];
    const total = rows.length > 0 ? rows[0].total_count : 0;
    const memories = rows.map(({ total_count: _tc, ...memRow }) => this.rowToMemory(memRow as MemoryRow));
    return { memories, total };
  }

  /**
   * Run database maintenance: integrity check + WAL checkpoint.
   * Returns a structured report with integrity status and checkpoint stats.
   */
  maintenance(checkpointMode: "PASSIVE" | "FULL" | "RESTART" | "TRUNCATE" = "PASSIVE"): {
    integrity_ok: boolean;
    integrity_errors: string[];
    wal_checkpoint: { busy: number; log: number; checkpointed: number };
  } {
    // integrity_check returns [{integrity_check: "ok"}] on success, or error rows
    const integrityRows = this.db.pragma("integrity_check") as Array<{ integrity_check: string }>;
    const integrity_ok = integrityRows.length === 1 && integrityRows[0].integrity_check === "ok";
    const integrity_errors = integrity_ok ? [] : integrityRows.map((r) => r.integrity_check);

    // wal_checkpoint returns [{busy, log, checkpointed}]
    const walRows = this.db.pragma(`wal_checkpoint(${checkpointMode})`) as Array<{
      busy: number;
      log: number;
      checkpointed: number;
    }>;
    const wal_checkpoint = walRows[0] ?? { busy: 0, log: 0, checkpointed: 0 };

    return { integrity_ok, integrity_errors, wal_checkpoint };
  }

  /**
   * Physically remove all memories whose expires_at is in the past.
   * Returns the count and list of purged ids.
   */
  purgeExpired(): { purged: number; ids: string[] } {
    const rows = this.stmtPurgeExpired.all() as Array<{ id: string }>;
    return { purged: rows.length, ids: rows.map(r => r.id) };
  }

  /**
   * Export all memories matching optional filters as a raw array.
   * Reuses listWithTotal with a high ceiling — no extra SQL needed.
   * Default limit 10_000 to avoid unbounded memory; callers can lower it.
   */
  exportAll(input: ExportMemoriesInput = {}): Memory[] {
    const { category, tag, project } = input;
    const limit = input.limit ?? 10_000;
    return this.listWithTotal({ category, tag, project, limit, offset: 0, sort_by: "created_at_asc" }).memories;
  }

  /**
   * Bulk-import memories in a single transaction.
   * - mode='insert': always creates new memories (ignores provided id, generates fresh UUID).
   * - mode='upsert': if id is provided AND already exists, updates it; otherwise inserts.
   * Returns count of imported/updated rows, skipped (invalid content), and resulting ids.
   */
  importBatch(rows: ImportMemoryRow[], mode: ImportMode = "insert"): ImportResult {
    if (rows.length === 0) return { imported: 0, skipped: 0, ids: [] };

    const run = this.db.transaction((items: ImportMemoryRow[]) => {
      const ids: string[] = [];
      let skipped = 0;

      for (const row of items) {
        // Skip rows with empty or missing content
        if (!row.content || !row.content.trim()) { skipped++; continue; }

        if (mode === "upsert" && row.id) {
          const existing = this.getById(row.id);
          if (existing) {
            // Update existing record — merge provided fields over existing
            const updated = this.update(row.id, {
              content: row.content,
              category: row.category,
              tags: row.tags,
              metadata: row.metadata,
            });
            if (updated) { ids.push(updated.id); continue; }
          }
        }
        // Insert as new memory (fresh UUID regardless of provided id in insert mode)
        const created = this.create({
          content: row.content,
          category: row.category,
          tags: row.tags,
          metadata: row.metadata,
          project: row.project,
        });
        ids.push(created.id);
      }

      return { imported: ids.length, skipped, ids };
    });

    return run(rows);
  }

  /**
   * Compute aggregate statistics about the memories database.
   * Uses 3 SQL queries: category counts, tag frequency, and scalar aggregates.
   */
  getStats(project?: string): StatsResult {
    const proj = project ?? this.defaultProject;

    // --- Category counts ---
    const catRows = this.db.prepare(
      "SELECT category, COUNT(*) AS cnt FROM memories WHERE project = ? GROUP BY category ORDER BY cnt DESC"
    ).all(proj) as Array<{ category: string; cnt: number }>;

    const by_category: Record<string, number> = {};
    let total = 0;
    for (const { category, cnt } of catRows) {
      by_category[category] = cnt;
      total += cnt;
    }

    // --- Tag frequency (top 20) ---
    const tagRows = this.db.prepare(
      `SELECT json_each.value AS tag, COUNT(*) AS cnt
       FROM memories, json_each(memories.tags)
       WHERE project = ?
       GROUP BY tag ORDER BY cnt DESC LIMIT 20`
    ).all(proj) as Array<{ tag: string; cnt: number }>;
    const top_tags = tagRows.map(({ tag, cnt }) => ({ tag, count: cnt }));

    // --- Scalar aggregates ---
    const agg = this.db.prepare(
      `SELECT
         AVG(LENGTH(content))       AS avg_len,
         SUM(CASE WHEN tags = '[]'     THEN 1 ELSE 0 END) AS no_tags,
         SUM(CASE WHEN metadata = '{}' THEN 1 ELSE 0 END) AS no_meta
       FROM memories WHERE project = ?`
    ).get(proj) as { avg_len: number | null; no_tags: number; no_meta: number } | undefined;

    const avg_content_len = agg?.avg_len != null ? Math.round(agg.avg_len) : 0;
    const memories_without_tags     = agg?.no_tags ?? 0;
    const memories_without_metadata = agg?.no_meta ?? 0;

    // --- Oldest / newest ---
    const oldestRow = this.db.prepare("SELECT * FROM memories WHERE project = ? ORDER BY created_at ASC,  rowid ASC  LIMIT 1").get(proj) as MemoryRow | undefined;
    const newestRow = this.db.prepare("SELECT * FROM memories WHERE project = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(proj) as MemoryRow | undefined;

    return {
      total,
      by_category,
      top_tags,
      oldest: oldestRow ? this.rowToMemory(oldestRow) : null,
      newest: newestRow ? this.rowToMemory(newestRow) : null,
      avg_content_len,
      memories_without_tags,
      memories_without_metadata,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Relations API (Ronda 25)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Create or update a directional link between two memories.
   * Upsert semantics: if the pair (from_id, to_id) already exists the relation
   * is replaced with the new value.
   */
  linkMemories(input: LinkMemoriesInput): MemoryLink {
    const { from_id, to_id, relation = "related", weight = 1.0, auto_generated = 0 } = input;
    const row = this.stmtLinkUpsert.get(from_id, to_id, relation, weight, auto_generated) as MemoryLink;
    return row;
  }

  /**
   * Retrieve a single link by its (from_id, to_id) pair.
   * Returns null if no such link exists.
   */
  getLink(from_id: string, to_id: string): MemoryLink | null {
    const row = this.stmtGetLink.get(from_id, to_id) as MemoryLink | undefined;
    return row ?? null;
  }

  /**
   * Update the relation type of an existing link.
   * Returns the updated MemoryLink, or null if the link does not exist.
   */
  updateLink(from_id: string, to_id: string, relation: RelationType): MemoryLink | null {
    const row = this.stmtUpdateLink.get(relation, from_id, to_id) as MemoryLink | undefined;
    return row ?? null;
  }

  /**
   * Remove a link between two memories.
   * Returns true if a link was found and removed, false if it did not exist.
   */
  unlinkMemories(from_id: string, to_id: string): boolean {
    const row = this.stmtUnlink.get(from_id, to_id);
    return row !== undefined;
  }

  /**
   * Retrieve memories linked to/from the given id.
   * direction="from"  → memories that `id` points to (outgoing)
   * direction="to"    → memories that point to `id`  (incoming)
   * direction="both"  → all linked memories
   * Optionally filtered by relation type.
   */
  getRelated(input: GetRelatedInput): RelatedMemory[] {
    const { id, relation, direction = "both" } = input;
    const results: RelatedMemory[] = [];

    if (direction === "from" || direction === "both") {
      const stmt = relation ? this.stmtLinksFromRel : this.stmtLinksFrom;
      const params: unknown[] = relation ? [id, relation] : [id];
      const rows = stmt.all(...params) as LinkQueryRow[];
      for (const row of rows) {
        results.push({
          memory: this.rowToMemory(row),
          relation: row.relation as RelationType,
          direction: "from",
          linked_at: row.link_created_at,
          weight: row.weight ?? 1.0,
          auto_generated: Boolean(row.auto_generated),
        });
      }
    }

    if (direction === "to" || direction === "both") {
      const stmt = relation ? this.stmtLinksToRel : this.stmtLinksTo;
      const params: unknown[] = relation ? [id, relation] : [id];
      const rows = stmt.all(...params) as LinkQueryRow[];
      for (const row of rows) {
        results.push({
          memory: this.rowToMemory(row),
          relation: row.relation as RelationType,
          direction: "to",
          linked_at: row.link_created_at,
          weight: row.weight ?? 1.0,
          auto_generated: Boolean(row.auto_generated),
        });
      }
    }

    return results;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Fase 2: Auto-link engine
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Infer and create links for a newly created memory using 3 heuristic strategies.
   * All errors are silently swallowed so they never affect the caller.
   *
   * Strategy A) Shared tags (≥2 in common) → "related", weight = shared_count × 0.3 (capped at 1.0)
   * Strategy B) FTS5 content similarity (top-5 terms, rank < -0.5) → "references", normalised weight
   * Strategy C) Temporal proximity ± 1 hour + same category → "related", weight 0.4
   */
  private autoLink(memory: Memory): void {
    const { id, project, tags, category, content, created_at } = memory;
    const ALIVE = "(m.expires_at IS NULL OR m.expires_at > datetime('now'))";

    // ── Strategy A: shared tags ──────────────────────────────────────────────
    if (tags.length >= 2) {
      const rowsA = this.getOrPrepare("autolink_tags", `
        SELECT m.id, COUNT(*) AS shared_count
        FROM memories m, json_each(m.tags) je
        WHERE m.id != ? AND m.project = ? AND ${ALIVE}
          AND je.value IN (SELECT value FROM json_each(?))
        GROUP BY m.id
        HAVING COUNT(*) >= 2
        ORDER BY shared_count DESC
        LIMIT 10
      `).all(id, project, JSON.stringify(tags)) as Array<{ id: string; shared_count: number }>;

      for (const r of rowsA) {
        const existing = this.stmtGetLink.get(id, r.id);
        if (!existing) {
          const weight = Math.min(1.0, r.shared_count * 0.3);
          this.stmtLinkUpsert.run(id, r.id, "related", weight, 1);
        }
      }
    }

    // ── Strategy B: FTS5 content similarity ─────────────────────────────────
    const terms = content.split(/\s+/).filter(Boolean).slice(0, 5);
    if (terms.length >= 2) {
      const ftsQuery = this.buildFtsQuery(terms.join(" "), "any");
      if (ftsQuery) {
        const rowsB = this.getOrPrepare("autolink_fts", `
          SELECT m.id, ft.rank
          FROM memories_fts ft JOIN memories m ON ft.rowid = m.rowid
          WHERE memories_fts MATCH ? AND m.id != ? AND m.project = ?
            AND ${ALIVE}
          ORDER BY ft.rank
          LIMIT 5
        `).all(ftsQuery, id, project) as Array<{ id: string; rank: number }>;

        for (const r of rowsB) {
          if (r.rank < -0.5) {
            const existing = this.stmtGetLink.get(id, r.id);
            if (!existing) {
              // Normalise FTS rank (negative, more negative = more relevant) to [0.1, 0.9]
              const weight = Math.min(0.9, Math.max(0.1, Math.abs(r.rank) / 10));
              this.stmtLinkUpsert.run(id, r.id, "references", weight, 1);
            }
          }
        }
      }
    }

    // ── Strategy C: temporal proximity ± 1 h + same category ────────────────
    const rowsC = this.getOrPrepare("autolink_temporal", `
      SELECT id FROM memories
      WHERE id != ? AND project = ? AND category = ?
        AND created_at BETWEEN datetime(?, '-1 hour') AND datetime(?, '+1 hour')
        AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY ABS(julianday(created_at) - julianday(?))
      LIMIT 5
    `).all(id, project, category, created_at, created_at, created_at) as Array<{ id: string }>;

    for (const r of rowsC) {
      const existing = this.stmtGetLink.get(id, r.id);
      if (!existing) {
        this.stmtLinkUpsert.run(id, r.id, "related", 0.4, 1);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Fase 2: Multi-hop traversal
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Traverse the memory graph up to max_depth hops following outgoing links.
   * Uses a recursive CTE with cycle detection via a path string.
   * Returns all reachable memories across all hops, sorted by depth ascending.
   */
  getRelatedDeep(input: GetRelatedDeepInput): GetRelatedDeepResult {
    const { id, max_depth = 3, relation, project, limit = 50 } = input;
    const proj = project ?? this.defaultProject;
    const depth = Math.min(5, Math.max(1, max_depth));

    const relationFilter = relation ? "AND ml.relation = ?" : "";

    const sql = `
      WITH RECURSIVE traverse(to_id, relation, weight, auto_generated, depth, path) AS (
        -- Anchor: direct outgoing links from the start node.
        -- Path includes the start ID so cycle detection can block loops back to it.
        SELECT ml.to_id,
               ml.relation,
               COALESCE(ml.weight, 1.0),
               COALESCE(ml.auto_generated, 0),
               1,
               ',' || ml.from_id || ',' || ml.to_id || ','
        FROM memory_links ml
        WHERE ml.from_id = ?
          ${relationFilter}

        UNION ALL

        -- Recursive: follow outgoing links from current frontier
        SELECT ml.to_id,
               ml.relation,
               COALESCE(ml.weight, 1.0),
               COALESCE(ml.auto_generated, 0),
               t.depth + 1,
               t.path || ml.to_id || ','
        FROM memory_links ml
        JOIN traverse t ON ml.from_id = t.to_id
        WHERE t.depth < ?
          AND t.path NOT LIKE '%,' || ml.to_id || ',%'
          ${relationFilter}
      )
      SELECT m.*,
             t2.relation,
             t2.min_depth AS depth,
             t2.weight,
             t2.auto_generated
      FROM (
        SELECT to_id,
               relation,
               MIN(depth) AS min_depth,
               weight,
               auto_generated
        FROM traverse
        GROUP BY to_id
      ) t2
      JOIN memories m ON m.id = t2.to_id
      WHERE m.project = ?
      ORDER BY t2.min_depth ASC
      LIMIT ?
    `;

    const baseParams: unknown[] = [id];
    if (relation) baseParams.push(relation);
    baseParams.push(depth);
    if (relation) baseParams.push(relation);
    baseParams.push(proj, limit);

    const rows = this.db.prepare(sql).all(...baseParams) as DeepTraversalRow[];

    const results: RelatedMemoryDeep[] = rows.map((row) => ({
      memory: this.rowToMemory(row),
      relation: row.relation as RelationType,
      depth: row.depth,
      weight: row.weight ?? 1.0,
      auto_generated: Boolean(row.auto_generated),
    }));

    return { total: results.length, results };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Fase 2: Link suggestions
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Suggest potential links without creating them.
   * If `id` is provided, analyse that specific memory.
   * Otherwise, analyse up to 5 orphan memories in the project.
   */
  suggestLinks(input: SuggestLinksInput): SuggestLinksResult {
    const { id, project, limit = 20 } = input;
    const proj = project ?? this.defaultProject;
    const ALIVE = "(expires_at IS NULL OR expires_at > datetime('now'))";

    // Determine which memories to analyse
    let targets: Memory[];
    if (id) {
      const m = this.getById(id);
      targets = m ? [m] : [];
    } else {
      // Orphan memories: no links in either direction
      const rows = this.db.prepare(`
        SELECT m.* FROM memories m
        WHERE m.project = ? AND ${ALIVE}
          AND NOT EXISTS (
            SELECT 1 FROM memory_links
            WHERE from_id = m.id OR to_id = m.id
          )
        ORDER BY m.created_at DESC
        LIMIT 5
      `).all(proj) as MemoryRow[];
      targets = rows.map((r) => this.rowToMemory(r));
    }

    const suggestions: SuggestLink[] = [];
    const seen = new Set<string>();

    for (const memory of targets) {
      // Existing link partners (skip re-suggesting them)
      const existingIds = new Set<string>();
      const existingLinks = this.db.prepare(
        "SELECT to_id FROM memory_links WHERE from_id = ? UNION SELECT from_id FROM memory_links WHERE to_id = ?"
      ).all(memory.id, memory.id) as Array<{ to_id?: string; from_id?: string }>;
      for (const l of existingLinks) {
        const partner = l.to_id ?? l.from_id;
        if (partner) existingIds.add(partner);
      }

      // Strategy A: shared tags
      if (memory.tags.length >= 1) {
        const rowsA = this.db.prepare(`
          SELECT m.id, m.content, m.category, m.tags, COUNT(*) AS shared_count
          FROM memories m, json_each(m.tags) je
          WHERE m.id != ? AND m.project = ? AND ${ALIVE}
            AND je.value IN (SELECT value FROM json_each(?))
          GROUP BY m.id
          HAVING COUNT(*) >= 1
          ORDER BY shared_count DESC
          LIMIT 10
        `).all(memory.id, proj, JSON.stringify(memory.tags)) as Array<{ id: string; content: string; category: string; tags: string; shared_count: number }>;

        for (const r of rowsA) {
          const key = `${memory.id}→${r.id}`;
          if (!existingIds.has(r.id) && !seen.has(key)) {
            seen.add(key);
            const weight = Math.min(1.0, r.shared_count * 0.3);
            suggestions.push({
              from_id: memory.id,
              to_id: r.id,
              to_content_preview: r.content.slice(0, 80),
              to_category: r.category,
              to_tags: JSON.parse(r.tags) as string[],
              suggested_relation: "related",
              weight,
              reason: "shared_tags" as SuggestLinkReason,
            });
          }
        }
      }

      // Strategy B: FTS5 content similarity
      const terms = memory.content.split(/\s+/).filter(Boolean).slice(0, 5);
      if (terms.length >= 2) {
        const ftsQuery = this.buildFtsQuery(terms.join(" "), "any");
        if (ftsQuery) {
          const rowsB = this.db.prepare(`
            SELECT m.id, m.content, m.category, m.tags, ft.rank
            FROM memories_fts ft JOIN memories m ON ft.rowid = m.rowid
            WHERE memories_fts MATCH ? AND m.id != ? AND m.project = ? AND ${ALIVE}
            ORDER BY ft.rank
            LIMIT 5
          `).all(ftsQuery, memory.id, proj) as Array<{ id: string; content: string; category: string; tags: string; rank: number }>;

          for (const r of rowsB) {
            if (r.rank < -0.5) {
              const key = `${memory.id}→${r.id}`;
              if (!existingIds.has(r.id) && !seen.has(key)) {
                seen.add(key);
                const weight = Math.min(0.9, Math.max(0.1, Math.abs(r.rank) / 10));
                suggestions.push({
                  from_id: memory.id,
                  to_id: r.id,
                  to_content_preview: r.content.slice(0, 80),
                  to_category: r.category,
                  to_tags: JSON.parse(r.tags) as string[],
                  suggested_relation: "references",
                  weight,
                  reason: "content_similarity" as SuggestLinkReason,
                });
              }
            }
          }
        }
      }

      // Strategy C: temporal proximity ± 1 h, same category
      const rowsC = this.db.prepare(`
        SELECT m.id, m.content, m.category, m.tags
        FROM memories m
        WHERE m.id != ? AND m.project = ? AND m.category = ?
          AND m.created_at BETWEEN datetime(?, '-1 hour') AND datetime(?, '+1 hour')
          AND ${ALIVE}
        ORDER BY ABS(julianday(m.created_at) - julianday(?))
        LIMIT 5
      `).all(memory.id, proj, memory.category, memory.created_at, memory.created_at, memory.created_at) as Array<{ id: string; content: string; category: string; tags: string }>;

      for (const r of rowsC) {
        const key = `${memory.id}→${r.id}`;
        if (!existingIds.has(r.id) && !seen.has(key)) {
          seen.add(key);
          suggestions.push({
            from_id: memory.id,
            to_id: r.id,
            to_content_preview: r.content.slice(0, 80),
            to_category: r.category,
            to_tags: JSON.parse(r.tags) as string[],
            suggested_relation: "related",
            weight: 0.4,
            reason: "temporal_proximity" as SuggestLinkReason,
          });
        }
      }
    }

    return {
      analysed: targets.length,
      suggestions: suggestions.slice(0, limit),
    };
  }

  close(): void {
    // Optimize the FTS5 index and SQLite internals before closing
    this.db.pragma("optimize");
    this.db.close();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Tag utilities (Ronda 26)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Rename a tag across all memories that carry it.
   * Uses json_group_array(DISTINCT ...) to eliminate duplicates when a memory
   * already has the new tag. FTS is updated automatically via the memories_au trigger.
   * Returns the number of updated memories and the old/new tag names.
   */
  renameTag(oldTag: string, newTag: string, project?: string): RenameTagResult {
    const proj = project ?? this.defaultProject;
    const rows = this.db.prepare(
      `UPDATE memories
       SET tags = (
         SELECT json_group_array(DISTINCT CASE WHEN value = ? THEN ? ELSE value END)
         FROM json_each(memories.tags)
       ),
       updated_at = datetime('now')
       WHERE project = ? AND EXISTS (SELECT 1 FROM json_each(memories.tags) WHERE value = ?)
       RETURNING id`
    ).all(oldTag, newTag, proj, oldTag) as Array<{ id: string }>;

    return { updated: rows.length, old_tag: oldTag, new_tag: newTag };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Links listing (Ronda 26)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * List edges in the memory_links graph with optional filters.
   * Supports filtering by from_id, to_id and/or relation type, plus pagination.
   */
  listLinks(input: ListLinksInput): ListLinksResult {
    const { from_id, to_id, relation, limit = 50, offset = 0 } = input;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (from_id)  { conditions.push("from_id = ?");  params.push(from_id); }
    if (to_id)    { conditions.push("to_id = ?");    params.push(to_id); }
    if (relation) { conditions.push("relation = ?"); params.push(relation); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countRow = this.db.prepare(
      `SELECT COUNT(*) AS cnt FROM memory_links ${where}`
    ).get(...params) as { cnt: number };

    const linkParams = [...params, limit, offset];
    const rows = this.db.prepare(
      `SELECT * FROM memory_links ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...linkParams) as MemoryLink[];

    return { total: countRow.cnt, offset, limit, links: rows };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // History API (Ronda 28)
  // ──────────────────────────────────────────────────────────────────────────

  /** Convert a raw history DB row → typed MemoryHistoryEntry */
  private rowToHistoryEntry(row: HistoryRow): MemoryHistoryEntry {
    return {
      history_id: row.history_id,
      memory_id: row.memory_id,
      operation: row.operation as MemoryHistoryEntry["operation"],
      content: row.content,
      category: row.category,
      tags: JSON.parse(row.tags) as string[],
      metadata: JSON.parse(row.metadata) as Record<string, unknown>,
      project: row.project,
      expires_at: row.expires_at,
      changed_at: row.changed_at,
    };
  }

  /**
   * Retrieve the change history for a specific memory, newest first.
   */
  getHistory(input: GetHistoryInput): GetHistoryResult {
    const { memory_id, limit = 50, offset = 0 } = input;
    const countRow = this.stmtHistoryCount.get(memory_id) as { cnt: number };
    const rows = this.stmtHistoryRows.all(memory_id, limit, offset) as HistoryRow[];
    return {
      total: countRow.cnt,
      offset,
      limit,
      entries: rows.map((r) => this.rowToHistoryEntry(r)),
    };
  }

  /**
   * Restore a memory to a previous state stored in memory_history.
   * Returns the restored Memory, or null if the history entry or memory does not exist.
   * The restore itself is tracked as a new 'update' history entry.
   */
  restoreMemory(input: RestoreMemoryInput): Memory | null {
    const { memory_id, history_id } = input;

    // Verify the memory still exists
    const current = this.stmtGetById.get(memory_id) as MemoryRow | undefined;
    if (!current) return null;

    // Find the history entry
    const histRow = this.stmtHistoryEntry.get(history_id, memory_id) as HistoryRow | undefined;
    if (!histRow) return null;

    // Apply the stored snapshot — the au trigger will log an 'update' entry automatically
    const updated = this.stmtUpdate.get(
      histRow.content,
      histRow.category,
      histRow.tags,
      histRow.metadata,
      histRow.expires_at,
      memory_id
    ) as MemoryRow;

    return this.rowToMemory(updated);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Graph API (Ronda 28)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Build the memory graph.
   * include_orphans=true → also include memories with no links.
   * relation → restrict edges (and thus nodes) to a specific relation type.
   */
  getGraph(input: GetGraphInput = {}): GraphResult {
    const { include_orphans = false, relation, project } = input;
    const proj = project ?? this.defaultProject;

    // Fetch edges scoped to project (only edges where both memories belong to the project)
    const edgeRows = relation
      ? (this.db.prepare(
          `SELECT l.from_id, l.to_id, l.relation FROM memory_links l
           JOIN memories m1 ON l.from_id = m1.id
           JOIN memories m2 ON l.to_id = m2.id
           WHERE l.relation = ? AND m1.project = ? AND m2.project = ?
           ORDER BY l.created_at DESC`
        ).all(relation, proj, proj) as GraphEdge[])
      : (this.db.prepare(
          `SELECT l.from_id, l.to_id, l.relation FROM memory_links l
           JOIN memories m1 ON l.from_id = m1.id
           JOIN memories m2 ON l.to_id = m2.id
           WHERE m1.project = ? AND m2.project = ?
           ORDER BY l.created_at DESC`
        ).all(proj, proj) as GraphEdge[]);

    const edges: GraphEdge[] = edgeRows;

    // Collect the set of IDs that appear in edges
    const linkedIds = new Set<string>();
    for (const e of edges) {
      linkedIds.add(e.from_id);
      linkedIds.add(e.to_id);
    }

    // Fetch node details
    let nodeRows: MemoryRow[];
    const ALIVE = "(expires_at IS NULL OR expires_at > datetime('now'))";
    if (include_orphans) {
      nodeRows = this.db.prepare(
        `SELECT * FROM memories WHERE project = ? AND ${ALIVE} ORDER BY created_at DESC`
      ).all(proj) as MemoryRow[];
    } else if (linkedIds.size > 0) {
      const placeholders = Array.from(linkedIds).map(() => "?").join(", ");
      nodeRows = this.db.prepare(
        `SELECT * FROM memories WHERE id IN (${placeholders}) AND project = ? AND ${ALIVE}`
      ).all(...Array.from(linkedIds), proj) as MemoryRow[];
    } else {
      nodeRows = [];
    }

    const nodes: GraphNode[] = nodeRows.map((row) => ({
      id: row.id,
      content_preview: row.content.slice(0, 60).replace(/\n/g, " "),
      category: row.category,
      tags: JSON.parse(row.tags) as string[],
    }));

    const mermaid = this.buildMermaid(nodes, edges);

    return {
      node_count: nodes.length,
      edge_count: edges.length,
      nodes,
      edges,
      mermaid,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Projects API (Ronda 29)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * List all distinct projects and their memory counts.
   */
  listProjects(): ProjectInfo[] {
    return this.db.prepare(
      "SELECT project, COUNT(*) AS count FROM memories GROUP BY project ORDER BY count DESC"
    ).all() as ProjectInfo[];
  }

  /**
   * Move memories that carry a specific tag into a target project.
   * Returns the number of memories updated.
   */
  migrateToProject(input: MigrateToProjectInput): number {
    const { tag, project } = input;
    const rows = this.db.prepare(
      `UPDATE memories
       SET project = ?, updated_at = datetime('now')
       WHERE EXISTS (SELECT 1 FROM json_each(memories.tags) WHERE value = ?)
       RETURNING id`
    ).all(project, tag) as Array<{ id: string }>;
    return rows.length;
  }

  /**
   * Generate a Mermaid flowchart string from nodes and edges.
   */
  private buildMermaid(nodes: GraphNode[], edges: GraphEdge[]): string {
    if (nodes.length === 0 && edges.length === 0) {
      return "flowchart LR\n  empty[\"No memories in graph\"]";
    }

    const lines: string[] = ["flowchart LR"];

    // Mermaid node ID: 'n' + first 8 hex chars of UUID (no dashes)
    const mId = (id: string) => "n" + id.replace(/-/g, "").slice(0, 8);

    // Declare all nodes with labels
    for (const node of nodes) {
      const label = node.content_preview
        .slice(0, 40)
        .replace(/"/g, "'")
        .replace(/[<>]/g, " ");
      lines.push(`  ${mId(node.id)}["${label} (${node.category})"]`);
    }

    // Declare edges
    for (const edge of edges) {
      lines.push(`  ${mId(edge.from_id)} -- ${edge.relation} --> ${mId(edge.to_id)}`);
    }

    return lines.join("\n");
  }}
