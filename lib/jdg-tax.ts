import { z } from "zod";
import type { BusinessProfile, TaxForm } from "./business.ts";
import { calculateInvoiceLine } from "./business.ts";
import type { Invoice, InvoiceState } from "./invoices.ts";
import { invoiceSummary } from "./invoices.ts";
import type { State } from "./domain.ts";
import { aggregate, nextBusinessDate, roundedPLN, scaleTaxRawCents, validDate } from "./domain.ts";
const amount = z.number().int().min(0).max(99999999999);
const yearInput = z.union([z.literal(2025), z.literal(2026)]);
const wholeZloty = amount.refine(n => n % 100 === 0, "Kwota z poprzedniej deklaracji VAT powinna być w pełnych złotych.");
export const jdgYearInput = z.object({ year: yearInput, taxForm: z.enum(["scale", "linear", "lump_sum"]), activityStartDate: z.string().refine(validDate, "Podaj datę rozpoczęcia sprzedaży, również wcześniejszej DN.").refine(v => v <= "2026-12-31", "Obsługiwane lata kończą się na 2026 r."), vatOpeningCredit: wholeZloty, otherIncome: amount, scaleDeductions: amount, businessDeductions: amount, otherAdvances: amount, scaleRelief: amount, previousYearRevenue: amount.nullable(), legacyVatSales: amount.nullable(), version: z.number().int().nonnegative() });
export const jdgMonthInput = z.object({ year: yearInput, month: z.number().int().min(1).max(12), socialDeduction: amount, healthPaid: amount, healthInCosts: amount, otherDeductions: amount, pitPaid: amount, vatPaid: amount, vatRefundRequested: wholeZloty, version: z.number().int().nonnegative() }).refine(v => v.healthInCosts <= v.healthPaid, "Część składki zdrowotnej w kosztach nie może przekraczać zapłaconej składki.");
export type JdgYear = z.infer<typeof jdgYearInput>;
export type JdgMonth = z.infer<typeof jdgMonthInput>;
export type JdgTaxState = { years: JdgYear[]; months: JdgMonth[] };
export function emptyJdgTaxState(): JdgTaxState { return { years: [], months: [] }; }
export function defaultJdgYear(year: 2025 | 2026, profile: BusinessProfile, activityStartDate = ""): JdgYear { return { year, taxForm: profile.taxForm, activityStartDate: activityStartDate || profile.jdgStartDate, vatOpeningCredit: 0, otherIncome: 0, scaleDeductions: 0, businessDeductions: 0, otherAdvances: 0, scaleRelief: 0, previousYearRevenue: Number(profile.jdgStartDate.slice(0, 4)) >= year ? 0 : null, legacyVatSales: null, version: 0 }; }
export function defaultJdgMonth(year: 2025 | 2026, month: number): JdgMonth { return { year, month, socialDeduction: 0, healthPaid: 0, healthInCosts: 0, otherDeductions: 0, pitPaid: 0, vatPaid: 0, vatRefundRequested: 0, version: 0 }; }
export const JDG_SOURCES = [
  { title: "Formy opodatkowania i rozpoczęcie działalności", url: "https://www.podatki.gov.pl/poradniki-i-informatory/rozpoczecie-dzialalnosci-gospodarczej" },
  { title: "Stawki i limity PIT 2026", url: "https://www.podatki.gov.pl/podatki-firmowe/pit/stawki-i-limity" },
  { title: "Odliczenie zapłaconych składek zdrowotnych", url: "https://www.podatki.gov.pl/ulgi-i-odliczenia/odliczenie-skladek-na-ubezpieczenie-zdrowotne-pit" },
  { title: "Zwolnienie z VAT i proporcja limitu", url: "https://www.podatki.gov.pl/podatki-firmowe/vat/poradniki-i-informatory/zwolnienie-podmiotowe-od-podatku-vat" },
  { title: "Moment powstania obowiązku VAT", url: "https://www.podatki.gov.pl/podatki-firmowe/vat/poradniki-i-informatory/kiedy-powstaje-obowiazek-podatkowy" },
  { title: "Odliczanie i zwrot VAT", url: "https://www.podatki.gov.pl/podatki-firmowe/vat/poradniki-i-informatory/odliczenie-i-zwrot-podatku-vat" },
];
export function taxPaymentDeadline(year: number, month: number, kind: "pit" | "vat") { return nextBusinessDate(new Date(Date.UTC(year, month, kind === "pit" ? 20 : 25, 12)).toISOString().slice(0, 10)); }
export function signedWholeZloty(cents: number): number { return Math.sign(cents) * roundedPLN(Math.abs(cents)) * 100; }
export function lumpSumEligibilityLimit(year: number) { return year === 2026 ? 851720000 : year === 2025 ? 856920000 : null; }
function scaleWithRelief(base: number, relief = 0) { return roundedPLN(Math.max(0, scaleTaxRawCents(base) - relief)) * 100; }
function linearTax(base: number) { return roundedPLN(roundedPLN(base) * 19) * 100; }
export function vatExemptionLimit(year: number, activityStartDate: string): number | null {
  if (![2025, 2026].includes(year) || !validDate(activityStartDate)) return null;
  const annual = year === 2026 ? 24000000 : 20000000;
  if (activityStartDate < `${year}-01-01`) return annual;
  if (activityStartDate > `${year}-12-31`) return 0;
  const start = Date.UTC(year, 0, 1), end = Date.UTC(year + 1, 0, 1), activity = Date.parse(activityStartDate + "T00:00:00Z");
  return Math.floor(annual * (end - activity) / (end - start));
}
type Bucket = { rate: number; income: number; deduction: number; base: number; taxUnits: bigint };
export function lumpSumTax(incomeByRate: Map<number, number>, requestedDeduction: number) {
  const positive = [...incomeByRate].filter(([, amount]) => amount > 0).sort(([a], [b]) => a - b);
  const income = positive.reduce((sum, [, amount]) => sum + amount, 0), used = Math.min(income, Math.max(0, requestedDeduction));
  // Half-grosz units preserve exactly 50% of an odd-grosz health contribution.
  const usedUnits = Math.round(used * 2);
  const allocation = positive.map(([rate, amount]) => ({ rate, income: amount, deductionUnits: income ? Number(BigInt(usedUnits) * BigInt(amount) / BigInt(income)) : 0, remainder: income ? BigInt(usedUnits) * BigInt(amount) % BigInt(income) : 0n }));
  let remaining = usedUnits - allocation.reduce((sum, row) => sum + row.deductionUnits, 0);
  for (const row of [...allocation].sort((a, b) => a.remainder === b.remainder ? a.rate - b.rate : a.remainder > b.remainder ? -1 : 1)) { if (!remaining) break; row.deductionUnits++; remaining--; }
  const buckets: Bucket[] = allocation.map(row => { const base = Math.floor((row.income * 2 - row.deductionUnits + 100) / 200); return { rate: row.rate, income: row.income, deduction: row.deductionUnits / 2, base: base * 100, taxUnits: BigInt(base) * BigInt(row.rate) }; });
  const raw = buckets.reduce((sum, bucket) => sum + bucket.taxUnits, 0n);
  return { tax: Number((raw + 5000n) / 10000n) * 100, income, used, unused: requestedDeduction - used, buckets, negativeRates: [...incomeByRate].filter(([, amount]) => amount < 0).map(([rate]) => rate) };
}
function bucketsFor(documents: Invoice[], year: number, month = 0) {
  const buckets = new Map<number, number>();
  for (const doc of documents.filter(doc => doc.status === "issued" && doc.direction === "sale" && doc.taxDate.startsWith(String(year)) && (!month || Number(doc.taxDate.slice(5, 7)) === month))) for (const line of doc.lines) buckets.set(line.lumpSumRate, (buckets.get(line.lumpSumRate) ?? 0) + calculateInvoiceLine(line).net);
  return buckets;
}
function outputVatDeclaration(documents: Invoice[], year: number, month: number) {
  const groups = new Map<string, number>();
  for (const doc of documents.filter(doc => doc.status === "issued" && doc.direction === "sale" && doc.vatDate.startsWith(`${year}-${String(month).padStart(2, "0")}`))) for (const line of doc.lines) groups.set(line.vatRate, (groups.get(line.vatRate) ?? 0) + calculateInvoiceLine(line).vat);
  return [...groups.values()].reduce((sum, amount) => sum + signedWholeZloty(amount), 0);
}
export type JdgTaxMonth = ReturnType<typeof invoiceSummary> & { month: number; input: JdgMonth; pitTaxYtd: number; pitDue: number | null; pitPaid: number; vatDue: number; vatCredit: number; vatRefund: number; vatDeclaredOutput: number; vatDeclaredInput: number; pitDeadline: string; vatDeadline: string; issues: string[] };
export function calculateJdgTaxes(ledger: InvoiceState, context: JdgTaxState, config: JdgYear, legacy: State) {
  const year = config.year, healthLimit = year === 2026 ? 1410000 : 1290000;
  const rows: JdgTaxMonth[] = [];
  let cumulativeIncome = 0, cumulativeCost = 0, cumulativeSocial = 0, cumulativeHealth = 0, cumulativeHealthInCosts = 0, cumulativeOther = 0, priorDue = 0, deductionCarry = 0, vatCredit = config.vatOpeningCredit;
  for (let month = 1; month <= 12; month++) {
    const input = context.months.find(row => row.year === year && row.month === month) ?? defaultJdgMonth(year, month), summary = invoiceSummary(ledger.documents, ledger.payments, year, month), issues: string[] = [];
    cumulativeIncome += summary.income; cumulativeCost += summary.cost; cumulativeSocial += input.socialDeduction; cumulativeHealth += input.healthPaid; cumulativeHealthInCosts += input.healthInCosts; cumulativeOther += input.otherDeductions;
    const healthAllowed = Math.max(0, Math.min(cumulativeHealth, healthLimit) - cumulativeHealthInCosts);
    const healthCostInvalid = config.taxForm === "linear" ? cumulativeHealthInCosts > healthLimit : cumulativeHealthInCosts > 0;
    if (healthCostInvalid) issues.push(config.taxForm === "linear" ? "Składka zdrowotna ujęta w kosztach przekracza roczny limit. Skoryguj koszty." : "Na tej formie opodatkowania składka zdrowotna nie jest kosztem PIT. Skoryguj jej ujęcie.");
    const base = Math.max(0, cumulativeIncome - cumulativeCost - cumulativeSocial - cumulativeOther - (config.taxForm === "linear" ? healthAllowed : 0));
    let pitTaxYtd = config.taxForm === "scale" ? scaleWithRelief(base) : linearTax(base), pitDue: number | null;
    if (config.taxForm === "lump_sum") {
      const bucket = lumpSumTax(bucketsFor(ledger.documents, year, month), deductionCarry + input.socialDeduction + input.healthPaid / 2 + input.otherDeductions);
      deductionCarry = Math.max(0, bucket.unused); pitDue = bucket.negativeRates.length ? null : bucket.tax;
      if (pitDue === null) issues.push("Ujemny przychód ryczałtowy dla stawki wymaga sprawdzenia sposobu ujęcia korekty.");
      pitTaxYtd = lumpSumTax(bucketsFor(ledger.documents.filter(doc => Number(doc.taxDate.slice(5, 7)) <= month), year), cumulativeSocial + cumulativeHealth / 2 + cumulativeOther).tax;
    } else { pitDue = Math.max(0, pitTaxYtd - priorDue); priorDue += pitDue; }
    if (healthCostInvalid || (config.taxForm === "lump_sum" && config.previousYearRevenue !== null && config.previousYearRevenue > lumpSumEligibilityLimit(year)!)) pitDue = null;
    const vatDeclaredOutput = outputVatDeclaration(ledger.documents, year, month), vatDeclaredInput = signedWholeZloty(summary.purchaseVat), difference = vatDeclaredOutput - vatDeclaredInput - vatCredit;
    const excess = Math.max(0, -difference), vatRefund = Math.min(input.vatRefundRequested, excess);
    if (input.vatRefundRequested > excess) issues.push("Kwota VAT wskazana do zwrotu przekracza dostępną nadwyżkę.");
    vatCredit = excess - vatRefund;
    rows.push({ ...summary, month, input, pitTaxYtd, pitDue, pitPaid: input.pitPaid, vatDue: Math.max(0, difference), vatCredit, vatRefund, vatDeclaredOutput, vatDeclaredInput, pitDeadline: taxPaymentDeadline(year, month, "pit"), vatDeadline: taxPaymentDeadline(year, month, "vat"), issues });
  }
  const annual = invoiceSummary(ledger.documents, ledger.payments, year), dn = aggregate(legacy, year, 0);
  const positiveProfit = Math.max(0, annual.profit), businessDeductions = cumulativeOther + config.businessDeductions, healthAllowed = Math.max(0, Math.min(cumulativeHealth, healthLimit) - cumulativeHealthInCosts);
  const businessBase = Math.max(0, positiveProfit - businessDeductions - cumulativeSocial - (config.taxForm === "linear" ? healthAllowed : 0));
  const primaryPaid = rows.reduce((sum, row) => sum + row.pitPaid, 0) + (config.taxForm === "scale" ? config.otherAdvances : 0);
  const combinedScaleBase = Math.max(0, config.otherIncome + Math.max(0, dn.profit) + Math.max(0, positiveProfit - businessDeductions) - cumulativeSocial - config.scaleDeductions);
  const lump = lumpSumTax(bucketsFor(ledger.documents, year), cumulativeSocial + cumulativeHealth / 2 + businessDeductions);
  const primaryTax = config.taxForm === "scale" ? scaleWithRelief(combinedScaleBase, config.scaleRelief) : config.taxForm === "linear" ? linearTax(businessBase) : lump.tax;
  const separateScaleBase = Math.max(0, config.otherIncome + Math.max(0, dn.profit) - config.scaleDeductions);
  const secondaryTax = config.taxForm === "scale" ? 0 : scaleWithRelief(separateScaleBase, config.scaleRelief);
  const legacyVatSales = config.legacyVatSales ?? dn.due;
  const vatSales = ledger.documents.filter(doc => doc.status === "issued" && doc.direction === "sale" && doc.saleDate.startsWith(String(year)) && (doc as Invoice & { vatLimitIncluded?: boolean }).vatLimitIncluded !== false).reduce((sum, doc) => sum + doc.net, 0) + legacyVatSales;
  const issues = rows.flatMap(row => row.issues.map(issue => `${String(row.month).padStart(2, "0")}.${year}: ${issue}`));
  const ineligible = config.taxForm === "lump_sum" && config.previousYearRevenue !== null && config.previousYearRevenue > lumpSumEligibilityLimit(year)!;
  if (ineligible) issues.unshift(`Przychód poprzedniego roku przekracza limit ryczałtu na ${year} r. Wybierz właściwą formę rozliczenia.`);
  if (config.taxForm === "lump_sum" && lump.negativeRates.length) issues.push("Roczny przychód dla jednej ze stawek ryczałtu jest ujemny — sprawdź korekty.");
  const annualValid = !ineligible && !(config.taxForm === "lump_sum" && lump.negativeRates.length) && !(config.taxForm === "linear" ? cumulativeHealthInCosts > healthLimit : cumulativeHealthInCosts > 0);
  return { year, taxForm: config.taxForm as TaxForm, rows, annual, dn, primaryTax, primaryPaid, primaryBalance: primaryTax - primaryPaid, secondaryTax, secondaryPaid: config.otherAdvances, secondaryBalance: secondaryTax - config.otherAdvances, businessBase, combinedScaleBase, primaryForm: config.taxForm === "scale" ? "PIT-36" : config.taxForm === "linear" ? "PIT-36L" : "PIT-28", healthAllowed, healthLimit, lump, vatSales, legacyVatSales, vatLimit: vatExemptionLimit(year, config.activityStartDate), annualValid, issues };
}
