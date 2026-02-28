#!/usr/bin/env node
/**
 * engram-cli — Command-line interface for engram-mcp
 *
 * Usage: engram-cli [--db <path>] [--json] <command> [args] [options]
 */

import { MemoryDatabase } from "./db/database.js";
import type { RelationType } from "./types/memory.js";

// ─── Arg parser ──────────────────────────────────────────────────────────────

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // remove node + script
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  let command = "help";

  let i = 0;
  // Global flags before command
  while (i < args.length && args[i]!.startsWith("--")) {
    const key = args[i]!.slice(2);
    if (i + 1 < args.length && !args[i + 1]!.startsWith("--")) {
      flags[key] = args[++i]!;
    } else {
      flags[key] = true;
    }
    i++;
  }

  if (i < args.length) {
    command = args[i++]!;
  }

  while (i < args.length) {
    if (args[i]!.startsWith("--")) {
      const key = args[i]!.slice(2);
      if (i + 1 < args.length && !args[i + 1]!.startsWith("--")) {
        flags[key] = args[++i]!;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(args[i]!);
    }
    i++;
  }

  return { command, positional, flags };
}

// ─── Output helpers ───────────────────────────────────────────────────────────

function str(val: unknown): string {
  return typeof val === "string" ? val : JSON.stringify(val);
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function truncate(s: string, n: number): string {
  const oneLine = s.replace(/\n/g, " ");
  return oneLine.length > n ? oneLine.slice(0, n - 1) + "…" : oneLine;
}

function printMemoryRow(m: {
  id: string;
  content: string;
  category: string;
  tags: string[] | string;
  created_at?: string;
}): void {
  const tags = Array.isArray(m.tags) ? m.tags : (JSON.parse(m.tags as string) as string[]);
  const tagStr = tags.length > 0 ? tags.slice(0, 3).join(", ") + (tags.length > 3 ? "…" : "") : "—";
  console.log(
    `  ${pad(m.id.slice(0, 8), 8)}  ${pad(m.category, 12)}  ${pad(tagStr, 20)}  ${truncate(m.content, 55)}`
  );
}

function printMemoryFull(m: {
  id: string;
  content: string;
  category: string;
  tags: string[] | string;
  metadata: Record<string, unknown> | string;
  created_at?: string;
  updated_at?: string;
  expires_at?: string | null;
}): void {
  const tags = Array.isArray(m.tags) ? m.tags : (JSON.parse(m.tags as string) as string[]);
  const meta =
    typeof m.metadata === "object" ? m.metadata : (JSON.parse(m.metadata as string) as Record<string, unknown>);

  console.log(`\nID:         ${m.id}`);
  console.log(`Category:   ${m.category}`);
  console.log(`Tags:       ${tags.length > 0 ? tags.join(", ") : "(none)"}`);
  if (m.created_at) console.log(`Created:    ${m.created_at}`);
  if (m.updated_at) console.log(`Updated:    ${m.updated_at}`);
  if (m.expires_at !== undefined) console.log(`Expires:    ${m.expires_at ?? "(never)"}`);
  if (Object.keys(meta).length > 0) console.log(`Metadata:   ${JSON.stringify(meta)}`);
  console.log(`\nContent:\n${m.content}\n`);
}

function printHeader(): void {
  console.log(`  ${"ID".padEnd(8)}  ${"Category".padEnd(12)}  ${"Tags".padEnd(20)}  Content`);
  console.log(`  ${"─".repeat(8)}  ${"─".repeat(12)}  ${"─".repeat(20)}  ${"─".repeat(50)}`);
}

// ─── Help ─────────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
engram-cli — CLI para el servidor de memorias MCP

USAGE
  engram-cli [--db <path>] [--json] <command> [args] [options]

GLOBAL FLAGS
  --db <path>     Ruta al archivo de base de datos (default: ~/.engram/memories.db)
  --json          Salida en JSON (compatible para scripting)

COMMANDS
  search <query>              Buscar memorias por texto (FTS)
    --category <cat>            Filtrar por categoría
    --tag <tag>                 Filtrar por tag
    --limit <n>                 Límite de resultados (default: 10)
    --mode any|all|near         Modo de búsqueda (default: any)

  list                        Listar memorias
    --category <cat>            Filtrar por categoría
    --tag <tag>                 Filtrar por tag
    --limit <n>                 Límite (default: 20)
    --offset <n>                Offset (default: 0)
    --sort created_at_desc|created_at_asc|updated_at_desc

  get <id>                    Obtener memoria por ID (o primeros 8 caracteres)

  save <content>              Guardar nueva memoria
    --category <cat>            Categoría (default: general)
    --tags <t1,t2>              Tags separados por coma
    --metadata <json>           Metadata como JSON
    --expires <ISO>             Fecha de expiración ISO

  update <id>                 Actualizar memoria existente
    --content <text>            Nuevo contenido
    --category <cat>            Nueva categoría
    --tags <t1,t2>              Nuevos tags
    --metadata <json>           Nueva metadata

  delete <id>                 Eliminar memoria (pide confirmación)
    --yes                       Saltar confirmación

  stats                       Estadísticas de la base de datos

  backup                      Crear copia de seguridad timestampeada

  link <from_id> <to_id>      Enlazar dos memorias
    --relation <rel>            Tipo: caused|references|supersedes|related (default: related)

  unlink <from_id> <to_id>    Eliminar enlace entre memorias

  graph                       Mostrar grafo de memorias
    --include-orphans           Incluir memorias sin enlaces
    --relation <rel>            Filtrar por tipo de relación
    --mermaid-only              Solo imprimir el diagrama Mermaid

  history <id>                Historial de cambios de una memoria
    --limit <n>                 Límite (default: 20)

  restore <id> <history_id>   Restaurar memoria a versión anterior

  help                        Mostrar esta ayuda
`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const RELATION_TYPES = new Set(["caused", "references", "supersedes", "related"]);

async function main(): Promise<void> {
  const { command, positional, flags } = parseArgs(process.argv);
  const asJson = flags["json"] === true;

  const dbPath = typeof flags["db"] === "string" ? flags["db"] : undefined;
  const db = new MemoryDatabase(dbPath);

  const output = (data: unknown): void => {
    if (asJson) {
      console.log(JSON.stringify(data, null, 2));
    }
  };

  try {
    switch (command) {
      // ── search ────────────────────────────────────────────────────────────
      case "search": {
        const query = positional[0];
        if (!query) { console.error("Error: se requiere un término de búsqueda."); process.exit(1); }

        const limit = flags["limit"] ? parseInt(str(flags["limit"]), 10) : 10;
        const mode = (flags["mode"] as "any" | "all" | "near" | undefined) ?? "any";
        const category = typeof flags["category"] === "string" ? flags["category"] : undefined;
        const tag = typeof flags["tag"] === "string" ? flags["tag"] : undefined;

        const result = db.searchWithTotal({ query, limit, offset: 0, mode, category, tag });
        if (asJson) { output(result); break; }

        console.log(`\n  Resultados: ${result.total} encontradas, mostrando ${result.memories.length}\n`);
        printHeader();
        result.memories.forEach(printMemoryRow);
        console.log();
        break;
      }

      // ── list ──────────────────────────────────────────────────────────────
      case "list": {
        const limit = flags["limit"] ? parseInt(str(flags["limit"]), 10) : 20;
        const offset = flags["offset"] ? parseInt(str(flags["offset"]), 10) : 0;
        const category = typeof flags["category"] === "string" ? flags["category"] : undefined;
        const tag = typeof flags["tag"] === "string" ? flags["tag"] : undefined;
        const sort_by = typeof flags["sort"] === "string"
          ? (flags["sort"] as "created_at_desc" | "created_at_asc" | "updated_at_desc")
          : "created_at_desc";

        const result = db.listWithTotal({ limit, offset, category, tag, sort_by });
        if (asJson) { output(result); break; }

        console.log(`\n  Total: ${result.total} | Mostrando ${offset + 1}–${offset + result.memories.length}\n`);
        printHeader();
        result.memories.forEach(printMemoryRow);
        console.log();
        break;
      }

      // ── get ───────────────────────────────────────────────────────────────
      case "get": {
        const id = positional[0];
        if (!id) { console.error("Error: se requiere un ID."); process.exit(1); }

        const memory = db.getById(id);
        if (!memory) { console.error(`Error: memoria '${id}' no encontrada.`); process.exit(1); }

        if (asJson) { output(memory); break; }
        printMemoryFull(memory);
        break;
      }

      // ── save ──────────────────────────────────────────────────────────────
      case "save": {
        const content = positional[0];
        if (!content) { console.error("Error: se requiere contenido."); process.exit(1); }

        const category = typeof flags["category"] === "string" ? flags["category"] : "general";
        const tagsRaw = typeof flags["tags"] === "string" ? flags["tags"] : "";
        const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];
        const metaRaw = typeof flags["metadata"] === "string" ? flags["metadata"] : "{}";
        const metadata = JSON.parse(metaRaw) as Record<string, unknown>;
        const expires_at = typeof flags["expires"] === "string" ? flags["expires"] : undefined;

        const saved = db.create({ content, category, tags, metadata, expires_at });
        if (asJson) { output(saved); break; }

        console.log(`\n  ✓ Memoria guardada\n`);
        printMemoryFull(saved);
        break;
      }

      // ── update ────────────────────────────────────────────────────────────
      case "update": {
        const id = positional[0];
        if (!id) { console.error("Error: se requiere un ID."); process.exit(1); }

        const current = db.getById(id);
        if (!current) { console.error(`Error: memoria '${id}' no encontrada.`); process.exit(1); }

        const content = typeof flags["content"] === "string" ? flags["content"] : undefined;
        const category = typeof flags["category"] === "string" ? flags["category"] : undefined;
        const tagsRaw = typeof flags["tags"] === "string" ? flags["tags"] : undefined;
        const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : undefined;
        const metaRaw = typeof flags["metadata"] === "string" ? flags["metadata"] : undefined;
        const metadata = metaRaw ? (JSON.parse(metaRaw) as Record<string, unknown>) : undefined;

        if (!content && !category && !tags && !metadata) {
          console.error("Error: debes especificar al menos --content, --category, --tags o --metadata.");
          process.exit(1);
        }

        const updated = db.update(id, { content, category, tags, metadata });
        if (!updated) { console.error("Error: no se pudo actualizar."); process.exit(1); }

        if (asJson) { output(updated); break; }
        console.log(`\n  ✓ Memoria actualizada\n`);
        printMemoryFull(updated);
        break;
      }

      // ── delete ────────────────────────────────────────────────────────────
      case "delete": {
        const id = positional[0];
        if (!id) { console.error("Error: se requiere un ID."); process.exit(1); }

        const memory = db.getById(id);
        if (!memory) { console.error(`Error: memoria '${id}' no encontrada.`); process.exit(1); }

        if (!flags["yes"]) {
          console.log(`\n  Memoria a eliminar: ${id}`);
          console.log(`  Contenido: ${truncate(memory.content, 80)}`);
          console.log(`\n  Para confirmar, ejecuta con --yes\n`);
          process.exit(0);
        }

        db.delete(id);
        if (asJson) { output({ deleted: true, id }); break; }
        console.log(`\n  ✓ Memoria '${id}' eliminada\n`);
        break;
      }

      // ── stats ─────────────────────────────────────────────────────────────
      case "stats": {
        const stats = db.getStats();
        if (asJson) { output(stats); break; }

        console.log(`\n  ── Estadísticas ─────────────────────────────`);
        console.log(`  Total memorias:     ${stats.total}`);
        console.log(`  Sin tags:           ${stats.memories_without_tags}`);
        console.log(`  Sin metadata:       ${stats.memories_without_metadata}`);
        console.log(`  Longitud media:     ${Math.round(stats.avg_content_len)} chars`);
        if (stats.oldest) console.log(`  Más antigua:        ${stats.oldest.created_at}`);
        if (stats.newest) console.log(`  Más reciente:       ${stats.newest.created_at}`);
        const catEntries = Object.entries(stats.by_category);
        if (catEntries.length > 0) {
          console.log(`\n  Categorías:`);
          catEntries.forEach(([cat, count]) => console.log(`    ${pad(cat, 16)}  ${count}`));
        }
        if (stats.top_tags.length > 0) {
          console.log(`\n  Top tags:`);
          stats.top_tags.slice(0, 10).forEach((t) => console.log(`    ${pad(t.tag, 20)}  ${t.count}`));
        }
        console.log();
        break;
      }

      // ── backup ────────────────────────────────────────────────────────────
      case "backup": {
        if (db.dbPath === ":memory:") {
          console.error("Error: no se puede hacer backup de una base de datos en memoria.");
          process.exit(1);
        }
        const { copyFileSync, statSync } = await import("node:fs");
        const { dirname, join } = await import("node:path");

        const now = new Date();
        const ts = now.toISOString().slice(0, 19).replace(/:/g, "-");
        const backupPath = join(dirname(db.dbPath), `memories.backup.${ts}.db`);
        copyFileSync(db.dbPath, backupPath);
        const { size } = statSync(backupPath);

        if (asJson) { output({ path: backupPath, size_bytes: size, created_at: now.toISOString() }); break; }
        console.log(`\n  ✓ Backup creado`);
        console.log(`  Ruta:   ${backupPath}`);
        console.log(`  Tamaño: ${(size / 1024).toFixed(1)} KB\n`);
        break;
      }

      // ── link ──────────────────────────────────────────────────────────────
      case "link": {
        const fromId = positional[0];
        const toId = positional[1];
        if (!fromId || !toId) { console.error("Error: se requieren <from_id> y <to_id>."); process.exit(1); }

        const relation = (typeof flags["relation"] === "string" && RELATION_TYPES.has(flags["relation"]))
          ? (flags["relation"] as RelationType)
          : "related";

        const link = db.linkMemories({ from_id: fromId, to_id: toId, relation });
        if (asJson) { output(link); break; }
        console.log(`\n  ✓ Enlace creado: ${fromId.slice(0, 8)} --${relation}--> ${toId.slice(0, 8)}\n`);
        break;
      }

      // ── unlink ────────────────────────────────────────────────────────────
      case "unlink": {
        const fromId = positional[0];
        const toId = positional[1];
        if (!fromId || !toId) { console.error("Error: se requieren <from_id> y <to_id>."); process.exit(1); }

        const removed = db.unlinkMemories(fromId, toId);
        if (asJson) { output({ removed, from_id: fromId, to_id: toId }); break; }
        if (!removed) { console.log(`\n  No existía enlace entre ${fromId.slice(0, 8)} y ${toId.slice(0, 8)}\n`); }
        else { console.log(`\n  ✓ Enlace eliminado\n`); }
        break;
      }

      // ── graph ─────────────────────────────────────────────────────────────
      case "graph": {
        const include_orphans = flags["include-orphans"] === true;
        const relation = (typeof flags["relation"] === "string" && RELATION_TYPES.has(flags["relation"]))
          ? (flags["relation"] as RelationType)
          : undefined;
        const mermaidOnly = flags["mermaid-only"] === true;

        const result = db.getGraph({ include_orphans, relation });
        if (asJson) { output(result); break; }

        if (mermaidOnly) {
          console.log(result.mermaid);
          break;
        }

        console.log(`\n  Nodos: ${result.node_count}  |  Aristas: ${result.edge_count}\n`);
        if (result.edges.length > 0) {
          console.log("  Aristas:");
          result.edges.forEach((e) =>
            console.log(`    ${e.from_id.slice(0, 8)} --${e.relation}--> ${e.to_id.slice(0, 8)}`)
          );
        }
        console.log("\n  Mermaid:\n");
        console.log(result.mermaid);
        console.log();
        break;
      }

      // ── history ───────────────────────────────────────────────────────────
      case "history": {
        const id = positional[0];
        if (!id) { console.error("Error: se requiere un ID."); process.exit(1); }

        const limit = flags["limit"] ? parseInt(str(flags["limit"]), 10) : 20;
        const result = db.getHistory({ memory_id: id, limit, offset: 0 });

        if (asJson) { output(result); break; }

        console.log(`\n  Historial de '${id}' — ${result.total} entradas\n`);
        console.log(`  ${"#".padEnd(6)}  ${"Op".padEnd(8)}  ${"Fecha".padEnd(20)}  Contenido`);
        console.log(`  ${"─".repeat(6)}  ${"─".repeat(8)}  ${"─".repeat(20)}  ${"─".repeat(40)}`);
        result.entries.forEach((e) =>
          console.log(
            `  ${pad(String(e.history_id), 6)}  ${pad(e.operation, 8)}  ${pad(e.changed_at, 20)}  ${truncate(e.content, 40)}`
          )
        );
        console.log();
        break;
      }

      // ── restore ───────────────────────────────────────────────────────────
      case "restore": {
        const id = positional[0];
        const histId = positional[1];
        if (!id || !histId) {
          console.error("Error: se requieren <memory_id> y <history_id>.");
          process.exit(1);
        }

        const restored = db.restoreMemory({ memory_id: id, history_id: parseInt(histId, 10) });
        if (!restored) {
          console.error(`Error: no se encontró la memoria o la entrada de historial.`);
          process.exit(1);
        }

        if (asJson) { output(restored); break; }
        console.log(`\n  ✓ Memoria restaurada al estado #${histId}\n`);
        printMemoryFull(restored);
        break;
      }

      // ── help ──────────────────────────────────────────────────────────────
      case "help":
      default: {
        printHelp();
        break;
      }
    }
  } finally {
    db.close();
  }
}

main().catch((err: Error) => {
  console.error("Error:", err.message);
  process.exit(1);
});
