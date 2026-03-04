#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MemoryDatabase } from "./db/database.js";
import { registerAllTools } from "./tools/register-all.js";

const server = new McpServer({
  name: "engram-mcp",
  version: "1.1.1",
});

const db = new MemoryDatabase();
registerAllTools(server, db);

async function main() {
  console.error(`Starting engram-mcp (db='${db.dbPath}', default_project='${db.defaultProject}')`);

  // Purge expired memories on startup so TTL-based entries are cleaned up immediately
  try {
    const purged = db.purgeExpired();
    if (purged.purged > 0) {
      console.error(`Auto-purge: ${purged.purged} expired memor${purged.purged === 1 ? "y" : "ies"} removed on startup.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Auto-purge failed on startup: ${message}`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Servidor MCP iniciado con base de datos de memorias");

  // Periodic maintenance (4.1): purge expired every 5 min, optimize FTS every 30 min
  const purgeInterval = setInterval(() => {
    try {
      const result = db.purgeExpired();
      if (result.purged > 0) {
        console.error(`Periodic purge: ${result.purged} expired memor${result.purged === 1 ? "y" : "ies"} removed.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Periodic purge failed: ${message}`);
    }
  }, 5 * 60 * 1000);

  const ftsInterval = setInterval(() => {
    try {
      db.optimizeFts();
      console.error("FTS optimize executed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`FTS optimize failed: ${message}`);
    }
  }, 30 * 60 * 1000);

  // Graceful shutdown: clear intervals and close the DB so SQLite can flush the WAL
  const shutdown = () => {
    clearInterval(purgeInterval);
    clearInterval(ftsInterval);
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch(console.error);
