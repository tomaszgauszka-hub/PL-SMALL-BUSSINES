"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Archive, ArrowRight, CheckCircle2, Download, Package, Pencil, Plus, Search, ShieldCheck, X } from "lucide-react";
import { businessLabel, defaultBusinessProfile, demoBusinessState, emptyBusinessState, LUMP_SUM_RATES, TAX_FORM_LABELS, VAT_RATES } from "../lib/business";
import { demoJdgProducts, demoJdgProfile } from "../lib/demo-jdg";
import type { BusinessState, BusinessType, CatalogItem } from "../lib/business";
import { businessProfileInput, catalogItemInput } from "../lib/business-validation";
import { dateLabel, decimal, money, parseMoney, today, toCsv } from "../lib/domain";

export function useBusinessData(signedIn: boolean, registrationType: BusinessType | null) {
  const [state, setState] = useState<BusinessState>(() => signedIn ? emptyBusinessState() : { profile: demoJdgProfile(), events: [], products: demoJdgProducts() });
  const [loading, setLoading] = useState(signedIn), [error, setError] = useState("");
  const pending = useRef<{ fingerprint: string; opId: string } | null>(null);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    if (!signedIn) return;
    const version = ++sequence.current;
    try {
      const response = await fetch("/api/business", { cache: "no-store" });
      let body = await response.json();
      if (!response.ok) throw new Error(body.error || "Nie udało się wczytać katalogu.");
      if (!body.profile && registrationType) {
        const initialized = await fetch("/api/business", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opId: crypto.randomUUID(), action: "register", data: { businessType: registrationType } }) });
        body = await initialized.json();
        if (!initialized.ok) throw new Error(body.error);
      }
      if (version === sequence.current) { setState(body); setError(""); }
    } catch (e) { if (version === sequence.current) setError((e as Error).message); }
    finally { if (version === sequence.current) setLoading(false); }
  }, [signedIn, registrationType]);
  useEffect(() => {
    let active = true;
    const run = () => { if (active && !document.hidden) void refresh(); };
    run(); const timer = setInterval(run, 30000); window.addEventListener("focus", run);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", run); };
  }, [refresh]);
  async function mutate(action: "register" | "profile" | "product", data: unknown) {
    if (!signedIn) {
      if (action !== "product") throw new Error("Zaloguj się, aby zmienić rodzaj działalności.");
      const item = catalogItemInput.parse(data) as CatalogItem;
      setState(old => ({ ...old, products: old.products.filter(p => p.id !== item.id).concat({ ...item, version: item.version + 1 }).sort((a, b) => a.name.localeCompare(b.name, "pl")) }));
      return;
    }
    const fingerprint = JSON.stringify({ action, data });
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, opId: crypto.randomUUID() };
    const response = await fetch("/api/business", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opId: pending.current.opId, action, data }) });
    const body = await response.json();
    if (!response.ok) { if (response.status === 409) { pending.current = null; await refresh(); } throw new Error(body.error || "Nie udało się zapisać danych."); }
    pending.current = null; sequence.current++; setState(body); setLoading(false); setError("");
  }
  function previewType(type: BusinessType) { if (signedIn) return; setState(old => ({ ...old, profile: type === "jdg" ? demoJdgProfile() : { ...defaultBusinessProfile("dn"), configured: true }, products: type === "jdg" ? demoJdgProducts() : demoBusinessState().products })); }
  return { state, loading, error, refresh, mutate, previewType };
}
export type BusinessData = ReturnType<typeof useBusinessData>;

