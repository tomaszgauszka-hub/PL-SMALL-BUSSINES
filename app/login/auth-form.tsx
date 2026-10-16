"use client";
import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";

type Mode = "login" | "signup" | "reset" | "password" | "resend";
const copy: Record<Mode, { title: string; description: string; button: string }> = {
  login: { title: "Dobrze Cię widzieć.", description: "Zaloguj się, aby otworzyć swoją prywatną bazę.", button: "Zaloguj się" },
  signup: { title: "Zacznij swoją Małą Księgę.", description: "Utwórz konto, aby prowadzić prywatną ewidencję.", button: "Utwórz konto" },
  reset: { title: "Odzyskaj dostęp.", description: "Wyślemy link na adres przypisany do konta.", button: "Wyślij link" },
  password: { title: "Ustaw nowe hasło.", description: "Otwórz tę stronę z linku odzyskiwania hasła.", button: "Zapisz nowe hasło" },
  resend: { title: "Potwierdź swój email.", description: "Podaj adres użyty przy rejestracji. Wyślemy nowy link.", button: "Wyślij potwierdzenie" },
};
export default function AuthForm({ configured, recovery = false, linkError = false }: { configured: boolean; recovery?: boolean; linkError?: boolean }) {
  const [mode, setMode] = useState<Mode>(recovery ? "password" : "login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(linkError ? "Link wygasł albo został już użyty. Poproś o nowy." : "");
  const [message, setMessage] = useState("");
  function changeMode(next: Mode) { setMode(next); setMessage(""); setError(""); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !configured) return;
    setBusy(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (["signup", "password"].includes(mode) && password !== form.get("confirm")) {
      setError("Hasła nie są takie same."); setBusy(false); return;
    }
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: mode, ...(mode !== "password" ? { email: form.get("email") } : {}), password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Usługa jest chwilowo niedostępna.");
      if (mode === "login" || mode === "password" || (mode === "signup" && !result.confirmation)) window.location.assign("/");
      else setMessage(result.message);
    } catch (err) { setError(err instanceof Error ? err.message : "Spróbuj ponownie."); }
    finally { setBusy(false); }
  }
  const content = copy[mode];
  return <main className="auth-page">
    <a className="auth-back" href="/"><ArrowLeft size={16} />Wróć do aplikacji</a>
    <section className="auth-layout">
      <div className="auth-story">
        <a className="brand" href="/"><span className="brand-mark"><BookOpen size={25} /></span><span>mała<span className="brand-light">księga</span></span></a>
        <span className="eyebrow">TWOJA DZIAŁALNOŚĆ. TWÓJ SPOKÓJ.</span>
        <h1>Mniej papierów.<br />Więcej swojego.</h1>
        <p>Sprzedaż, koszty, klienci i rozliczenie roczne. Wszystko w jednym miejscu, na telefonie i komputerze.</p>
        <div className="auth-points"><span><CheckCircle2 size={18} />Osobna ewidencja sprzedaży i wpłat</span><span><CheckCircle2 size={18} />Prywatna baza przypisana do konta</span><span><CheckCircle2 size={18} />Raporty, eksporty i kontrola limitu</span></div>
        <div className="auth-security"><ShieldCheck size={23} /><span>Twoje dane należą do Ciebie.<small>Hasło nie trafia do Twojej ewidencji rozliczeń.</small></span></div>
      </div>
      <div className="auth-card">
        <span className="auth-lock"><LockKeyhole size={24} /></span><h2>{content.title}</h2><p>{content.description}</p>
        {['login', 'signup'].includes(mode) && <p>Masz już konto w TaskOn? Zaloguj się tym samym emailem i hasłem.</p>}
        {['reset', 'password'].includes(mode) && <p>Zmiana hasła obejmie również Twoje konto w TaskOn.</p>}
        {!configured && <div className="notice amber"><span>Logowanie nie jest jeszcze uruchomione w tym wdrożeniu.</span></div>}
        {message && <div className="notice info" role="status"><CheckCircle2 size={18} /><span>{message}</span></div>}
        <form onSubmit={submit} key={mode} aria-busy={busy}>
          {mode !== "password" && <label className="field"><span>Adres email</span><input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="ty@przyklad.pl" /></label>}
          {["login", "signup", "password"].includes(mode) && <label className="field"><span>Hasło</span><input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "login" ? 1 : 12} maxLength={256} placeholder={mode === "login" ? "Twoje hasło" : "Co najmniej 12 znaków"} /></label>}
          {["signup", "password"].includes(mode) && <label className="field"><span>Powtórz hasło</span><input name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={256} /></label>}
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="btn primary auth-submit" disabled={busy || !configured}>{busy ? "Chwilę…" : content.button}<ArrowRight size={17} /></button>
          {mode === "login" && <><button className="auth-text" type="button" disabled={busy} onClick={() => changeMode("reset")}>Nie pamiętam hasła</button><button className="auth-text" type="button" disabled={busy} onClick={() => changeMode("resend")}>Wyślij ponownie potwierdzenie email</button></>}
        </form>
        {mode !== "password" && <div className="auth-switch">{mode === "signup" ? "Masz już konto?" : mode === "login" ? "Nie masz jeszcze konta?" : "Wracasz do aplikacji?"}<button disabled={busy} onClick={() => changeMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Utwórz konto" : "Zaloguj się"}</button></div>}
        <a className="auth-demo" href="/">Chcę najpierw zobaczyć demonstrację</a>
      </div>
    </section>
  </main>;
}
