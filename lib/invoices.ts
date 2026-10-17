import { z } from "zod";
import type { InvoiceLineInput } from "./business.ts";
import { calculateInvoice, LUMP_SUM_RATES } from "./business.ts";
import { validDate, validNip, today } from "./domain.ts";
import { revenueCategory } from "./lump-sum.ts";
const text = (max: number) => z.string().trim().max(max);
const uuid = z.string().uuid();
const optionalId = z.union([uuid, z.literal("")]);
const date = z.string().refine(validDate, "Nieprawidłowa data.").refine(d => d >= "2025-01-01" && d <= "2026-12-31", "Obsługiwane lata: 2025–2026.");
const money = z.number().int().min(0).max(99999999999);
export const invoiceLineInput = z.object({ name: text(300).min(1, "Wpisz nazwę pozycji."), unit: text(30).min(1), quantityMilli: z.number().int().min(-1000000000).max(1000000000).refine(n => n !== 0, "Ilość nie może wynosić zero."), unitPrice: money, vatRate: z.enum(["23", "8", "5", "0", "zw", "np"]), discountBps: z.number().int().min(0).max(10000), lumpSumRate: z.number().int().refine(n => LUMP_SUM_RATES.some(rate => Math.round(rate * 100) === n), "Sprawdź stawkę ryczałtu."), productId: optionalId,
  revenueCategory: z.string().max(20).optional(), classificationSource: z.enum(["", "user_confirmed", "pkd_hint", "ai_suggestion", "legacy_rate_only"]).optional(), pkwiu: text(20).refine(v => !v || /^(\d{2})(\.\d{1,2}){0,3}$/.test(v), "Symbol PKWiU w formacie np. 62.01.11.0.").optional() });