export function ProductCatalog({ business }: { business: BusinessData }) {
  const [query, setQuery] = useState(""), [filter, setFilter] = useState("active");
  const [editing, setEditing] = useState<CatalogItem | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const firstInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) firstInput.current?.focus(); }, [editing?.id]);
  const rows = business.state.products.filter(p => (!query || [p.name, p.sku, p.description].join(" ").toLowerCase().includes(query.toLowerCase())) && (filter === "all" || (filter === "archived" ? p.archived : !p.archived)));
  function edit(item?: CatalogItem) { setError(""); setMessage(""); setEditing(item ?? { id: crypto.randomUUID(), name: "", kind: "service", sku: "", unit: "usł.", unitPrice: 0, vatRate: business.state.profile?.vatStatus === "active" ? "23" : "zw", lumpSumRate: 850, description: "", archived: false, version: 0 }); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing || busy) return; setBusy(true); setError("");
    try {
      const fd = new FormData(event.currentTarget), value = (key: string) => String(fd.get(key) ?? "");
      const parsed = catalogItemInput.safeParse({ ...editing, name: value("name"), kind: value("kind"), sku: value("sku"), unit: value("unit"), unitPrice: parseMoney(value("unitPrice")), vatRate: value("vatRate"), lumpSumRate: Number(value("lumpSumRate")), description: value("description") });
      if (!parsed.success) throw new Error(parsed.error.issues.map(issue => issue.message).join(" "));
      await business.mutate("product", parsed.data); setEditing(null); setMessage("Pozycja katalogu zapisana.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function archive(item: CatalogItem) { if (busy) return; setBusy(true); setError(""); try { await business.mutate("product", { ...item, archived: !item.archived }); setMessage(item.archived ? "Przywrócono pozycję." : "Zarchiwizowano pozycję. Historyczne dokumenty zachowują jej dane."); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  function csv() {
    const content = toCsv([["Nazwa", "Typ", "Kod", "Jednostka", "Cena netto PLN", "VAT", "Ryczałt %", "Opis", "Archiwalny"], ...rows.map(p => [p.name, p.kind === "product" ? "Produkt" : "Usługa", p.sku, p.unit, decimal(p.unitPrice).replace(".", ","), p.vatRate, p.lumpSumRate / 100, p.description, p.archived ? "Tak" : "Nie"])]);
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" })), link = document.createElement("a"); link.href = url; link.download = `ewidora-katalog-${today()}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <>
    <div className="catalog-actions"><p className="muted">Stałe ceny i dane pozycji dla Twojej sprzedaży. Zmiana katalogu nie zmienia wcześniejszych dokumentów.</p><button className="btn ghost" onClick={csv} disabled={!rows.length}><Download size={16} />Eksport CSV</button><button className="btn primary" onClick={() => edit()} disabled={busy || business.loading}><Plus size={16} />Dodaj produkt / usługę</button></div>
    {business.error && <div className="form-error" role="alert">{business.error}</div>}{error && <div className="form-error" role="alert">{error}</div>}{message && <div className="notice info" role="status"><CheckCircle2 size={17} /><span>{message}</span></div>}
    {editing && <article className="panel"><div className="panel-heading"><h2>{editing.version ? "Edytuj pozycję katalogu" : "Nowy produkt lub usługa"}</h2><button className="icon-btn" onClick={() => setEditing(null)} disabled={busy} aria-label="Zamknij edycję katalogu"><X size={19} /></button></div><form className="form-body" onSubmit={save} key={editing.id} aria-busy={busy}><div className="form-grid">
      <label className="field wide"><span>Nazwa produktu / usługi</span><input ref={firstInput} name="name" defaultValue={editing.name} required maxLength={160} /></label>
      <label className="field"><span>Rodzaj</span><select name="kind" defaultValue={editing.kind}><option value="service">Usługa</option><option value="product">Produkt</option></select></label>
      <label className="field"><span>Kod / SKU</span><input name="sku" defaultValue={editing.sku} maxLength={60} /></label>
      <label className="field"><span>Jednostka</span><input name="unit" defaultValue={editing.unit} required maxLength={30} list="catalog-units" /><datalist id="catalog-units">{["szt.", "usł.", "godz.", "mb", "m²", "kg", "kpl."].map(unit => <option key={unit}>{unit}</option>)}</datalist></label>
      <label className="field"><span>Cena jednostkowa netto (PLN)</span><input name="unitPrice" defaultValue={decimal(editing.unitPrice)} inputMode="decimal" required /><small>Dla zwolnienia z VAT jest to też cena do zapłaty.</small></label>
      <label className="field"><span>Stawka VAT</span><select name="vatRate" defaultValue={editing.vatRate}>{VAT_RATES.map(rate => <option key={rate} value={rate}>{["zw", "np"].includes(rate) ? rate === "zw" ? "Zwolnione (zw)" : "Nie podlega (np)" : `${rate}%`}</option>)}</select></label>
      <label className="field"><span>Stawka ryczałtu — jeśli dotyczy</span><select name="lumpSumRate" defaultValue={editing.lumpSumRate}>{LUMP_SUM_RATES.map(rate => <option key={rate} value={Math.round(rate * 100)}>{rate.toLocaleString("pl-PL")}%</option>)}</select><small>Dobierz do faktycznej czynności i PKWiU. Nazwa produktu nie ustala stawki.</small></label>
      <label className="field wide"><span>Opis</span><textarea name="description" defaultValue={editing.description} rows={2} maxLength={1500} /></label>
    </div><div className="form-actions"><small>Katalog jest wspólny dla Twojej działalności i dostępny z kilku urządzeń.</small><button className="btn primary" disabled={busy}>{busy ? "Zapisywanie…" : "Zapisz pozycję"}</button></div></form></article>}
    <article className="panel"><div className="filter-row"><div className="search"><Search size={17} /><input aria-label="Szukaj produktów i usług" placeholder="Nazwa, kod lub opis…" value={query} onChange={e => setQuery(e.target.value)} /></div><select aria-label="Status katalogu" value={filter} onChange={e => setFilter(e.target.value)}><option value="active">Aktywne pozycje</option><option value="archived">Archiwalne pozycje</option><option value="all">Wszystkie pozycje</option></select></div>{rows.length ? <div className="table-scroll"><table><thead><tr><th>Produkt / usługa</th><th>Jednostka</th><th className="right">Cena netto</th><th>VAT</th><th>Ryczałt</th><th>Akcje</th></tr></thead><tbody>{rows.map(item => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.kind === "product" ? "Produkt" : "Usługa"}{item.sku ? ` · ${item.sku}` : ""}{item.archived ? " · Archiwalny" : ""}</small></td><td>{item.unit}</td><td className="amount right">{money(item.unitPrice)}</td><td>{item.vatRate}{["zw", "np"].includes(item.vatRate) ? "" : "%"}</td><td>{(item.lumpSumRate / 100).toLocaleString("pl-PL")}%</td><td><button className="icon-btn" aria-label={`Edytuj ${item.name}`} onClick={() => edit(item)} disabled={busy}><Pencil size={16} /></button><button className="icon-btn" aria-label={`${item.archived ? "Przywróć" : "Archiwizuj"} ${item.name}`} onClick={() => void archive(item)} disabled={busy}><Archive size={16} /></button></td></tr>)}</tbody></table></div> : <div className="empty"><Package size={34} /><h3>{business.loading ? "Wczytywanie katalogu…" : "Tu zaczyna się Twój katalog"}</h3><p>Dodaj produkty i usługi, które regularnie sprzedajesz.</p></div>}</article>
  </>;
}

