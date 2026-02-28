import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryDatabase } from "../db/database.js";

const schema = {
  from_id: z.string().uuid("from_id debe ser un UUID válido").describe("ID de la memoria origen."),
  to_id:   z.string().uuid("to_id debe ser un UUID válido").describe("ID de la memoria destino."),
};

export function registerUnlinkMemories(server: McpServer, db: MemoryDatabase): void {
  server.tool(
    "unlink_memories",
    "Elimina el enlace entre dos memorias. Devuelve found=true si existía, false si no.",
    schema,
    async ({ from_id, to_id }) => {
      const found = db.unlinkMemories(from_id, to_id);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ found }, null, 2) }],
      };
    }
  );
}
