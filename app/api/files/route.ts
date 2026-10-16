import { currentUser, serverSupabase } from "../../../lib/supabase/server";
import { json, sameOrigin } from "../../../lib/http";
export const dynamic = "force-dynamic";
const BUCKET = "mk-evidence";
export async function GET(request: Request) {
  const user = await currentUser(); if (!user) return json({ error: "Zaloguj się." }, 401);
  const id = new URL(request.url).searchParams.get("id"); if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Nie znaleziono pliku." }, 404);
  const db = await serverSupabase(); const { data: row, error } = await db.from("mk_attachments").select("key,name,mime").eq("id", id).eq("owner", user.id).maybeSingle();
  if (error || !row) return json({ error: "Nie znaleziono pliku." }, 404);
  const { data: file, error: fileError } = await db.storage.from(BUCKET).download(row.key); if (fileError || !file) return json({ error: "Plik jest chwilowo niedostępny." }, 503);
  return new Response(file, { headers: { "Content-Type": row.mime, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Nieprawidłowe źródło żądania." }, 403);
  const user = await currentUser(); if (!user) return json({ error: "Zaloguj się." }, 401);
  if (Number(request.headers.get("content-length") ?? 0) > 6 * 1024 * 1024) return json({ error: "Limit pliku to 5 MB." }, 413);
  const db = await serverSupabase(); let key = "";
  try {
    const form = await request.formData(); const file = form.get("file"), expenseId = String(form.get("expenseId") ?? "");
    if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) return json({ error: "Wybierz plik do 5 MB." }, 400);
    const { data: expense } = await db.from("mk_expenses").select("id").eq("id", expenseId).eq("owner", user.id).maybeSingle(); if (!expense) return json({ error: "Nie znaleziono wydatku." }, 404);
    const buf = await file.arrayBuffer(), b = new Uint8Array(buf);
    const mime = b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 ? "application/pdf" : b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? "image/jpeg" : b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 ? "image/png" : "";
    if (!mime) return json({ error: "Obsługiwane formaty to PDF, JPG i PNG." }, 400);
    const id = crypto.randomUUID(); key = user.id + "/" + id; const name = file.name.replace(/[\r\n]/g, "").slice(0, 200);
    const { error: uploadError } = await db.storage.from(BUCKET).upload(key, buf, { contentType: mime, upsert: false }); if (uploadError) throw uploadError;
    const { error } = await db.rpc("mk_attach_file", { p_id: id, p_expense_id: expenseId, p_name: name, p_mime: mime, p_size: file.size, p_key: key });
    if (error) throw error; return json({ ok: true, id });
  } catch { if (key) await db.storage.from(BUCKET).remove([key]); return json({ error: "Nie udało się zapisać załącznika. Wydatek pozostaje w bazie." }, 503); }
}
