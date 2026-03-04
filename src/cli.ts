#!/usr/bin/env node
/**
 * engram-cli — Command-line interface for engram-mcp
 *
 * Usage: engram-cli [--db <path>] [--project <name>] [--json] <command> [args] [options]
 */

import { MemoryDatabase } from "./db/database.js";
import type { RelationType } from "./types/memory.js";
import { pathToFileURL } from "node:url";

// ─── Arg parser ──────────────────────────────────────────────────────────────

export interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
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

function die(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function getStringFlag(flags: Record<string, string | boolean>, key: string): string | undefined {
  return typeof flags[key] === "string" ? flags[key] : undefined;
}

function getIntFlag(
  flags: Record<string, string | boolean>,
  key: string,
  defaultValue: number,
  label: string
): number {
  const raw = getStringFlag(flags, key);
  if (raw === undefined) return defaultValue;

  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    die(`${label} debe ser un número entero válido.`);
  }
  return parsed;
}

function parseCsv(raw?: string): string[] | undefined {
  if (raw === undefined) return undefined;
  return raw.split(",").map((t) => t.trim()).filter(Boolean);
}

function parseJsonObject(raw: string | undefined, fallback: Record<string, unknown>): Record<string, unknown> {
  if (raw === undefined) return fallback;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    die("--metadata debe ser un JSON válido.");
  }
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

export function getHelpText(): string {
  return `
engram-cli — CLI para el servidor de memorias MCP

USAGE
  engram-cli [--db <path>] [--project <name>] [--json] <command> [args] [options]

GLOBAL FLAGS
  --db <path>     Ruta al archivo de base de datos (default: ~/.engram/memories.db)
  --project <p>   Proyecto/namesapce a usar (default: valor por defecto del servidor)
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

  get-related-deep <id>       Recorrer grafo por niveles desde un nodo
    --max-depth <n>             Profundidad máxima (1-5, default: 3)
    --relation <rel>            Filtrar por tipo de relación
    --limit <n>                 Máximo de resultados (default: 50)

  suggest-links [id]          Sugerir enlaces potenciales sin crearlos
    --limit <n>                 Máximo de sugerencias (default: 20)

  history <id>                Historial de cambios de una memoria
    --limit <n>                 Límite (default: 20)

  restore <id> <history_id>   Restaurar memoria a versión anterior

  list-projects               Listar proyectos y conteo de memorias

  migrate-to-project <tag> <source_project> <project>
                              Mover memorias con el tag desde proyecto origen al proyecto destino

  help                        Mostrar esta ayuda
`;
}

