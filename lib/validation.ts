import { z } from "zod";
import { validDate, validNip } from "./domain.ts";
const id = z.string().uuid();
const text = (max: number) => z.string().trim().max(max);
const date = z.string().refine(validDate, "Nieprawidłowa data.").refine(d => d >= "2025-01-01" && d <= "2026-12-31", "Obsługujemy daty 2025–2026. Nie zgadujemy przyszłych zasad.");
const amount = z.number().int().min(-99999999999).max(99999999999);
const nonnegative = amount.refine(n => n >= 0, "Kwota nie może być ujemna.");
export const clientInput = z.object({ id, name: text(160).min(1, "Wpisz nazwę klienta."), nip: text(20).refine(validNip, "Nieprawidłowy NIP."), email: text(200).refine(v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Nieprawidłowy email."), phone: text(40), address: text(400), notes: text(2000), archived: z.number().int().min(0).max(1), version: z.number().int().nonnegative() });
export const saleInput = z.object({ id, clientId: z.union([id, z.literal("")]), date, issueDate: date, dueDate: date, amount: amount.refine(n => n !== 0, "Kwota nie może wynosić zero."), description: text(1500).min(1, "Wpisz przedmiot sprzedaży."), category: text(80).min(1), kind: z.enum(["sale", "correction"]), parentId: z.union([id, z.literal("")]), reason: text(1000), b2b: z.number().int().min(0).max(1), ksefEligible: z.number().int().min(0).max(1).default(0), initialPayment: nonnegative.default(0), paymentDate: date.optional(), method: z.enum(["Przelew", "Gotówka", "Karta", "Świadczenie niepieniężne", "Inne"]).default("Przelew"), number: text(80).default("") }).superRefine((v, ctx) => {
  if (v.ksefEligible && !v.b2b) ctx.addIssue({ code: "custom", message: "Do licznika KSeF można włączyć tylko właściwą fakturę B2B." });
  if (v.kind === "sale" && v.amount < 0) ctx.addIssue({ code: "custom", message: "Ujemna kwota wymaga korekty." });
  if (v.kind === "correction" && (!v.parentId || !v.reason)) ctx.addIssue({ code: "custom", message: "Korekta wymaga dokumentu źródłowego i powodu." });
  if (v.initialPayment > Math.abs(v.amount)) ctx.addIssue({ code: "custom", message: "Pierwsza wpłata nie może przekroczyć wartości dokumentu." });
  if (v.initialPayment && !v.paymentDate) ctx.addIssue({ code: "custom", message: "Wpisz datę otrzymania pieniędzy." });
});
export const paymentInput = z.object({ id, saleId: id, date, amount: amount.refine(n => n !== 0, "Kwota nie może wynosić zero."), method: z.enum(["Przelew", "Gotówka", "Karta", "Świadczenie niepieniężne", "Inne"]), note: text(500) });
export const expenseInput = z.object({ id, date, paidDate: date, amount: amount.refine(n => n !== 0, "Wpisz kwotę wydatku."), deductible: amount, description: text(1500).min(1), category: text(80).min(1), evidence: text(200), notes: text(2000) }).superRefine((v, ctx) => {
  if (Math.abs(v.deductible) > Math.abs(v.amount) || (v.deductible !== 0 && Math.sign(v.deductible) !== Math.sign(v.amount))) ctx.addIssue({ code: "custom", message: "Koszt podatkowy musi mieścić się w kwocie wydatku i mieć ten sam znak." });
  if (v.deductible && !v.evidence) ctx.addIssue({ code: "custom", message: "Koszt podatkowy wymaga numeru lub opisu dowodu zakupu." });
});
export const settingsInput = z.object({ sellerName: text(160), sellerAddress: text(400), sellerNip: text(20).refine(validNip, "Nieprawidłowy NIP."), sellerEmail: text(200), startDate: z.union([date, z.literal("")]), eligible60: z.boolean(), regulated: z.boolean(), specialVat: z.boolean(), specialCash: z.boolean(), version: z.number().int().nonnegative() });
export const taxInput = z.object({ year: z.union([z.literal(2025), z.literal(2026)]), otherIncome: nonnegative, deductions: nonnegative, advances: nonnegative, taxRelief: nonnegative, version: z.number().int().nonnegative() });
export const mutationInput = z.object({ opId: id, action: z.enum(["client", "sale", "payment", "expense", "settings", "tax", "import"]), data: z.unknown() });
const snapshot = z.string().max(15000).refine(value => { try { const parsed = JSON.parse(value); return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed); } catch { return false; } }, "Nieprawidłowe dane dokumentu w kopii.");
export const backupInput = z.object({
  format: z.literal("mala-ksiega-1"),
  clients: z.array(clientInput),
  sales: z.array(saleInput.and(z.object({ snapshot: snapshot.optional(), createdAt: z.string().datetime({ offset: true }).optional() }))),
  payments: z.array(paymentInput), expenses: z.array(expenseInput),
  settings: settingsInput.optional(), tax: z.array(taxInput).max(2).optional(),
  legalEvents: z.array(z.object({ kind: z.enum(["dn_breach", "ksef_breach"]), date, details: z.string().max(10000) })).max(2).optional(),
}).refine(b => b.clients.length + b.sales.length + b.payments.length + b.expenses.length <= 150, "Maksymalnie 150 wpisów w partii importu.");
