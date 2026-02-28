import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { copyFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { MemoryDatabase } from "../db/database.js";

export function registerBackup(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "backup",
    "Crea una copia de seguridad del archivo de base de datos SQLite en el mismo directorio, " +
      "con un nombre timestampeado (memories.backup.YYYY-MM-DDTHH-MM-SS.db). " +
      "Devuelve la ruta del backup, su tamaño en bytes y la fecha/hora de creación. " +
      "No funciona con bases de datos en memoria (:memory:).",
    {},
    async () => {
      if (db.dbPath === ":memory:") {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: "Error: no se puede hacer backup de una base de datos en memoria.",
            },
          ],
        };
      }

      // Build a timestamp like 2026-02-27T19-30-00 (safe for filesystem)
      const now = new Date();
      const ts = now
        .toISOString()
        .slice(0, 19)          // "2026-02-27T19:30:00"
        .replace(/:/g, "-");   // "2026-02-27T19-30-00"

      // Source: e.g. ~/.engram/memories.db
      // Destination: ~/.engram/memories.backup.2026-02-27T19-30-00.db
      const dir = dirname(db.dbPath);
      const backupPath = join(dir, `memories.backup.${ts}.db`);

      copyFileSync(db.dbPath, backupPath);

      const { size } = statSync(backupPath);
      const created_at = now.toISOString();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ path: backupPath, size_bytes: size, created_at }, null, 2),
          },
        ],
      };
    }
  );
}
