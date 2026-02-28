#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MemoryDatabase } from "./db/database.js";
import { registerAllTools } from "./tools/register-all.js";

const server = new McpServer({
  name: "engram-mcp",
  version: "1.0.0",
});

const db = new MemoryDatabase();
registerAllTools(server, db);

async function main() {
  // Purge expired memories on startup so TTL-based entries are cleaned up immediately
  const purged = db.purgeExpired();
  if (purged.purged > 0) {
    console.error(`Auto-purge: ${purged.purged} expired memor${purged.purged === 1 ? "y" : "ies"} removed on startup.`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Servidor MCP iniciado con base de datos de memorias");

  // Graceful shutdown: close the DB so SQLite can flush the WAL and release locks
  const shutdown = () => {
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch(console.error);