function printHelp(): void {
  console.log(getHelpText());
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const RELATION_TYPES = new Set(["caused", "references", "supersedes", "related"]);

async function main(): Promise<void> {
  const { command, positional, flags } = parseArgs(process.argv);
  const asJson = flags["json"] === true;
  const project = typeof flags["project"] === "string" ? flags["project"] : undefined;

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
        if (!query) die("se requiere un término de búsqueda.");

        const limit = getIntFlag(flags, "limit", 10, "--limit");
        const mode = (flags["mode"] as "any" | "all" | "near" | undefined) ?? "any";
        const category = getStringFlag(flags, "category");
        const tag = getStringFlag(flags, "tag");

        const result = db.searchWithTotal({ query, limit, offset: 0, mode, category, tag, project });
        if (asJson) { output(result); break; }

        console.log(`\n  Resultados: ${result.total} encontradas, mostrando ${result.memories.length}\n`);
        printHeader();
        result.memories.forEach(printMemoryRow);
        console.log();
        break;
      }

      // ── list ──────────────────────────────────────────────────────────────
      case "list": {
        const limit = getIntFlag(flags, "limit", 20, "--limit");
        const offset = getIntFlag(flags, "offset", 0, "--offset");
        const category = getStringFlag(flags, "category");
        const tag = getStringFlag(flags, "tag");
        const sort = getStringFlag(flags, "sort");
        const sort_by = sort
          ? (sort as "created_at_desc" | "created_at_asc" | "updated_at_desc")
          : "created_at_desc";

        const result = db.listWithTotal({ limit, offset, category, tag, sort_by, project });
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
        if (!id) die("se requiere un ID.");

        const memory = db.getById(id);
        if (!memory || (project && memory.project !== project)) {
          die(`memoria '${id}' no encontrada${project ? ` en proyecto '${project}'` : ""}.`);
        }

        if (asJson) { output(memory); break; }
        printMemoryFull(memory);
        break;
      }

      // ── save ──────────────────────────────────────────────────────────────
      case "save": {
        const content = positional[0];
        if (!content) die("se requiere contenido.");

        const category = getStringFlag(flags, "category") ?? "general";
        const tags = parseCsv(getStringFlag(flags, "tags")) ?? [];
        const metadata = parseJsonObject(getStringFlag(flags, "metadata"), {});
        const expires_at = getStringFlag(flags, "expires");

        const saved = db.create({ content, category, tags, metadata, expires_at, project });
        if (asJson) { output(saved); break; }

        console.log(`\n  ✓ Memoria guardada\n`);
        printMemoryFull(saved);
        break;
      }

      // ── update ────────────────────────────────────────────────────────────
      case "update": {
        const id = positional[0];
        if (!id) die("se requiere un ID.");

        const current = db.getById(id);
        if (!current || (project && current.project !== project)) {
          die(`memoria '${id}' no encontrada${project ? ` en proyecto '${project}'` : ""}.`);
        }

        const content = getStringFlag(flags, "content");
        const category = getStringFlag(flags, "category");
        const tags = parseCsv(getStringFlag(flags, "tags"));
        const metadataRaw = getStringFlag(flags, "metadata");
        const metadata = metadataRaw ? parseJsonObject(metadataRaw, {}) : undefined;

        if (!content && !category && !tags && !metadata) {
          die("debes especificar al menos --content, --category, --tags o --metadata.");
        }

        const updated = db.update(id, { content, category, tags, metadata });
        if (!updated) die("no se pudo actualizar.");

        if (asJson) { output(updated); break; }
        console.log(`\n  ✓ Memoria actualizada\n`);
        printMemoryFull(updated);
        break;
      }

      // ── delete ────────────────────────────────────────────────────────────
      case "delete": {
        const id = positional[0];
        if (!id) die("se requiere un ID.");

        const memory = db.getById(id);
        if (!memory || (project && memory.project !== project)) {
          die(`memoria '${id}' no encontrada${project ? ` en proyecto '${project}'` : ""}.`);
        }

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
        const stats = db.getStats(project);
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
          die("no se puede hacer backup de una base de datos en memoria.");
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
        if (!fromId || !toId) die("se requieren <from_id> y <to_id>.");

        const relation = (typeof flags["relation"] === "string" && RELATION_TYPES.has(flags["relation"]))
          ? (flags["relation"] as RelationType)
          : "related";

        const link = db.linkMemories({ from_id: fromId, to_id: toId, relation, project });
        if (asJson) { output(link); break; }
        console.log(`\n  ✓ Enlace creado: ${fromId.slice(0, 8)} --${relation}--> ${toId.slice(0, 8)}\n`);
        break;
      }

      // ── unlink ────────────────────────────────────────────────────────────
      case "unlink": {
        const fromId = positional[0];
        const toId = positional[1];
        if (!fromId || !toId) die("se requieren <from_id> y <to_id>.");

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

        const result = db.getGraph({ include_orphans, relation, project });
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

      // ── get-related-deep ────────────────────────────────────────────────
      case "get-related-deep": {
        const id = positional[0];
        if (!id) die("se requiere un ID de origen.");

        const max_depth = getIntFlag(flags, "max-depth", 3, "--max-depth");
        const relation = (typeof flags["relation"] === "string" && RELATION_TYPES.has(flags["relation"]))
          ? (flags["relation"] as RelationType)
          : undefined;
        const limit = getIntFlag(flags, "limit", 50, "--limit");

        const result = db.getRelatedDeep({ id, max_depth, relation, project, limit });
        if (asJson) { output(result); break; }

        console.log(`\n  Reachables: ${result.total}\n`);
        result.results.forEach((row) => {
          console.log(
            `  d${row.depth} ${row.memory.id.slice(0, 8)}  [${row.relation}]  ${truncate(row.memory.content, 60)}`
          );
        });
        console.log();
        break;
      }

      // ── suggest-links ───────────────────────────────────────────────────
      case "suggest-links": {
        const id = positional[0];
        const limit = getIntFlag(flags, "limit", 20, "--limit");

        const result = db.suggestLinks({ id, project, limit });
        if (asJson) { output(result); break; }

        console.log(`\n  Analizadas: ${result.analysed} | Sugerencias: ${result.suggestions.length}\n`);
        result.suggestions.forEach((s) => {
          console.log(
            `  ${s.from_id.slice(0, 8)} -> ${s.to_id.slice(0, 8)}  [${s.suggested_relation}]  w=${s.weight.toFixed(2)}  ${s.reason}`
          );
        });
        console.log();
        break;
      }

      // ── history ───────────────────────────────────────────────────────────
      case "history": {
        const id = positional[0];
        if (!id) die("se requiere un ID.");

        const limit = getIntFlag(flags, "limit", 20, "--limit");
        const memory = db.getById(id);
        if (!memory || (project && memory.project !== project)) {
          die(`memoria '${id}' no encontrada${project ? ` en proyecto '${project}'` : ""}.`);
        }

        const result = db.getHistory({ memory_id: id, project, limit, offset: 0 });

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
          die("se requieren <memory_id> y <history_id>.");
        }

        const memory = db.getById(id);
        if (!memory || (project && memory.project !== project)) {
          die(`memoria '${id}' no encontrada${project ? ` en proyecto '${project}'` : ""}.`);
        }

        const parsedHistoryId = parseInt(histId, 10);
        if (Number.isNaN(parsedHistoryId)) {
          die("<history_id> debe ser un número entero válido.");
        }

        const restored = db.restoreMemory({ memory_id: id, history_id: parsedHistoryId });
        if (!restored) {
          die("no se encontró la memoria o la entrada de historial.");
        }

        if (project && restored.project !== project) {
          die(`no se pudo restaurar la memoria en el proyecto '${project}'.`);
        }

        if (asJson) { output(restored); break; }
        console.log(`\n  ✓ Memoria restaurada al estado #${histId}\n`);
        printMemoryFull(restored);
        break;
      }

      // ── list-projects ───────────────────────────────────────────────────
      case "list-projects": {
        const projects = db.listProjects();
        if (asJson) { output({ projects, default_project: db.defaultProject }); break; }

        console.log(`\n  Proyectos (${projects.length})\n`);
        projects.forEach((p) => {
          const mark = p.project === db.defaultProject ? "*" : " ";
          console.log(`  ${mark} ${pad(p.project, 20)} ${p.count}`);
        });
        console.log("\n  * proyecto por defecto\n");
        break;
      }

      // ── migrate-to-project ──────────────────────────────────────────────
      case "migrate-to-project": {
        const tag = positional[0];
        const sourceProject = positional[1];
        const targetProject = positional[2];
        if (!tag || !sourceProject || !targetProject) {
          die("se requieren <tag> <source_project> y <project>.");
        }
        if (sourceProject === targetProject) {
          die("<source_project> y <project> deben ser distintos.");
        }

        const migrated = db.migrateToProject({ tag, source_project: sourceProject, project: targetProject });
        const payload = { migrated, tag, source_project: sourceProject, project: targetProject };
        if (asJson) { output(payload); break; }

        console.log(
          `\n  ✓ Migradas ${migrated} memorias con tag '${tag}' desde '${sourceProject}' al proyecto '${targetProject}'\n`
        );
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: Error) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