export const invoiceInput = z.object({
  id: uuid, direction: z.enum(["sale", "purchase"]), status: z.enum(["draft", "issued"]), kind: z.enum(["regular", "correction"]), number: text(80),
  clientId: optionalId, partyName: text(160).min(1, "Wpisz nazwę kontrahenta."), partyAddress: text(400), partyNip: text(20).transform(v => v.replace(/[\s-]/g, "")).refine(validNip, "Nieprawidłowy NIP kontrahenta."),
  issueDate: date, saleDate: date, dueDate: z.string().refine(validDate, "Nieprawidłowy termin płatności."), taxDate: date, vatDate: date, receivedDate: date,
  lines: z.array(invoiceLineInput).min(1).max(100), parentId: optionalId, reason: text(1000), notes: text(2000),
  vatDeductionBps: z.number().int().min(0).max(10000), costDeductionBps: z.number().int().min(0).max(10000), costCategory: z.enum(["goods", "incidental", "other"]),
  exemptionBasis: text(300), paymentAccount: text(40).refine(v => !v || /^\d{26}$/.test(v.replace(/\s/g, "")), "Rachunek powinien zawierać 26 cyfr."), splitPayment: z.boolean(), vatLimitIncluded: z.boolean().default(true),
  initialPayment: money.default(0), paymentDate: date, method: z.enum(["Przelew", "Gotówka", "Karta", "Inne"]), version: z.number().int().nonnegative(),
  supplyStructure: z.enum(["", "separate", "composite"]).optional(), correctionCause: z.enum(["", "error", "other"]).optional(),
  reviewAnswers: z.record(z.string().max(60), z.string().max(60)).refine(v => Object.keys(v).length <= 20, "Za dużo odpowiedzi.").optional(),
}).superRefine((v, ctx) => {
  for (const line of v.lines) {
    if (!line.revenueCategory) continue;
    const category = revenueCategory(line.revenueCategory);
    if (!category || category.outsideJdg) ctx.addIssue({ code: "custom", message: "Wybierz rodzaj przychodu z działalności z aktualnego katalogu." });
    else if (category.rateBps !== line.lumpSumRate) ctx.addIssue({ code: "custom", message: `Stawka ryczałtu pozycji „${line.name}” nie odpowiada wybranemu rodzajowi przychodu.` });
  }
  if (v.kind !== "correction" && v.correctionCause) ctx.addIssue({ code: "custom", message: "Przyczynę korekty podaje się tylko dla korekty." });
  if (v.status === "issued" && v.issueDate > today()) ctx.addIssue({ code: "custom", message: "Przyszły dokument zapisz jako szkic." });
  if (v.kind === "regular" && v.lines.some(line => line.quantityMilli < 0)) ctx.addIssue({ code: "custom", message: "Ujemne pozycje zapisuj jako korektę." });
  if (v.kind === "correction" && (!v.parentId || !v.reason)) ctx.addIssue({ code: "custom", message: "Korekta wymaga dokumentu źródłowego i przyczyny." });
  if (v.status === "issued" && (!v.partyAddress || (v.direction === "purchase" && !v.number))) ctx.addIssue({ code: "custom", message: "Wpisz adres kontrahenta i numer faktury zakupu." });
  if (v.direction === "purchase" && v.vatDate < v.receivedDate) ctx.addIssue({ code: "custom", message: "Odliczenie VAT nie może poprzedzać otrzymania faktury." });
  if (v.status === "issued" && v.direction === "sale" && v.lines.some(line => line.vatRate === "zw") && !v.exemptionBasis) ctx.addIssue({ code: "custom", message: "Wpisz właściwą podstawę zwolnienia z VAT." });
  try { const totals = calculateInvoice(v.lines); if (v.initialPayment > Math.abs(totals.gross)) ctx.addIssue({ code: "custom", message: "Pierwsza płatność przekracza kwotę dokumentu." }); }
  catch (error) { ctx.addIssue({ code: "custom", message: (error as Error).message }); }
});
export type InvoiceInput = z.infer<typeof invoiceInput>;
export type Invoice = InvoiceInput & { net: number; vat: number; gross: number; deductibleVat: number; pitCost: number; seller: { name: string; address: string; nip: string }; source: { number: string; issueDate: string; net: number; vat: number; gross: number; lines: InvoiceLineInput[] } | null; createdAt: string; issuedAt: string };
export type InvoicePayment = { id: string; invoiceId: string; date: string; amount: number; method: string; note: string; reversalOf: string; createdAt: string };
export type InvoiceAttachment = { id: string; invoiceId: string; name: string; mime: string; size: number };
export type InvoiceState = { documents: Invoice[]; payments: InvoicePayment[]; attachments: InvoiceAttachment[] };
export function emptyInvoiceState(): InvoiceState { return { documents: [], payments: [], attachments: [] }; }
export const invoicePaymentInput = z.object({ id: uuid, invoiceId: uuid, date, amount: z.number().int().min(-99999999999).max(99999999999).refine(n => n !== 0), method: z.enum(["Przelew", "Gotówka", "Karta", "Inne"]), note: text(500) });
export const invoicePaymentReversalInput = z.object({ id: uuid, paymentId: uuid, date, note: text(500) });
const signedAmount = z.number().int().min(-99999999999).max(99999999999);
const sellerSnapshot = z.object({ name: text(200).min(1), address: text(400).min(1), nip: text(20).refine(v => !!v && validNip(v), "Kopia wymaga prawidłowego NIP sprzedawcy.") });
export const invoiceRestoreInput = z.object({ document: invoiceInput, snapshot: z.object({ seller: sellerSnapshot.optional(), deductibleVat: signedAmount, pitCost: signedAmount, createdAt: z.string().datetime({ offset: true }), issuedAt: z.union([z.string().datetime({ offset: true }), z.literal("")]) }) }).superRefine((value, context) => { if (value.document.status === "issued" && !value.snapshot.seller) context.addIssue({ code: "custom", message: "Kopia wystawionej faktury nie zawiera danych sprzedawcy." }); });
export const invoicePaymentRestoreInput = invoicePaymentInput.extend({ reversalOf: optionalId, createdAt: z.string().datetime({ offset: true }) });
export function parseQuantity(value: string): number { const s = value.trim().replace(",", "."); if (!/^-?\d{1,6}(\.\d{1,3})?$/.test(s)) throw new Error("Ilość: maksymalnie trzy miejsca po przecinku."); const sign = s.startsWith("-") ? -1 : 1, [whole, fraction = ""] = s.replace("-", "").split("."); const result = sign * (Number(whole) * 1000 + Number(fraction.padEnd(3, "0"))); if (!result) throw new Error("Ilość nie może wynosić zero."); return result; }
export function invoicePaid(invoice: Invoice, payments: InvoicePayment[]) { return payments.filter(p => p.invoiceId === invoice.id).reduce((sum, p) => sum + p.amount, 0); }
export function invoiceSummary(documents: Invoice[], payments: InvoicePayment[], year: number, month = 0) {
  const period = (date: string) => date.startsWith(String(year) + "-") && (!month || Number(date.slice(5, 7)) === month);
  const issued = documents.filter(doc => doc.status === "issued");
  const sales = issued.filter(doc => doc.direction === "sale" && period(doc.taxDate));
  const purchases = issued.filter(doc => doc.direction === "purchase" && period(doc.taxDate));
  const salesVat = issued.filter(doc => doc.direction === "sale" && period(doc.vatDate)).reduce((sum, doc) => sum + doc.vat, 0);
  const purchaseVat = issued.filter(doc => doc.direction === "purchase" && period(doc.vatDate)).reduce((sum, doc) => sum + doc.deductibleVat, 0);
  const income = sales.reduce((sum, doc) => sum + doc.net, 0), cost = purchases.reduce((sum, doc) => sum + doc.pitCost, 0);
  return { income, cost, profit: income - cost, salesVat, purchaseVat, vatDifference: salesVat - purchaseVat,
    receivable: issued.filter(doc => doc.direction === "sale").reduce((sum, doc) => sum + doc.gross - invoicePaid(doc, payments), 0),
    payable: issued.filter(doc => doc.direction === "purchase").reduce((sum, doc) => sum + doc.gross - invoicePaid(doc, payments), 0) };
}
