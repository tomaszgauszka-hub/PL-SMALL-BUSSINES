// "Rozlicz miesiąc": one ordered view of what a JDG must check, calculate and
// pay for a month. Pure function over the calculated report, so the same
// result is shown on screen, exported and tested.
import type { BusinessProfile } from "./business.ts";
import type { Invoice, InvoiceState } from "./invoices.ts";
import type { JdgReport } from "./jdg-tax.ts";
import type { ReviewStatus } from "./review-status.ts";
import { filingDeadline } from "./domain.ts";

export type StepState = "done" | "pending" | "action" | "blocked" | "info";
export type SettlementDocument = { id: string; number: string; party: string; status: ReviewStatus; message: string };
export type SettlementStep = { id: string; title: string; state: StepState; summary: string; details: string[]; documents?: SettlementDocument[] };
export type SettlementOverall = "ready" | "to_pay" | "preliminary" | "blocked" | "empty";
export type MonthSettlement = {
  year: number; month: number; overall: SettlementOverall; overallLabel: string; steps: SettlementStep[];
  amounts: { pit: number | null; pitPaid: number; vat: number | null; vatPaid: number; toPay: number };
  deadlines: { pit: string; vat: string };
};

const MONTHS = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
export const monthName = (month: number) => MONTHS[month - 1];
const zl = (cents: number) => new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(cents / 100);
const date = (value: string) => value.split("-").reverse().join(".");
export function plural(n: number, one: string, few: string, many: string) { const tens = n % 100, units = n % 10; return n === 1 ? one : units >= 2 && units <= 4 && (tens < 12 || tens > 14) ? few : many; }

// Sale numbers FV/2026/n and FK/2026/n are assigned without gaps; a gap means
// a lost or unimported document.
export function numberingGaps(documents: Invoice[], year: number) {
  const gaps: string[] = [];
  for (const series of ["FV", "FK"]) {
    const pattern = new RegExp(`^${series}/${year}/(\\d{1,9})$`);
    const numbers = documents.filter(doc => doc.direction === "sale" && doc.status === "issued").map(doc => pattern.exec(doc.number)?.[1]).filter(Boolean).map(Number);
    const seen = new Set(numbers), max = Math.max(0, ...numbers);
    for (let n = 1; n < max && gaps.length < 20; n++) if (!seen.has(n)) gaps.push(`${series}/${year}/${n}`);
  }
  return gaps;
}
// Same supplier, issue date and gross amount under different numbers is a
// frequent double registration of one purchase.
export function possibleDuplicates(documents: Invoice[], monthKey: string) {
  const issued = documents.filter(doc => doc.status === "issued" && doc.direction === "purchase" && doc.kind === "regular");
  const groups = new Map<string, Invoice[]>();
  for (const doc of issued) { const key = [doc.partyNip || doc.partyName.trim().toLowerCase(), doc.issueDate, doc.gross].join("|"); groups.set(key, [...(groups.get(key) ?? []), doc]); }
  return [...groups.values()].filter(group => group.length > 1 && group.some(doc => doc.taxDate.startsWith(monthKey) || doc.vatDate.startsWith(monthKey)));
}

