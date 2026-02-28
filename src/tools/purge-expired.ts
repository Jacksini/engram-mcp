import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MemoryDatabase } from "../db/database.js";

/**
 * Purge Expired Memories
 * Physically removes all memories whose expires_at is in the past.
 * Returns the count and IDs of purged memories.
 */
export function registerPurgeExpired(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "purge_expired",
    "Elimina físicamente todas las memorias cuya fecha de expiración (expires_at) ya ha pasado. " +
    "Devuelve el número de memorias eliminadas y sus IDs.",
    {},   // no params needed
    async () => {
      const result = db.purgeExpired();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}
