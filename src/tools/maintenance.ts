import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";

export function registerMaintenance(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "db_maintenance",
    "Ejecuta mantenimiento en la base de datos SQLite: integrity_check para detectar corrupción y wal_checkpoint para consolidar el WAL al archivo principal. Devuelve {integrity_ok, integrity_errors[], wal_checkpoint: {busy, log, checkpointed}}.",
    {
      checkpoint_mode: z
        .enum(["PASSIVE", "FULL", "RESTART", "TRUNCATE"])
        .default("PASSIVE")
        .describe(
          "Modo de checkpoint WAL. PASSIVE (default): no bloquea lectores. FULL: espera escrituras activas. RESTART: como FULL pero reinicia lectores. TRUNCATE: como RESTART y trunca el archivo WAL."
        ),
    },
    async ({ checkpoint_mode }) => {
      const result = db.maintenance(checkpoint_mode);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result),
          },
        ],
      };
    }
  );
}
