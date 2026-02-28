import { z } from "zod";
import { VALID_CATEGORIES } from "../types/memory.js";

// ---------------------------------------------------------------------------
// Category enum — enforces the 6 known categories at the tool (Zod) layer.
// The DB layer still accepts any string (normalises to lowercase).
// ---------------------------------------------------------------------------
export const CategoryEnum = z
  .enum(VALID_CATEGORIES)
  .optional()
  .describe("Categoría: general, code, decision, bug, architecture, convention");

// ---------------------------------------------------------------------------
// Sort order param for list_memories
// ---------------------------------------------------------------------------
export const SortByParam = z
  .enum(["created_at_desc", "created_at_asc", "updated_at_desc"])
  .optional()
  .describe("Orden de los resultados. created_at_desc (default), created_at_asc, updated_at_desc");

// ---------------------------------------------------------------------------
// Base field: content constraints reused across create and update schemas
// ---------------------------------------------------------------------------
const ContentField = z
  .string()
  .min(1, "El contenido no puede estar vacío")
  .max(10_000, "El contenido no puede superar 10.000 caracteres");

// ---------------------------------------------------------------------------
// Schema for creating a memory (content required)
// Used by: save_memory (as .shape spread), save_memories (as array element)
// ---------------------------------------------------------------------------
export const MemoryInputSchema = z.object({
  content: ContentField.describe("El contenido de texto a recordar"),
  category: CategoryEnum,
  tags: z.array(z.string()).optional().describe("Tags para filtrado"),
  metadata: z.record(z.unknown()).optional().describe("Datos estructurados adicionales"),
  expires_at: z.string().nullable().optional()
    .describe("ISO datetime para expiración automática (ej. 2025-12-31T23:59:59Z). null = sin expiración."),
});

// ---------------------------------------------------------------------------
// Optional update fields shared by update_memory and update_memories
// ---------------------------------------------------------------------------
export const UpdateFieldsSchema = z.object({
  content: ContentField.optional().describe("Nuevo contenido"),
  category: CategoryEnum,
  tags: z.array(z.string()).optional().describe("Nuevos tags"),
  metadata: z.record(z.unknown()).optional().describe("Nueva metadata"),
  expires_at: z.string().nullable().optional()
    .describe("ISO datetime de expiración. null = eliminar expiración. Omitir = sin cambio."),
});

// ---------------------------------------------------------------------------
// Schema for a single item in update_memories (id + at least one field)
// ---------------------------------------------------------------------------
export const UpdateItemSchema = z
  .object({
    id: z.string().uuid("Cada id debe ser un UUID válido").describe("El ID de la memoria a actualizar"),
    ...UpdateFieldsSchema.shape,
  })
  .refine(
    ({ content, category, tags, metadata, expires_at }) =>
      content !== undefined || category !== undefined || tags !== undefined || metadata !== undefined || expires_at !== undefined,
    { message: "Cada item debe incluir al menos un campo a actualizar: content, category, tags, metadata o expires_at." }
  );

// ---------------------------------------------------------------------------
// Runtime guard: at least one update field must be provided.
// Used by update_memory handler (tool-layer) and matches UpdateItemSchema.refine() logic.
// ---------------------------------------------------------------------------
export function requireAtLeastOneUpdateField(
  input: { content?: unknown; category?: unknown; tags?: unknown; metadata?: unknown; expires_at?: unknown }
): boolean {
  return (
    input.content !== undefined ||
    input.category !== undefined ||
    input.tags !== undefined ||
    input.metadata !== undefined ||
    input.expires_at !== undefined
  );
}

// ---------------------------------------------------------------------------
// Compact mode + content preview — spread into tool param objects
// Used by: list_memories, search_memories, get_memories
// ---------------------------------------------------------------------------
export const CompactParams = {
  compact: z
    .boolean()
    .optional()
    .describe("Si true, devuelve solo {id,content,category,tags} omitiendo timestamps y metadata"),
  content_preview_len: z
    .number()
    .int()
    .min(20)
    .max(1000)
    .optional()
    .describe(
      "Si se especifica, trunca el campo content a este número de caracteres. Compatible con compact."
    ),
};
