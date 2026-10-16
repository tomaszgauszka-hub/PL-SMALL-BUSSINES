import { z } from "zod";
import { serverSupabase } from "../../../lib/supabase/server";
import { supabaseConfigured } from "../../../lib/supabase/config";
import { appOrigin, json, sameOrigin } from "../../../lib/http";
export const dynamic = "force-dynamic";
const input = z.object({ action: z.enum(["login", "signup", "reset", "password", "resend"]), email: z.string().trim().email().max(254).optional(), password: z.string().max(256).optional(), businessType: z.enum(["dn", "jdg"]).optional() }).superRefine((p, ctx) => { if (p.action === "signup" && !p.businessType) ctx.addIssue({ code: "custom", message: "Wybierz rodzaj działalności." }); });
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Nieprawidłowe źródło żądania." }, 403);
  if (!supabaseConfigured()) return json({ error: "Logowanie czeka na podłączenie projektu Supabase. Nie zapisujemy haseł lokalnie." }, 503);
  try {
    const text = await request.text(); if (text.length > 4000) return json({ error: "Za duże żądanie." }, 413);
    const p = input.parse(JSON.parse(text)); const supabase = await serverSupabase(); const origin = appOrigin(request);
    if (["login", "signup", "reset", "resend"].includes(p.action) && !p.email) return json({ error: "Podaj adres email." }, 400);
    if (["signup", "password"].includes(p.action) && (!p.password || p.password.length < 12)) return json({ error: "Hasło musi mieć co najmniej 12 znaków." }, 400);
    if (p.action === "login") { const { error } = await supabase.auth.signInWithPassword({ email: p.email!, password: p.password ?? "" }); if (error) return json({ error: error.code === "email_not_confirmed" ? "Potwierdź adres email linkiem z wiadomości." : "Nieprawidłowy email lub hasło. Spróbuj ponownie." }, 400); return json({ ok: true }); }
    if (p.action === "signup") {
      const { data, error } = await supabase.auth.signUp({ email: p.email!, password: p.password!, options: { emailRedirectTo: origin + "/auth/callback", data: { ewidora_business_type: p.businessType } } });
      if (error) return json({ error: error.status === 429 ? "Zbyt wiele prób. Odczekaj chwilę." : "Nie udało się utworzyć konta. Jeśli masz już konto w TaskOn, zaloguj się tym samym emailem i hasłem albo odzyskaj dostęp." }, error.status === 429 ? 429 : 400);
      if (data.session) await supabase.rpc("mk_business_mutate", { p_op_id: crypto.randomUUID(), p_action: "register", p_data: { businessType: p.businessType } });
      return json({ ok: true, confirmation: !data.session, message: "Sprawdź pocztę i potwierdź adres email. Jeśli konto już istnieje, zaloguj się lub zresetuj hasło." });
    }
    if (p.action === "reset") { const { error } = await supabase.auth.resetPasswordForEmail(p.email!, { redirectTo: origin + "/auth/callback?next=/reset-password" }); if (error?.status === 429) return json({ error: "Zbyt wiele prób. Odczekaj chwilę." }, 429); if (error) return json({ error: "Nie udało się wysłać wiadomości. Spróbuj ponownie później." }, 400); return json({ ok: true, message: "Jeśli konto istnieje, otrzymasz wiadomość z linkiem do zmiany hasła." }); }
    if (p.action === "resend") { const { error } = await supabase.auth.resend({ type: "signup", email: p.email!, options: { emailRedirectTo: origin + "/auth/callback" } }); if (error) return json({ error: "Nie udało się ponowić wysyłki. Odczekaj chwilę i spróbuj ponownie." }, 400); return json({ ok: true, message: "Sprawdź skrzynkę, w tym folder spam." }); }
    const { data: { user }, error: userError } = await supabase.auth.getUser(); if (userError || !user || user.is_anonymous) return json({ error: "Otwórz link z wiadomości odzyskiwania hasła lub zaloguj się." }, 401);
    const { error } = await supabase.auth.updateUser({ password: p.password! }); if (error) return json({ error: "Nie udało się zmienić hasła. Użyj nowego linku odzyskiwania." }, 400); return json({ ok: true, message: "Hasło zmienione." });
  } catch (e) { if (e instanceof z.ZodError || e instanceof SyntaxError) return json({ error: "Sprawdź poprawność formularza." }, 400); return json({ error: "Usługa logowania jest chwilowo niedostępna." }, 503); }
}
