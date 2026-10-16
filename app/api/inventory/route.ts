import { z } from "zod";
import { currentUser, serverSupabase } from "../../../lib/supabase/server";
import { json, sameOrigin } from "../../../lib/http";
import { inventoryInput, inventoryRestoreInput } from "../../../lib/inventory";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!await currentUser()) return json({ error: "Zaloguj się." }, 401);
  const db = await serverSupabase(), result = await db.rpc("mk_inventory_state");
  return result.error ? json({ error: "Nie udało się wczytać spisów z natury." }, 503) : json(result.data);
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Nieprawidłowe źródło żądania." }, 403);
  if (!await currentUser()) return json({ error: "Zaloguj się." }, 401);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Wymagany JSON." }, 415);
  try {
    const raw = await request.text(); if (raw.length > 300000) return json({ error: "Spis jest za duży." }, 413);
    const { opId, action, data } = z.object({ opId: z.string().uuid(), action: z.enum(["save", "discard", "restore"]), data: z.unknown() }).parse(JSON.parse(raw));
    const payload = action === "save" ? inventoryInput.parse(data) : action === "restore" ? inventoryRestoreInput.parse(data) : z.object({ id: z.string().uuid(), version: z.number().int().positive() }).parse(data);
    const db = await serverSupabase(), result = await db.rpc("mk_inventory_mutate", { p_op_id: opId, p_action: action, p_data: payload });
    if (result.error) return json({ error: ["P0001", "40001"].includes(result.error.code) ? result.error.message : "Nie udało się zapisać spisu." }, result.error.code === "40001" ? 409 : result.error.code === "P0001" ? 400 : 503);
    const state = await db.rpc("mk_inventory_state");
    return state.error ? json({ error: "Zapisano spis, ale odczyt się nie powiódł. Ponów tę samą operację." }, 503) : json(state.data);
  } catch (error) { return json({ error: error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(" ") : "Nieprawidłowe dane spisu." }, 400); }
}
