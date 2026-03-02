export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS memories (
    id          TEXT PRIMARY KEY,
    content     TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'general',
    tags        TEXT NOT NULL DEFAULT '[]',
    metadata    TEXT NOT NULL DEFAULT '{}',
    project     TEXT NOT NULL DEFAULT 'default',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
    content,
    category,
    tags,
    content=memories,
    content_rowid=rowid
  );

  CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(rowid, content, category, tags)
    VALUES (new.rowid, new.content, new.category, new.tags);
  END;

  CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, content, category, tags)
    VALUES ('delete', old.rowid, old.content, old.category, old.tags);
  END;

  CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, content, category, tags)
    VALUES ('delete', old.rowid, old.content, old.category, old.tags);
    INSERT INTO memories_fts(rowid, content, category, tags)
    VALUES (new.rowid, new.content, new.category, new.tags);
  END;

  CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
  CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);
  -- idx_memories_project and idx_memories_project_category are created in the v4 migration
  -- (they reference the 'project' column which doesn't exist on pre-v4 DBs)
  -- idx_memories_expires_at is created in the v1 migration (after ALTER TABLE on old DBs)

  CREATE TABLE IF NOT EXISTS memory_links (
    from_id        TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    to_id          TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    relation       TEXT NOT NULL DEFAULT 'related',
    weight         REAL NOT NULL DEFAULT 1.0,
    auto_generated INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (from_id, to_id)
  );

  CREATE INDEX IF NOT EXISTS idx_memory_links_to ON memory_links(to_id);

  -- History table: tracks every create/update/delete on memories (Ronda 28)
  CREATE TABLE IF NOT EXISTS memory_history (
    history_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_id   TEXT NOT NULL,
    operation   TEXT NOT NULL CHECK(operation IN ('create', 'update', 'delete')),
    content     TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'general',
    tags        TEXT NOT NULL DEFAULT '[]',
    metadata    TEXT NOT NULL DEFAULT '{}',
    project     TEXT NOT NULL DEFAULT 'default',
    expires_at  TEXT,
    changed_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_memory_history_memory_id
    ON memory_history(memory_id, changed_at DESC);

  CREATE TRIGGER IF NOT EXISTS memories_history_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memory_history (memory_id, operation, content, category, tags, metadata, project, expires_at)
    VALUES (new.id, 'create', new.content, new.category, new.tags, new.metadata, new.project, new.expires_at);
  END;

  CREATE TRIGGER IF NOT EXISTS memories_history_au AFTER UPDATE ON memories BEGIN
    INSERT INTO memory_history (memory_id, operation, content, category, tags, metadata, project, expires_at)
    VALUES (new.id, 'update', new.content, new.category, new.tags, new.metadata, new.project, new.expires_at);
  END;

  CREATE TRIGGER IF NOT EXISTS memories_history_ad AFTER DELETE ON memories BEGIN
    INSERT INTO memory_history (memory_id, operation, content, category, tags, metadata, project, expires_at)
    VALUES (old.id, 'delete', old.content, old.category, old.tags, old.metadata, old.project, old.expires_at);
  END;
`;
