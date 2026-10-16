import { serverSupabase } from "../../../lib/supabase/server";
import { json, sameOrigin } from "../../../lib/http";
export async function POST(request: Request) { if (!sameOrigin(request)) return json({ error: "Nieprawidłowe źródło." }, 403); const db = await serverSupabase(); const { error } = await db.auth.signOut({ scope: "local" }); return error ? json({ error: "Nie udało się wylogować. Ponów próbę." }, 503) : json({ ok: true }); }