export function settleMonth(input: { report: JdgReport; ledger: InvoiceState; profile: BusinessProfile; month: number; today: string }): MonthSettlement {
  const { report, ledger, profile, month, today } = input, year = report.year, row = report.rows[month - 1];
  const monthKey = `${year}-${String(month).padStart(2, "0")}`, inMonth = (doc: Invoice) => doc.taxDate.startsWith(monthKey) || doc.vatDate.startsWith(monthKey);
  const issued = ledger.documents.filter(doc => doc.status === "issued");
  const sales = issued.filter(doc => doc.direction === "sale" && doc.taxDate.startsWith(monthKey)), purchases = issued.filter(doc => doc.direction === "purchase" && inMonth(doc));
  const drafts = ledger.documents.filter(doc => doc.status === "draft" && (doc.issueDate.startsWith(monthKey) || doc.taxDate.startsWith(monthKey)));
  const gaps = numberingGaps(ledger.documents, year), duplicates = possibleDuplicates(ledger.documents, monthKey);
  const vatActive = profile.vatStatus === "active", lump = report.taxForm === "lump_sum";
  const steps: SettlementStep[] = [];

  const docDetails = [
    ...(drafts.length ? [`${drafts.length} ${plural(drafts.length, "szkic nie wchodzi", "szkice nie wchodzą", "szkiców nie wchodzi")} do rozliczenia, dopóki ich nie wystawisz.`] : []),
    ...(gaps.length ? [`Luki w numeracji sprzedaży ${year} r.: ${gaps.join(", ")}.`] : []),
    ...duplicates.map(group => `Możliwy duplikat zakupu: ${group.map(doc => doc.number).join(" i ")} (${group[0].partyName}, ${zl(group[0].gross)}).`),
  ];
  steps.push({ id: "documents", title: "Dokumenty miesiąca", state: docDetails.length ? "action" : sales.length || purchases.length ? "done" : "info",
    summary: sales.length || purchases.length ? `${sales.length} sprzedaży · ${purchases.length} zakupów` : "Brak wystawionych dokumentów w tym miesiącu", details: docDetails });

  const open = [...sales, ...purchases].map(doc => ({ doc, review: report.reviews.get(doc.id) })).filter(item => item.review && item.review.status !== "AUTO_VERIFIED");
  const documents = open.map(({ doc, review }) => ({ id: doc.id, number: doc.number || "Bez numeru", party: doc.partyName, status: review!.status, message: review!.findings[0]?.message ?? "" }));
  const blockedDocs = documents.some(doc => doc.status === "UNSUPPORTED_OR_INVALID");
  steps.push({ id: "decisions", title: "Sprawy do decyzji", state: blockedDocs ? "blocked" : documents.length ? "action" : "done",
    summary: documents.length ? `${documents.length} ${plural(documents.length, "dokument wymaga", "dokumenty wymagają", "dokumentów wymaga")} decyzji` : "Wszystkie dokumenty zweryfikowane", details: [], documents });

  const revenueSummary = lump && row.lumpSum
    ? `Przychód ${zl(row.lumpSum.revenue)} · ${row.lumpSum.buckets.length} ${plural(row.lumpSum.buckets.length, "stawka", "stawki", "stawek")} ryczałtu`
    : `Przychód ${zl(row.income)} · koszty ${zl(row.cost)} · dochód narastająco ${zl(row.taxProfitYtd)}`;
  steps.push({ id: "revenue", title: lump ? "Przychody według stawek" : "Przychody i koszty", state: "info", summary: revenueSummary,
    details: lump && row.lumpSum ? row.lumpSum.categories.map(c => `${c.label} — ${c.rateLabel}: ${zl(c.revenue)}`) : [] });

  steps.push(row.pitDue === null
    ? { id: "pit", title: lump ? "Ryczałt" : "Zaliczka PIT", state: "blocked", summary: "Nie można wyliczyć — popraw dane", details: row.issues }
    : { id: "pit", title: lump ? "Ryczałt" : "Zaliczka PIT", state: "done", summary: `${lump ? "Ryczałt" : "Zaliczka"} za ${monthName(month)}: ${zl(row.pitDue)}`,
      details: lump && row.lumpSum ? [`Odliczenia składek w miesiącu: ${zl(row.lumpSum.deductionUsed)}${row.lumpSum.deductionCarry ? `, do przeniesienia ${zl(row.lumpSum.deductionCarry)}` : ""}.`] : [`Podatek narastająco: ${zl(row.pitTaxYtd)}.`] });

  steps.push(vatActive
    ? { id: "vat", title: "VAT", state: "done", summary: row.vatDue ? `VAT do zapłaty: ${zl(row.vatDue)}` : `Nadwyżka do przeniesienia: ${zl(row.vatCredit)}`, details: [`Należny ${zl(row.vatDeclaredOutput)} · naliczony ${zl(row.vatDeclaredInput)}${row.vatRefund ? ` · do zwrotu ${zl(row.vatRefund)}` : ""}.`] }
    : { id: "vat", title: "VAT", state: "info", summary: "Zwolnienie z VAT — bez deklaracji miesięcznej", details: report.vatLimit ? [`Wykorzystanie limitu: ${zl(report.vatSales)} z ${zl(report.vatLimit)}.`] : [] });

  const contributions = row.input.socialDeduction + row.input.healthPaid;
  steps.push({ id: "contributions", title: "Składki ZUS", state: contributions ? "done" : "action",
    summary: contributions ? `Zapłacone: społeczne ${zl(row.input.socialDeduction)} · zdrowotna ${zl(row.input.healthPaid)}` : "Nie wpisano składek zapłaconych w tym miesiącu",
    details: ["Ewidora odlicza wpisane, faktycznie zapłacone składki. Nie wylicza składek należnych."] });

  const payment = (due: number | null, paid: number, deadline: string, label: string): { state: StepState; text: string } => {
    if (due === null) return { state: "pending", text: `${label}: czeka na poprawne wyliczenie` };
    if (paid >= due) return { state: "done", text: due ? `${label}: zapłacono ${zl(paid)}${paid > due ? ` (nadpłata ${zl(paid - due)})` : ""}` : `${label}: brak kwoty do zapłaty` };
    return today > deadline ? { state: "action", text: `${label}: po terminie ${date(deadline)} — brakuje ${zl(due - paid)}` } : { state: "pending", text: `${label}: ${zl(due - paid)} do zapłaty do ${date(deadline)}` };
  };
  const pitPay = payment(row.pitDue, row.pitPaid, row.pitDeadline, lump ? "Ryczałt" : "PIT"), vatPay = vatActive ? payment(row.vatDue, row.input.vatPaid, row.vatDeadline, "VAT") : null;
  const payStates = [pitPay.state, ...(vatPay ? [vatPay.state] : [])];
  steps.push({ id: "payments", title: "Terminy i wpłaty", state: payStates.includes("action") ? "action" : payStates.includes("pending") ? "pending" : "done",
    summary: [pitPay.text, ...(vatPay ? [vatPay.text] : [])].join(" · "), details: ["Wpłaty zapisujesz w zakładce PIT i VAT. Sam przelew wykonujesz w banku na mikrorachunek podatkowy."] });

  const obligations = [
    ...(vatActive ? [`JPK_V7M za ${monthName(month)} — złożenie i zapłata do ${date(row.vatDeadline)}. Ewidora nie generuje pliku JPK.`] : []),
    lump ? `Ryczałt nie ma deklaracji miesięcznej. Zeznanie PIT-28 za ${year} r. do ${date(filingDeadline(year))}.` : `Zaliczka bez deklaracji miesięcznej. Zeznanie ${report.primaryForm} za ${year} r. do ${date(filingDeadline(year))}.`,
    "Deklaracje i płatności ZUS rozliczasz w eZUS — poza Ewidorą.",
  ];
  steps.push({ id: "declarations", title: "Deklaracje", state: "info", summary: vatActive ? "JPK_V7M składasz poza Ewidorą" : "Brak deklaracji miesięcznych", details: obligations });

  const toPay = Math.max(0, (row.pitDue ?? 0) - row.pitPaid) + (vatActive ? Math.max(0, row.vatDue - row.input.vatPaid) : 0);
  const nothing = !sales.length && !purchases.length && !drafts.length && !contributions;
  const overall: SettlementOverall = nothing ? "empty" : steps.some(step => step.state === "blocked") ? "blocked" : steps.some(step => step.state === "action" && step.id !== "payments" && step.id !== "contributions") ? "preliminary" : toPay > 0 || payStates.includes("action") ? "to_pay" : "ready";
  const overallLabel = { empty: "Brak danych w tym miesiącu", blocked: "Wymaga poprawy danych", preliminary: `Wynik wstępny — ${documents.length + docDetails.length} ${plural(documents.length + docDetails.length, "sprawa", "sprawy", "spraw")} do wyjaśnienia`, to_pay: `Do zapłaty: ${zl(toPay)}`, ready: "Miesiąc rozliczony" }[overall];
  return { year, month, overall, overallLabel, steps, amounts: { pit: row.pitDue, pitPaid: row.pitPaid, vat: vatActive ? row.vatDue : null, vatPaid: row.input.vatPaid, toPay }, deadlines: { pit: row.pitDeadline, vat: row.vatDeadline } };
}
