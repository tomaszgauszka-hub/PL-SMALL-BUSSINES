import { z } from "zod";
import { currentUser, serverSupabase } from "../../../lib/supabase/server";
import { json, sameOrigin } from "../../../lib/http";
import { jdgMonthInput, jdgYearInput } from "../../../lib/jdg-tax";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!await currentUser()) return json({ error: "Zaloguj się." }, 401);
  const db = await serverSupabase(), result = await db.rpc("mk_jdg_tax_state");
  return result.error ? json({ error: "Nie udało się wczytać ustawień podatkowych JDG." }, 503) : json(result.data);
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Nieprawidłowe źródło żądania." }, 403);
  if (!await currentUser()) return json({ error: "Zaloguj się." }, 401);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Wymagany JSON." }, 415);
  try {
    const raw = await request.text(); if (raw.length > 12000) return json({ error: "Za dużo danych." }, 413);
    const { opId, action, data } = z.object({ opId: z.string().uuid(), action: z.enum(["year", "month"]), data: z.unknown() }).parse(JSON.parse(raw));
    const payload = action === "year" ? jdgYearInput.parse(data) : jdgMonthInput.parse(data);
    const db = await serverSupabase(), result = await db.rpc("mk_jdg_tax_mutate", { p_op_id: opId, p_action: action, p_data: payload });
    if (result.error) return json({ error: result.error.code === "P0001" || result.error.code === "40001" ? result.error.message : "Nie udało się zapisać ustawień podatkowych." }, result.error.code === "40001" ? 409 : result.error.code === "P0001" ? 400 : 503);
    const state = await db.rpc("mk_jdg_tax_state");
    return state.error ? json({ error: "Zapisano dane, ale odczyt się nie powiódł. Ponów tę samą operację." }, 503) : json(state.data);
  } catch (error) { return json({ error: error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(" ") : "Nieprawidłowe dane." }, 400); }
}