export function BusinessProfileForm({ business, signedIn }: { business: BusinessData; signedIn: boolean }) {
  const p = business.state.profile ?? defaultBusinessProfile();
  const [type, setType] = useState<BusinessType>(p.businessType), [vat, setVat] = useState(p.vatStatus), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  useEffect(() => { setType(p.businessType); setVat(p.vatStatus); }, [p.businessType, p.vatStatus, p.version]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !signedIn) return; setBusy(true); setError(""); setMessage("");
    try {
      if (!business.state.profile) { await business.mutate("register", { businessType: type }); setMessage("Wybrano rodzaj działalności. Uzupełnij ustawienia poniżej."); return; }
      const fd = new FormData(event.currentTarget), value = (key: string) => String(fd.get(key) ?? "");
      const parsed = businessProfileInput.safeParse({ businessType: type, jdgStartDate: type === "jdg" ? value("jdgStartDate") : "", taxForm: type === "jdg" ? value("taxForm") : "scale", vatStatus: type === "jdg" ? vat : "exempt", vatStartDate: type === "jdg" && vat === "active" ? value("vatStartDate") : "", exemptionBasis: type === "dn" ? p.exemptionBasis : value("exemptionBasis"), confirmTransition: fd.has("confirmTransition"), version: p.version });
      if (!parsed.success) throw new Error(parsed.error.issues.map(issue => issue.message).join(" "));
      await business.mutate("profile", parsed.data); setMessage("Profil działalności zapisany w bazie.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <article className="panel"><div className="panel-heading"><div><h2>Rodzaj działalności i profil podatkowy</h2><p>{business.state.profile ? businessLabel(p.businessType) : "Wybierz sposób prowadzenia działalności"}</p></div><ShieldCheck size={22} /></div><form className="form-body" onSubmit={submit} key={p.version} aria-busy={busy}><div className="form-grid">
    <label className="field wide"><span>Rodzaj działalności</span><select aria-label="Rodzaj działalności" value={type} onChange={e => setType(e.target.value as BusinessType)} disabled={busy || p.businessType === "jdg"}><option value="dn">Działalność nierejestrowana</option><option value="jdg">Jednoosobowa działalność gospodarcza</option></select><small>Przejście na JDG zachowuje klientów, katalog i historię DN. Nie rejestruje firmy w CEIDG.</small></label>
    {business.state.profile && type === "jdg" && <>
      <label className="field"><span>Data rozpoczęcia JDG</span><input name="jdgStartDate" type="date" defaultValue={p.jdgStartDate || today()} required min="1900-01-01" max={today()} readOnly={p.businessType === "jdg" && p.configured} /></label>
      <label className="field"><span>Forma opodatkowania PIT</span><select name="taxForm" defaultValue={p.taxForm}>{Object.entries(TAX_FORM_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><small>Zgodna z formą zgłoszoną do urzędu.</small></label>
      <label className="field"><span>Status VAT</span><select value={vat} onChange={e => setVat(e.target.value as "active" | "exempt")}><option value="exempt">Zwolnienie z VAT</option><option value="active">Czynny podatnik VAT</option></select></label>
      {vat === "active" ? <label className="field"><span>VAT czynny od</span><input name="vatStartDate" type="date" defaultValue={p.vatStartDate || today()} min="1900-01-01" max="2026-12-31" required /></label> : <label className="field"><span>Podstawa zwolnienia z VAT</span><input name="exemptionBasis" defaultValue={p.exemptionBasis} maxLength={300} /></label>}
      {p.businessType === "dn" && <label className="check-row wide"><input type="checkbox" name="confirmTransition" required /><span>Potwierdzam rozpoczęcie JDG od wskazanej daty. Wcześniejsze wpisy pozostają w ewidencji DN. Nie można cofnąć tej zmiany w ustawieniach.</span></label>}
    </>}
    </div>{business.state.events.map(event => <p className="inline-note" key={event.id}>Przejście DN → JDG: {dateLabel(event.effectiveDate)}. Historia ewidencji została zachowana.</p>)}{error && <div className="form-error" role="alert">{error}</div>}{message && <div className="notice info" role="status"><CheckCircle2 size={17} /><span>{message}</span></div>}{business.error && <div className="form-error" role="alert">{business.error}</div>}<div className="form-actions"><small>Ustawienia są przypisane do Twojego konta. Dane sprzedawcy uzupełnisz poniżej.</small><button className="btn primary" disabled={busy || !signedIn || business.loading}>{busy ? "Zapisywanie…" : !business.state.profile ? "Zapisz rodzaj działalności" : p.businessType === "dn" && type === "jdg" ? "Przejdź na JDG" : "Zapisz profil"}<ArrowRight size={16} /></button></div></form></article>;
}
