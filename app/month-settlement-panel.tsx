"use client";
import { useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowUpRight, CalendarDays, CheckCircle2, CircleHelp, ClipboardCheck, Clock, Download, FileText, Info, Wallet } from "lucide-react";
import type { BusinessProfile } from "../lib/business";
import { TAX_FORM_LABELS } from "../lib/business";
import type { InvoiceState } from "../lib/invoices";
import type { State } from "../lib/domain";
import { dateLabel, decimal, money, toCsv, today, workDate } from "../lib/domain";
import type { JdgTaxState, SupportedYear } from "../lib/jdg-tax";
import { jdgReport } from "../lib/jdg-tax";
import type { Inventory } from "../lib/inventory";
import type { StepState } from "../lib/month-settlement";
import { monthName, settleMonth } from "../lib/month-settlement";
import { REVIEW_STATUS_LABELS } from "../lib/review-status";
import type { ReviewStatus } from "../lib/review-status";
import { LumpSumBreakdown } from "./jdg-dashboard";

const MONTHS = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];
const STEP_LABEL: Record<StepState, string> = { done: "Gotowe", pending: "Oczekuje", action: "Do zrobienia", blocked: "Wymaga poprawy", info: "Informacja" };
const STEP_BADGE: Record<StepState, string> = { done: "green", pending: "blue", action: "amber", blocked: "orange", info: "gray" };
const REVIEW_BADGE: Record<ReviewStatus, string> = { AUTO_VERIFIED: "green", NEEDS_USER_INPUT: "amber", NEEDS_EXPERT_REVIEW: "blue", UNSUPPORTED_OR_INVALID: "orange" };
const STEP_ICON: Record<StepState, ReactNode> = { done: <CheckCircle2 size={18} />, pending: <Clock size={18} />, action: <AlertTriangle size={18} />, blocked: <AlertTriangle size={18} />, info: <Info size={18} /> };
// Settle the previous month by default: its taxes are due in the current one.
function defaultPeriod(): { year: SupportedYear; month: number } {
  const date = workDate(), year = Number(date.slice(0, 4)), month = Number(date.slice(5, 7));
  if (date.endsWith("-12-31")) return { year: year as SupportedYear, month: 12 };
  return month === 1 ? { year: Math.max(2025, year - 1) as SupportedYear, month: year > 2025 ? 12 : 1 } : { year: year as SupportedYear, month: month - 1 };
}
function Metric({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: ReactNode }) {
  return <article className="metric"><div className="metric-top"><span>{label}</span><span className="metric-icon green">{icon}</span></div><strong>{value}</strong><small>{sub}</small></article>;
}

