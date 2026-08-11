import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/database.types";

type Level = "info" | "warn" | "error";

/** Log estruturado, fire-and-forget — nunca lança exceção, nunca trava o fluxo principal. */
export async function logEvent(level: Level, source: string, message: string, meta?: Record<string, unknown>) {
  try {
    const db = createServiceClient();
    await db.from("app_logs").insert({ level, source, message, meta: (meta ?? null) as Json });
  } catch {
    // último recurso: stderr. Nunca deixa logging derrubar o caller.
    console.error(`[${level}] ${source}: ${message}`, meta);
  }
}
