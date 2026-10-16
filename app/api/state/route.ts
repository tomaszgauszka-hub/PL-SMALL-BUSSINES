import { currentUser, serverSupabase } from "../../../lib/supabase/server";
import { json, sameOrigin } from "../../../lib/http";
import { mutationInput, clientInput, saleInput, paymentInput, expenseInput, settingsInput, taxInput, backupInput } from "../../../lib/validation";
import { ZodError } from "zod";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await currentUser(); if (!user) return json({ error: "Zaloguj się, aby otworzyć prywatną bazę." }, 401);
  const db = await serverSupabase(); const { data, error } = await db.rpc("mk_get_state");
  if (error) { console.error("state_read", error.code); return json({ error: "Baza jest chwilowo niedostępna. Spróbuj ponownie." }, 503); }
  return json(data);
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Nieprawidłowe źródło żądania." }, 403);
  const user = await currentUser(); if (!user) return json({ error: "Zaloguj się, aby zapisać dane." }, 401);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Wymagany JSON." }, 415);
  try {
    const text = await request.text(); if (text.length > 1000000) return json({ error: "Za dużo danych w jednym zapisie." }, 413);
    const { opId, action, data } = mutationInput.parse(JSON.parse(text));
    const parsers = { client: clientInput, sale: saleInput, payment: paymentInput, expense: expenseInput, settings: settingsInput, tax: taxInput };
    const payload = action === "import" ? backupInput.parse(data) : parsers[action].parse(data);
    const db = await serverSupabase(); const { data: result, error } = await db.rpc("mk_mutate", { p_op_id: opId, p_action: action, p_data: payload });
    if (error) { const conflict = ["23505", "40001"].includes(error.code); if (conflict) return json({ error: "Dane zmieniły się na innym urządzeniu lub numer już istnieje. Zamknij formularz i otwórz go ponownie." }, 409); if (["23503", "23514", "22P02", "22003", "P0001"].includes(error.code)) return json({ error: error.code === "P0001" ? error.message : "Nieprawidłowe dane lub powiązanie. Sprawdź formularz." }, 400); console.error("state_write", error.code); return json({ error: "Zapis się nie udał. Ponów próbę; identyfikator operacji chroni przed podwojeniem." }, 503); }
    return json({ ok: true, ...result });
  } catch (e) { if (e instanceof ZodError) return json({ error: e.issues.map(i => i.message).join(" ") }, 400); return json({ error: "Nieprawidłowe dane." }, 400); }
}