export default function MonthSettlementPanel({ ledger, tax, profile, legacy, inventories, onOpenDocument, onTax, onInvoices }: { ledger: InvoiceState; tax: JdgTaxState; profile: BusinessProfile; legacy: State; inventories: Inventory[]; onOpenDocument: (id: string) => void; onTax: () => void; onInvoices: () => void }) {
  const [period, setPeriod] = useState(defaultPeriod);
  const { config, report } = jdgReport(ledger, tax, profile, legacy, inventories, period.year);
  const settlement = settleMonth({ report, ledger, profile, month: period.month, today: today() }), row = report.rows[period.month - 1];
  const lump = config.taxForm === "lump_sum", vatActive = profile.vatStatus === "active";
  function exportCsv() {
    const rows: unknown[][] = [["Ewidora — rozliczenie miesiąca", `${String(period.month).padStart(2, "0")}.${period.year}`], ["Status", settlement.overallLabel], [],
      ["Krok", "Stan", "Podsumowanie", "Szczegóły"], ...settlement.steps.map(step => [step.title, STEP_LABEL[step.state], step.summary, [...step.details, ...(step.documents ?? []).map(doc => `${doc.number} ${doc.party}: ${doc.message}`)].join(" | ")]), [],
      ["Kwota", "PLN", "Termin"], [lump ? "Ryczałt" : "Zaliczka PIT", settlement.amounts.pit === null ? "Wymaga weryfikacji" : decimal(settlement.amounts.pit), settlement.deadlines.pit], ["Wpłacono PIT", decimal(settlement.amounts.pitPaid), ""],
      ...(vatActive ? [["VAT do zapłaty", decimal(settlement.amounts.vat ?? 0), settlement.deadlines.vat], ["Wpłacono VAT", decimal(settlement.amounts.vatPaid), ""]] : []), ["Pozostało do zapłaty", decimal(settlement.amounts.toPay), ""]];
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" })), link = document.createElement("a");
    link.href = url; link.download = `ewidora-rozliczenie-${period.year}-${String(period.month).padStart(2, "0")}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const overallTone = settlement.overall === "ready" ? "info" : settlement.overall === "blocked" ? "danger" : "amber";
  return <>
    <div className="jdg-period-bar"><div className="period-selector"><CalendarDays size={17} /><select aria-label="Rok rozliczenia" value={period.year} onChange={e => setPeriod({ ...period, year: Number(e.target.value) as SupportedYear })}><option value={2026}>2026</option><option value={2025}>2025</option></select><span className="v-divider" /><select aria-label="Miesiąc rozliczenia" value={period.month} onChange={e => setPeriod({ ...period, month: Number(e.target.value) })}>{MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}</select></div>
      <div className="jdg-actions"><span className="badge green">{TAX_FORM_LABELS[config.taxForm]}</span><span className="badge gray">{vatActive ? "Czynny VAT" : "Zwolnienie z VAT"}</span><button className="btn ghost small" onClick={exportCsv}><Download size={15} />CSV rozliczenia</button></div></div>
    <div className={`notice ${overallTone} settle-overall`} role="status">{settlement.overall === "ready" ? <CheckCircle2 size={20} /> : <ClipboardCheck size={20} />}<div><strong>{MONTHS[period.month - 1]} {period.year}: {settlement.overallLabel}</strong><p>{settlement.overall === "preliminary" ? "Kwoty są wyliczone, ale nie zatwierdzaj ich, dopóki nie rozstrzygniesz spraw z kroku 1 i 2." : settlement.overall === "to_pay" ? "Dokumenty są zweryfikowane. Zostały płatności — zapisz je po wykonaniu przelewu." : settlement.overall === "ready" ? "Dokumenty zweryfikowane, podatki wyliczone i opłacone." : settlement.overall === "empty" ? "W tym miesiącu nie ma dokumentów ani wpisanych składek." : "Popraw dokumenty lub dane wskazane poniżej."}</p></div></div>
    <div className="metric-grid jdg-metrics">
      <Metric label={lump ? "Ryczałt za miesiąc" : "Zaliczka PIT"} value={settlement.amounts.pit === null ? "Sprawdź dane" : money(settlement.amounts.pit)} sub={`Termin ${dateLabel(settlement.deadlines.pit)} · wpłacono ${money(settlement.amounts.pitPaid)}`} icon={<FileText size={18} />} />
      <Metric label="VAT do zapłaty" value={vatActive ? money(settlement.amounts.vat ?? 0) : "Nie dotyczy"} sub={vatActive ? `Termin ${dateLabel(settlement.deadlines.vat)} · wpłacono ${money(settlement.amounts.vatPaid)}` : "Zwolnienie podmiotowe"} icon={<Wallet size={18} />} />
      <Metric label="Pozostało do zapłaty" value={money(settlement.amounts.toPay)} sub="Podatek i VAT za ten miesiąc" icon={<Wallet size={18} />} />
      <Metric label="Sprawy do decyzji" value={String(settlement.steps.find(step => step.id === "decisions")?.documents?.length ?? 0)} sub="Dokumenty bez zweryfikowanego ujęcia" icon={<CircleHelp size={18} />} />
    </div>
    <article className="panel"><div className="panel-heading"><div><h2>Rozliczenie krok po kroku</h2><p>Kolejność pracy: dokumenty, decyzje, wyliczenia, terminy i wpłaty.</p></div></div>
      <ol className="settle-steps">{settlement.steps.map((step, index) => <li key={step.id} className={`settle-step ${step.state}`}>
        <span className="settle-index" aria-hidden="true">{STEP_ICON[step.state]}</span>
        <div className="settle-body"><div className="settle-title"><h3>{index + 1}. {step.title}</h3><span className={"badge " + STEP_BADGE[step.state]}>{STEP_LABEL[step.state]}</span></div>
          <p className="settle-summary">{step.summary}</p>
          {step.details.length > 0 && <ul className="settle-details">{step.details.map(detail => <li key={detail}>{detail}</li>)}</ul>}
          {!!step.documents?.length && <ul className="settle-docs">{step.documents.map(doc => <li key={doc.id}><span className={"badge " + REVIEW_BADGE[doc.status]}>{REVIEW_STATUS_LABELS[doc.status]}</span><span><strong>{doc.number}</strong> · {doc.party}<small>{doc.message}</small></span><button className="btn ghost small" onClick={() => onOpenDocument(doc.id)}>Otwórz<ArrowUpRight size={14} /></button></li>)}</ul>}
          {step.id === "documents" && <button className="btn ghost small settle-link" onClick={onInvoices}>Faktury<ArrowUpRight size={14} /></button>}
          {(step.id === "contributions" || step.id === "payments") && <button className="btn ghost small settle-link" onClick={onTax}>{step.id === "contributions" ? "Wpisz składki" : "Zapisz wpłaty"}<ArrowUpRight size={14} /></button>}
        </div></li>)}</ol>
    </article>
    {lump && row.lumpSum && <LumpSumBreakdown title={`Ryczałt — ${monthName(period.month)} ${period.year}`} note="Przychody według rodzaju i stawki. Odliczenia rozdzielone proporcjonalnie do przychodu miesiąca." categories={row.lumpSum.categories} buckets={row.lumpSum.buckets} tax={row.lumpSum.tax} deduction={row.lumpSum.deductionUsed} carry={row.lumpSum.deductionCarry} />}
    <article className="panel jdg-scope"><h3>Co robi ten panel</h3><p>Zbiera dokumenty miesiąca, pokazuje sprawy wymagające decyzji, wylicza ryczałt lub zaliczkę PIT i VAT według zweryfikowanych reguł oraz porównuje je z zapisanymi wpłatami. Nie wysyła deklaracji ani płatności i nie zastępuje JPK_V7M, PIT-28/36/36L ani deklaracji ZUS.</p><p>Zamknięcie miesiąca z utrwaleniem wyniku i historii nie jest częścią tej wersji. Wynik zawsze przelicza się z bieżących dokumentów.</p></article>
  </>;
}
