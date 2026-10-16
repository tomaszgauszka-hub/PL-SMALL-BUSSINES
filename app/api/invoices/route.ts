import { z } from "zod";
import { currentUser, serverSupabase } from "../../../lib/supabase/server";
import { json, sameOrigin } from "../../../lib/http";
import { invoiceInput, invoicePaymentInput, invoicePaymentReversalInput, invoiceRestoreInput, invoicePaymentRestoreInput } from "../../../lib/invoices";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!await currentUser()) return json({ error: "Zaloguj się." }, 401);
  const db = await serverSupabase(); const { data, error } = await db.rpc("mk_invoice_state");
  return error ? json({ error: "Nie udało się wczytać ewidencji faktur." }, 503) : json(data);
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Nieprawidłowe źródło żądania." }, 403);
  if (!await currentUser()) return json({ error: "Zaloguj się." }, 401);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Wymagany JSON." }, 415);
  try {
    const raw = await request.text(); if (raw.length > 120000) return json({ error: "Dokument jest za duży." }, 413);
    const { opId, action, data } = z.object({ opId: z.string().uuid(), action: z.enum(["invoice", "payment", "reversePayment", "restoreInvoice", "restorePayment"]), data: z.unknown() }).parse(JSON.parse(raw));
    const validators = { invoice: invoiceInput, payment: invoicePaymentInput, reversePayment: invoicePaymentReversalInput, restoreInvoice: invoiceRestoreInput, restorePayment: invoicePaymentRestoreInput };
    const payload = validators[action].parse(data);
    const db = await serverSupabase(); const { error } = await db.rpc("mk_invoice_mutate", { p_op_id: opId, p_action: action, p_data: payload });
    if (error) {
      if (["23505", "40001"].includes(error.code)) return json({ error: error.code === "40001" ? error.message : "Ten numer dokumentu albo wpis już istnieje. Odśwież dane i sprawdź faktury." }, 409);
      if (error.code === "P0001") return json({ error: error.message }, 400);
      console.error("invoice_write", error.code); return json({ error: "Nie udało się zapisać dokumentu. Ponów próbę; identyfikator operacji chroni przed podwojeniem." }, 503);
    }
    const result = await db.rpc("mk_invoice_state");
    return result.error ? json({ error: "Zapisano dokument, ale odczyt stanu się nie powiódł. Ponów operację." }, 503) : json(result.data);
  } catch (error) { return json({ error: error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(" ") : "Nieprawidłowe dane dokumentu." }, 400); }
}
