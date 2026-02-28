# Engram

A persistent memory server for AI agents, implemented as an [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server. Stores structured notes/memories in a local SQLite database with full-text search, tagging, categorisation, TTL expiration, directional graph relationships, and full change history.

## Features

- **32 MCP tools**  full CRUD, search, bulk ops, import/export, stats, tag utilities, graph relations, versioning
- **CLI**  `engram-cli` for querying and managing memories from the terminal
- **SQLite + FTS5**  fast full-text search with `any` / `all` / `near` modes
- **Graph relations**  link memories with typed edges (`caused`, `references`, `supersedes`, `related`)
- **Change history**  every create/update/delete is tracked automatically; restore any previous version
- **TTL**  optional `expires_at` on every memory; auto-purge on startup
- **Rich filtering**  by category, tag, metadata key/value, date ranges, sort order
- **ESLint + Prettier**  enforced code style
- **455 tests**  full coverage via Vitest (`npm test`)

---

## Requirements

- [Node.js](https://nodejs.org/) 18+
- A host that supports MCP servers (VS Code with Copilot, Claude Desktop, etc.)

---

## Installation

```bash
git clone https://github.com/Jacksini/engram-mcp.git
cd engram-mcp
npm install
npm run build
```

The compiled server is at `build/index.js` and the CLI at `build/cli.js`.

---

## Configuration

### VS Code (Copilot / MCP extension)

Add to your `mcp.json` (`Ctrl+Shift+P`  **MCP: Open User Configuration**):

```jsonc
{
  "servers": {
    "engram-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/path/to/engram-mcp/build/index.js"]
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```jsonc
{
  "mcpServers": {
    "engram-mcp": {
      "command": "node",
      "args": ["C:/path/to/engram-mcp/build/index.js"]
    }
  }
}
```

### Custom database path

By default the database is stored at `~/.engram/memories.db`. Override it with:

```jsonc
"env": { "ENGRAM_DB_PATH": "C:/custom/path/memories.db" }
```

---

## CLI

`engram-cli` lets you interact with the memory database from the terminal without needing an MCP client.

```bash
# Install globally (after npm run build)
npm link

# Or run directly
node build/cli.js <command> [options]
```

### CLI commands

```
engram-cli [--db <path>] [--json] <command> [args] [options]

COMMANDS
  search <query>              FTS search (--limit, --mode, --category, --tag)
  list                        List memories (--category, --tag, --limit, --sort)
  get <id>                    Get a memory by UUID
  save <content>              Save a new memory (--category, --tags, --metadata, --expires)
  update <id>                 Update a memory (--content, --category, --tags, --metadata)
  delete <id> [--yes]         Delete a memory (asks for confirmation unless --yes)
  stats                       Database statistics
  backup                      Create a timestamped backup of the database
  link <from_id> <to_id>      Link two memories (--relation)
  unlink <from_id> <to_id>    Remove a link
  graph [--include-orphans]   Show memory graph (--relation, --mermaid-only)
  history <id>                Change history for a memory (--limit)
  restore <id> <history_id>   Restore a memory to a previous version
  help                        Show help
```

#### Examples

```bash
# Search and show results as JSON
engram-cli search "sqlite fts5" --limit 5 --json

# List recent code memories
engram-cli list --category code --limit 10

# Save a new memory with tags
engram-cli save "Use json_each() to query JSON arrays in SQLite" --category code --tags "sqlite,json"

# Show full memory
engram-cli get abc12345-...

# Show the memory graph as Mermaid diagram
engram-cli graph --mermaid-only

# See history of a memory and restore a version
engram-cli history abc12345-...
engram-cli restore abc12345-... 42
```

---

## MCP Tools reference

### Create

| Tool | Description |
|------|-------------|
| `save_memory` | Save a single memory |
| `save_memories` | Save up to 50 memories in one transaction (supports `compact` output) |

**Common input fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | `string` (110 000 chars) |  | Text content to store |
| `category` | `enum` |  | `general`  `code`  `decision`  `bug`  `architecture`  `convention` |
| `tags` | `string[]` |  | Arbitrary labels for filtering |
| `metadata` | `object` |  | Any JSON key/value pairs |
| `expires_at` | `string \| null` (ISO 8601) |  | Auto-expiration. `null` = never expires |

---

### Read

| Tool | Description |
|------|-------------|
| `get_memory` | Fetch a single memory by UUID |
| `get_memories` | Fetch multiple memories by UUID array |
| `list_memories` | Paginated listing with filters and sort |
| `search_memories` | Full-text search (FTS5) with filters |
| `get_context_snapshot` | Compact summary grouped by category  ideal for session bootstrapping |

#### `list_memories` / `search_memories` common filters

| Parameter | Description |
|-----------|-------------|
| `category` | Filter by category |
| `tag` | Filter by tag |
| `metadata_key` + `metadata_value` | Filter by a JSON metadata field |
| `created_after` / `created_before` | Date range on `created_at` |
| `updated_after` / `updated_before` | Date range on `updated_at` |
| `sort_by` | `created_at_desc` (default)  `created_at_asc`  `updated_at_desc` |
| `limit` / `offset` | Pagination |
| `compact` | Return only `{id, content, category, tags}` |
| `content_preview_len` | Truncate content to N characters |

#### `search_memories` extra parameters

| Parameter | Description |
|-----------|-------------|
| `query` | Search terms |
| `mode` | `any` (OR, default)  `all` (AND)  `near` (proximity) |
| `near_distance` | Max token distance for `near` mode (default 10) |

#### `get_context_snapshot` parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `recent_per_category` | 3 | Recent memories per category |
| `content_preview_len` |  | Truncate content to N characters |
| `include_tags_index` | `true` | Include tag frequency index |

---

### Update

| Tool | Description |
|------|-------------|
| `update_memory` | Update one memory (partial  only supplied fields change) |
| `update_memories` | Update up to 50 memories in one transaction |

---

### Delete

| Tool | Description |
|------|-------------|
| `delete_memory` | Delete a single memory by UUID |
| `delete_memories` | Delete up to 50 memories by UUID array |

---

### Graph relations

Memories can be linked with directional, typed edges forming a queryable graph.

| Tool | Description |
|------|-------------|
| `link_memories` | Create or update (upsert) a link between two memories |
| `unlink_memories` | Remove a link  returns `{found: true/false}` |
| `update_link` | Update the relation type of an **existing** link (error if link doesn't exist) |
| `get_related` | Retrieve memories linked to/from a given memory |
| `get_links` | List raw edges `{from_id, to_id, relation, created_at}` with filters |
| `get_graph` | Full graph as `{nodes, edges, mermaid}`  ready to paste in Mermaid Live |

#### Relation types

| Value | Meaning |
|-------|---------|
| `related` | Generic association (default) |
| `caused` | The origin memory caused/led to the target |
| `references` | The origin memory cites or references the target |
| `supersedes` | The origin memory replaces/obsoletes the target |

#### `get_graph` parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `include_orphans` | `false` | Also include memories with no links |
| `relation` |  | Restrict to a single relation type |

**Example output:**
```json
{
  "node_count": 3,
  "edge_count": 2,
  "nodes": [...],
  "edges": [...],
  "mermaid": "flowchart LR\n  nabcd1234[\"Memory A (code)\"] -- caused --> nef567890[\"Memory B (decision)\"]"
}
```

---

### Change history & restore

Every memory change (create, update, delete) is automatically recorded in the `memory_history` table via SQLite triggers.

| Tool | Description |
|------|-------------|
| `get_history` | Returns all history entries for a memory, newest first |
| `restore_memory` | Restores a memory to a previous snapshot by `history_id` |

#### `get_history` parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `memory_id` |  | UUID of the memory |
| `limit` | 50 | Max entries (1200) |
| `offset` | 0 | Pagination offset |

**Example entry:**
```json
{
  "history_id": 42,
  "memory_id": "...",
  "operation": "update",
  "content": "Previous content",
  "category": "code",
  "tags": ["sqlite"],
  "metadata": {},
  "expires_at": null,
  "changed_at": "2026-02-28 02:00:00"
}
```

#### `restore_memory` parameters

| Parameter | Description |
|-----------|-------------|
| `memory_id` | UUID of the memory to restore |
| `history_id` | Numeric ID from `get_history` |

> **Note:** The restore is tracked as a new `update` entry in history. Deleted memories cannot be restored this way  recreate them from `get_history` data using `save_memory`.

---

### Import / Export

| Tool | Description |
|------|-------------|
| `export_memories` | Export all (or filtered) memories as a JSON array |
| `import_memories` | Import memories. `mode="insert"` always creates new; `mode="upsert"` updates by id |

---

### Stats & Maintenance

| Tool | Description |
|------|-------------|
| `get_stats` | Totals by category, top tags, oldest/newest, avg content length |
| `purge_expired` | Delete all memories with a past `expires_at`. Returns `{purged, ids}` |
| `db_maintenance` | SQLite `integrity_check` + WAL checkpoint |
| `backup` | Copy the database to `memories.backup.YYYY-MM-DDTHH-MM-SS.db` in the same directory |

> **Auto-purge:** expired memories are removed automatically on every server startup.

---

### Tag utilities

| Tool | Description |
|------|-------------|
| `rename_tag` | Rename a tag across all memories in a single transaction. Auto-deduplicates. |

---

## Categories

| Value | Intended use |
|-------|-------------|
| `general` | Miscellaneous notes |
| `code` | Code snippets, patterns, implementations |
| `decision` | Architectural or product decisions |
| `bug` | Bug reports, root causes, fixes |
| `architecture` | System design, structure, diagrams |
| `convention` | Coding standards, naming conventions, rules |

---

## Development

```bash
npm run build          # compile TypeScript  build/
npm run build:watch    # watch mode
npm run typecheck      # type-check only (no emit)
npm test               # run all 455 tests
npm run test:watch     # interactive watch mode
npm run lint           # ESLint
npm run lint:fix       # ESLint with auto-fix
npm run format         # Prettier
npm run format:check   # Prettier check (CI-friendly)
```

### Project structure

```
src/
  index.ts              # MCP server entry point
  cli.ts                # CLI entry point (engram-cli)
  db/
    database.ts         # MemoryDatabase class (all SQL logic)
    schema.ts           # SQLite DDL + triggers + migrations
  tools/                # One file per MCP tool (32 total)
  types/
    memory.ts           # All TypeScript interfaces and types
tests/
  db/
    database.test.ts    # DB-layer unit tests
  tools/                # Tool-layer tests (one file per tool)
  helpers/
    test-db.ts          # createTestDb()  in-memory DB factory
build/                  # Compiled output (git-ignored)
```

### Schema migrations

| Version | Changes |
|---------|---------|
| v1 | Added `expires_at` column + `idx_memories_expires_at` |
| v2 | Added `memory_links` table + index |
| v3 | Added `memory_history` table + index + triggers |

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENGRAM_DB_PATH` | `~/.engram/memories.db` | Path to the SQLite database file |

---

## License

ISC
