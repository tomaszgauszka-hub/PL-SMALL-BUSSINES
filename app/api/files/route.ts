import { currentUser, serverSupabase } from "../../../lib/supabase/server";
import { json, sameOrigin } from "../../../lib/http";
import { evidenceMime, MAX_EVIDENCE_BYTES } from "../../../lib/attachments";
export const dynamic = "force-dynamic";
const BUCKET = "mk-evidence";
export async function GET(request: Request) {
  const user = await currentUser(); if (!user) return json({ error: "Zaloguj się." }, 401);
  const id = new URL(request.url).searchParams.get("id"); if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Nie znaleziono pliku." }, 404);
  const db = await serverSupabase(); const expenseFile = await db.from("mk_attachments").select("key,name,mime").eq("id", id).eq("owner", user.id).maybeSingle();
  const { data: row, error } = expenseFile.data ? expenseFile : await db.from("mk_invoice_attachments").select("key,name,mime").eq("id", id).eq("owner", user.id).maybeSingle();
  if (error || !row) return json({ error: "Nie znaleziono pliku." }, 404);
  const { data: file, error: fileError } = await db.storage.from(BUCKET).download(row.key); if (fileError || !file) return json({ error: "Plik jest chwilowo niedostępny." }, 503);
  return new Response(file, { headers: { "Content-Type": row.mime, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Nieprawidłowe źródło żądania." }, 403);
  const user = await currentUser(); if (!user) return json({ error: "Zaloguj się." }, 401);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_EVIDENCE_BYTES + 64 * 1024) return json({ error: "Limit pliku to 4 MB." }, 413);
  const db = await serverSupabase(); let key = "";
  try {
    const form = await request.formData(); const file = form.get("file"), expenseId = String(form.get("expenseId") ?? ""), invoiceId = String(form.get("invoiceId") ?? "");
    if (Boolean(expenseId) === Boolean(invoiceId)) return json({ error: "Wybierz jeden dokument dla załącznika." }, 400);
    if (!(file instanceof File) || !file.size || file.size > MAX_EVIDENCE_BYTES) return json({ error: "Wybierz plik do 4 MB." }, 400);
    const { data: target } = await db.from(invoiceId ? "mk_invoices" : "mk_expenses").select("id").eq("id", invoiceId || expenseId).eq("owner", user.id).maybeSingle(); if (!target) return json({ error: "Nie znaleziono dokumentu." }, 404);
    const buf = await file.arrayBuffer(), b = new Uint8Array(buf);
    const mime = evidenceMime(b);
    if (!mime) return json({ error: "Obsługiwane formaty to PDF, JPG i PNG." }, 400);
    const id = crypto.randomUUID(); key = user.id + "/" + id; const name = file.name.replace(/[\r\n]/g, "").slice(0, 200);
    const { error: uploadError } = await db.storage.from(BUCKET).upload(key, buf, { contentType: mime, upsert: false }); if (uploadError) throw uploadError;
    const { error } = invoiceId ? await db.rpc("mk_attach_invoice_file", { p_id: id, p_invoice_id: invoiceId, p_name: name, p_mime: mime, p_size: file.size, p_key: key }) : await db.rpc("mk_attach_file", { p_id: id, p_expense_id: expenseId, p_name: name, p_mime: mime, p_size: file.size, p_key: key });
    if (error) throw error; return json({ ok: true, id });
  } catch { if (key) await db.storage.from(BUCKET).remove([key]); return json({ error: "Nie udało się zapisać załącznika. Dokument pozostaje w bazie." }, 503); }
}
