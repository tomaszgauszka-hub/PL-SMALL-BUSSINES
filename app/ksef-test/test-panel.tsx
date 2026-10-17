"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Download, FlaskConical, Plus, RefreshCw, Send, ShieldCheck, Trash2 } from "lucide-react";
import { money, parseMoney, today } from "../../lib/domain";
import { parseQuantity } from "../../lib/invoices";
import { testInvoiceInput, testTotals, TEST_STATUS_LABELS } from "../../lib/ksef/test-model";
import type { TestState } from "../../lib/ksef/test-model";
type LineForm = { key: string; name: string; unit: string; quantity: string; price: string; rate: "23" | "8" | "5" | "0" | "zw" };
const newLine = (): LineForm => ({ key: crypto.randomUUID(), name: "Usługa testowa", unit: "szt.", quantity: "1", price: "100,00", rate: "23" });
const time = (date: string | null | undefined) => date ? new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Warsaw" }).format(new Date(date)) : "jeszcze nie sprawdzono";
const fileUrl = (id: string, kind: "xml" | "upo") => `/api/ksef-test?id=${encodeURIComponent(id)}&download=${kind}`;
export default function KsefTestPanel() {
  const [state, setState] = useState<TestState | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState("");
  const [lines, setLines] = useState<LineForm[]>([]), [date, setDate] = useState(today()), [confirmed, setConfirmed] = useState(false), [selectedId, setSelectedId] = useState("");
  const [cooldown, setCooldown] = useState(0), [clock, setClock] = useState(Date.now());
  const busyRef = useRef(false), pendingCreate = useRef<{ fingerprint: string; id: string } | null>(null);
  const load = useCallback(async () => {
    const response = await fetch("/api/ksef-test", { cache: "no-store", credentials: "same-origin" });
    const body = await response.json(); if (!response.ok) throw new Error(body.error || "Nie udało się odczytać laboratorium.");
    setState(body as TestState);
  }, []);
  useEffect(() => { setLines([newLine()]); void load().catch(e => setError((e as Error).message)); }, [load]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setInterval(() => { const now = Date.now(); setClock(now); if (now >= cooldown) setCooldown(0); }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);
  function input() { return testInvoiceInput.parse({ synthetic: confirmed, issueDate: date, lines: lines.map(l => ({ name: l.name, unit: l.unit, quantityMilli: parseQuantity(l.quantity), unitPrice: parseMoney(l.price), vatRate: l.rate })) }); }
  let preview: { net: number; vat: number; gross: number } | null = null;
  try { preview = testTotals(testInvoiceInput.parse({ synthetic: true, issueDate: date, lines: lines.map(l => ({ name: l.name, unit: l.unit, quantityMilli: parseQuantity(l.quantity), unitPrice: parseMoney(l.price), vatRate: l.rate })) })); } catch { /* Validation is shown on submit. */ }
  async function run(payload: Record<string, unknown>, label: string) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(label); setError("");
    try {
      const response = await fetch("/api/ksef-test", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(70000) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Operacja TEST nie została zakończona.");
      setState(body as TestState);
      if (payload.action === "create") { setSelectedId(String(payload.id)); pendingCreate.current = null; }
    } catch (e) {
      setError((e as Error).name === "TimeoutError" ? "Odpowiedź nie dotarła na czas. Odśwież widok i sprawdź status; nie wysyłaj ponownie." : (e as Error).message);
      try { await load(); } catch { /* Preserve the operation error and last known view. */ }
    } finally {
      if (payload.action !== "create") { setCooldown(Date.now() + 10000); setClock(Date.now()); }
      busyRef.current = false; setBusy("");
    }
  }
  function create(event: FormEvent) {
    event.preventDefault();
    try {
      const value = input(), fingerprint = JSON.stringify(value);
      if (pendingCreate.current?.fingerprint !== fingerprint) pendingCreate.current = { fingerprint, id: crypto.randomUUID() };
      void run({ action: "create", id: pendingCreate.current.id, input: value }, "Sprawdzanie XML i zapis…");
    } catch (e) { setError(e instanceof Error && "issues" in e ? (e as Error & { issues: { message: string }[] }).issues.map(issue => issue.message).join(" ") : (e as Error).message); }
  }
  const selected = state?.documents.find(d => d.id === selectedId) ?? state?.documents[0];
  const waiting = state?.documents.filter(d => ["sending", "processing", "unknown"].includes(d.status)).length ?? 0;
  const remaining = Math.max(0, Math.ceil((cooldown - clock) / 1000)), operationDisabled = !!busy || remaining > 0;
  const update = (key: string, patch: Partial<LineForm>) => setLines(old => old.map(line => line.key === key ? { ...line, ...patch } : line));
  return <>
    <section className="ksef-test-title"><span className="badge amber"><FlaskConical size={15} />LABORATORIUM · TEST</span><h1>Przetestuj obieg faktury w KSeF.</h1><p>Fikcyjna JDG, rzeczywiste testowe API Ministerstwa Finansów.</p></section>
    <div className="notice amber"><AlertTriangle size={21} /><span><strong>Wyłącznie fikcyjne dane.</strong> Środowisko MF TEST może współdzielić dane między integratorami. Dokumenty z laboratorium nie wpływają na Twoje PIT, VAT, klientów ani numerację księgową.</span></div>
    {error && <div className="notice danger" role="alert"><AlertTriangle size={20} /><span>{error}</span></div>}
    <div className="ksef-test-toolbar"><span aria-live="polite">{busy || (remaining ? `Następna operacja MF za ${remaining} s` : "Wysyłka i sprawdzanie MF uruchamiane ręcznie")}</span><button className="btn ghost" disabled={!!busy} onClick={() => void load().catch(e => setError((e as Error).message))}><RefreshCw size={16} />Odśwież widok</button></div>
    {!state ? <article className="panel ksef-test-padding" aria-busy="true"><p>Wczytywanie Twojego laboratorium…</p></article> : <>
      <article className="panel ksef-test-identity"><div><span className="eyebrow">FIKCYJNA JDG · KSeF TEST</span><h2>{state.workspace.display_name}</h2><p>Testowy NIP: <strong>{state.workspace.test_nip}</strong></p><small>Ostatnie poprawne uwierzytelnienie: {time(state.workspace.last_auth_at)}</small></div><button className="btn primary" disabled={operationDisabled} onClick={() => void run({ action: "connect" }, "Uwierzytelnianie JDG TEST…")}><ShieldCheck size={17} />Sprawdź połączenie</button></article>
      <div className="ksef-test-metrics"><article className="metric"><span>Dokumenty testowe</span><strong>{state.documents.length}<small> / 100</small></strong><small>Oddzielna ewidencja laboratorium</small></article><article className="metric"><span>Przyjęte przez MF TEST</span><strong>{state.documents.filter(d => d.status === "accepted").length}</strong><small>Z nadanym numerem KSeF TEST</small></article><article className="metric"><span>Oczekują na sprawdzenie</span><strong>{waiting}</strong><small>Przetwarzanie lub nieustalony wynik</small></article></div>
      <article className="panel"><div className="panel-heading"><div><h2>Nowa faktura testowa</h2><p>Sprzedawca i nabywca są fikcyjni. Krajowa sprzedaż PLN, do 20 pozycji.</p></div><FlaskConical size={23} /></div>
        <form className="form-body" onSubmit={create}><fieldset disabled={!!busy} className="ksef-test-fieldset"><label className="field ksef-test-date"><span>Data wystawienia</span><input type="date" value={date} min="2025-01-01" max={today()} required onChange={e => setDate(e.target.value)} /></label>
          <div className="ksef-test-lines">{lines.map((line, i) => <div className="ksef-test-line" key={line.key}>
            <label className="field"><span>Fikcyjny produkt / usługa {i + 1}</span><input required maxLength={200} value={line.name} onChange={e => update(line.key, { name: e.target.value })} /></label>
            <label className="field"><span>Jednostka</span><input required maxLength={20} value={line.unit} onChange={e => update(line.key, { unit: e.target.value })} /></label>
            <label className="field"><span>Ilość</span><input required inputMode="decimal" value={line.quantity} onChange={e => update(line.key, { quantity: e.target.value })} /></label>
            <label className="field"><span>Cena netto PLN</span><input required inputMode="decimal" value={line.price} onChange={e => update(line.key, { price: e.target.value })} /></label>
            <label className="field"><span>VAT</span><select value={line.rate} onChange={e => update(line.key, { rate: e.target.value as LineForm["rate"] })}>{["23", "8", "5", "0", "zw"].map(rate => <option key={rate} value={rate}>{rate === "zw" ? "zw." : rate + "%"}</option>)}</select></label>
            <button type="button" className="icon-btn" aria-label={`Usuń pozycję ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines(old => old.filter(l => l.key !== line.key))}><Trash2 size={17} /></button>
          </div>)}</div>
          <button type="button" className="btn ghost small" disabled={lines.length >= 20} onClick={() => setLines(old => [...old, newLine()])}><Plus size={16} />Dodaj pozycję</button>
          <div className="ksef-test-totals"><span>Netto <strong>{preview ? money(preview.net) : "—"}</strong></span><span>VAT <strong>{preview ? money(preview.vat) : "—"}</strong></span><span>Brutto <strong>{preview ? money(preview.gross) : "—"}</strong></span></div>
          {lines.some(l => l.rate === "zw") && <p className="inline-note">„zw.” używa fikcyjnego przykładu zwolnienia z art. 113 ust. 1 ustawy o VAT. Dobór stawek w laboratorium służy testowaniu XML.</p>}
          <label className="ksef-test-confirm"><input type="checkbox" checked={confirmed} required onChange={e => setConfirmed(e.target.checked)} /><span>Potwierdzam, że wszystkie wpisane nazwy i dane są fikcyjne i przeznaczone wyłącznie do testów.</span></label>
          <div className="form-actions"><small>Zapis sprawdza FA(3). Wysyłkę uruchomisz osobnym przyciskiem.</small><button className="btn primary" disabled={!confirmed || !preview || state.documents.length >= 100}><CheckCircle2 size={17} />Sprawdź XML i zapisz</button></div>
        </fieldset></form>
      </article>
      <article className="panel"><div className="panel-heading"><div><h2>Faktury laboratorium</h2><p>„Przyjęta” wymaga odpowiedzi MF i numeru KSeF. UPO pobierzesz po jego udostępnieniu.</p></div><span className="badge amber">TEST</span></div>
        {state.documents.length ? <div className="table-scroll"><table><thead><tr><th>Dokument</th><th>Stan MF TEST</th><th className="right">Brutto</th><th>Akcje</th></tr></thead><tbody>{state.documents.map(doc => <tr key={doc.id}><td><button className="table-link" onClick={() => setSelectedId(doc.id)}><span><strong>{doc.number}</strong><small>{time(doc.created_at)}</small></span></button></td><td><span className={"badge " + (doc.status === "accepted" ? "green" : ["rejected", "unknown", "blocked"].includes(doc.status) ? "amber" : "gray")}>{TEST_STATUS_LABELS[doc.status] || doc.status}</span>{doc.status === "accepted" && !doc.upo_hash && <small>UPO w przygotowaniu</small>}</td><td className="right amount">{money(doc.gross)}</td><td><div className="ksef-test-actions">{doc.status === "ready" ? <button className="btn primary small" disabled={operationDisabled} onClick={() => void run({ action: "send", id: doc.id }, "Wysyłanie do KSeF TEST…")}><Send size={15} />Wyślij do TEST</button> : <button className="btn ghost small" disabled={operationDisabled || (doc.status === "accepted" && !!doc.upo_hash) || doc.status === "rejected"} onClick={() => void run({ action: "refresh", id: doc.id }, "Sprawdzanie wyniku i UPO…")}><RefreshCw size={15} />Sprawdź status</button>}<a className="btn ghost small" href={fileUrl(doc.id, "xml")}><Download size={15} />XML TEST</a>{doc.upo_hash && <a className="btn ghost small" href={fileUrl(doc.id, "upo")}><Download size={15} />UPO TEST</a>}</div></td></tr>)}</tbody></table></div> : <div className="empty"><FlaskConical size={34} /><h3>Tu zobaczysz pierwszą próbę.</h3><p>Przygotuj fikcyjną fakturę w formularzu powyżej.</p></div>}
      </article>
      {selected && <article className="panel"><div className="panel-heading"><div><h2>Szczegóły próby</h2><p className="ksef-test-wrap">{selected.number}</p></div><span className="badge amber">TEST</span></div><div className="ksef-test-padding"><p role="status">{selected.message}</p><dl className="ksef-test-details"><div><dt>Numer KSeF TEST</dt><dd>{selected.ksef_number || "jeszcze nie nadano"}</dd></div><div><dt>Sesja MF TEST</dt><dd>{selected.session_reference || "jeszcze nie otwarto"}</dd></div><div><dt>Referencja faktury</dt><dd>{selected.invoice_reference || "jeszcze nie otrzymano"}</dd></div><div><dt>SHA-256 XML</dt><dd>{selected.invoice_hash}</dd></div><div><dt>UPO</dt><dd>{selected.upo_hash ? "Pobrane i sprawdzone" : "Oczekuje na udostępnienie"}</dd></div></dl>
        {(selected.events?.length ?? 0) > 0 && <ol className="ksef-test-events">{selected.events!.slice(-8).map((event, i) => <li key={event.at + i}><span className="tiny-dot" /><div><strong>{TEST_STATUS_LABELS[event.status] || event.status}</strong><p>{event.message}</p><small>{time(event.at)}</small></div></li>)}</ol>}
      </div></article>}
    </>}
  </>;
}
