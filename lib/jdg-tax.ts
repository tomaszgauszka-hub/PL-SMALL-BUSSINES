import { z } from "zod";
import type { Inventory } from "./inventory.ts";
import { inventoryEffect } from "./inventory.ts";
import type { BusinessProfile, TaxForm } from "./business.ts";
import { calculateInvoiceLine } from "./business.ts";
import type { Invoice, InvoiceState } from "./invoices.ts";
import { invoiceSummary } from "./invoices.ts";
import type { State } from "./domain.ts";
import { aggregate, emptyState, nextBusinessDate, roundedPLN, scaleTaxRawCents, validDate } from "./domain.ts";
import type { LumpSumRevenue, LumpSumYearResult } from "./lump-sum.ts";
import { calculateLumpSumYear, taxByRate } from "./lump-sum.ts";
import type { ReviewResult, ReviewStatus } from "./review-status.ts";
import { worstStatus } from "./review-status.ts";
import type { ReviewDocument } from "./document-review.ts";
import { reviewLedger } from "./document-review.ts";
import { findRule } from "./tax-rules.ts";
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
export function lumpSumEligibilityLimit(year: number) { return findRule("RYCZALT_ELIGIBILITY_LIMIT", `${year}-12-31`)?.params.previousYearRevenueLimit ?? null; }
function scaleWithRelief(base: number, relief = 0) { return roundedPLN(Math.max(0, scaleTaxRawCents(base) - relief)) * 100; }
function linearTax(base: number) { return roundedPLN(roundedPLN(base) * 19) * 100; }
export function vatExemptionLimit(year: number, activityStartDate: string): number | null {
  if (![2025, 2026].includes(year) || !validDate(activityStartDate)) return null;
  const annual = findRule("VAT_EXEMPTION_LIMIT", `${year}-12-31`)!.params.annualLimit;
  if (activityStartDate < `${year}-01-01`) return annual;
  if (activityStartDate > `${year}-12-31`) return 0;
  const start = Date.UTC(year, 0, 1), end = Date.UTC(year + 1, 0, 1), activity = Date.parse(activityStartDate + "T00:00:00Z");
  return Math.floor(annual * (end - activity) / (end - start));
}
// Compatibility wrapper: the multi-rate engine lives in lump-sum.ts.
export function lumpSumTax(incomeByRate: Map<number, number>, requestedDeduction: number) {
  const result = taxByRate(incomeByRate, requestedDeduction * 2), used = result.usedUnits / 2;
  return { tax: result.tax, income: result.income, used, unused: requestedDeduction - used, buckets: result.buckets.map(bucket => ({ rate: bucket.rateBps, income: bucket.revenue, deduction: bucket.deduction, base: bucket.base })), negativeRates: [...incomeByRate].filter(([, amount]) => amount < 0).map(([rate]) => rate) };
}
// Ryczałt revenue: issued sale lines by their PIT date. Net amounts exclude VAT;
// for a VAT-exempt seller net equals gross.
export function lumpSumRevenues(documents: Invoice[], year: number): LumpSumRevenue[] {
  return documents.filter(doc => doc.status === "issued" && doc.direction === "sale" && doc.taxDate.startsWith(String(year) + "-"))
    .flatMap(doc => doc.lines.map(line => ({ month: Number(doc.taxDate.slice(5, 7)), amount: calculateInvoiceLine(line).net, rateBps: line.lumpSumRate, categoryId: line.revenueCategory || null })));
}
function outputVatDeclaration(documents: Invoice[], year: number, month: number) {
  const groups = new Map<string, number>();
  for (const doc of documents.filter(doc => doc.status === "issued" && doc.direction === "sale" && doc.vatDate.startsWith(`${year}-${String(month).padStart(2, "0")}`))) for (const line of doc.lines) groups.set(line.vatRate, (groups.get(line.vatRate) ?? 0) + calculateInvoiceLine(line).vat);
  return [...groups.values()].reduce((sum, amount) => sum + signedWholeZloty(amount), 0);
}
export type JdgTaxMonth = ReturnType<typeof invoiceSummary> & { month: number; input: JdgMonth; pitTaxYtd: number; inventoryAdjustment: number; taxProfitYtd: number; inventoryValid: boolean; pitDue: number | null; pitPaid: number; vatDue: number; vatCredit: number; vatRefund: number; vatDeclaredOutput: number; vatDeclaredInput: number; pitDeadline: string; vatDeadline: string; issues: string[]; lumpSum: LumpSumYearResult["months"][number] | null; review: { status: ReviewStatus; open: number } };
export function calculateJdgTaxes(ledger: InvoiceState, context: JdgTaxState, config: JdgYear, legacy: State, inventories: Inventory[] = [], jdgStartDate = "", options: { vatActive?: boolean } = {}) {
  const year = config.year, healthLimit = findRule("PIT_LINEAR_HEALTH_LIMIT", `${year}-12-31`)!.params.annualLimit;
  const monthInput = (month: number) => context.months.find(row => row.year === year && row.month === month) ?? defaultJdgMonth(year, month);
  const lumpYear = config.taxForm === "lump_sum" ? calculateLumpSumYear({ year, revenues: lumpSumRevenues(ledger.documents, year), annualDeductions: config.businessDeductions,
    deductions: Array.from({ length: 12 }, (_, i) => { const row = monthInput(i + 1); return { social: row.socialDeduction, health: row.healthPaid, other: row.otherDeductions }; }) }) : null;
  // Every issued document is assessed; open questions keep the period unverified.
  const issued = ledger.documents.filter(doc => doc.status === "issued");
  const reviews: Map<string, ReviewResult> = reviewLedger(issued as unknown as (ReviewDocument & { id: string; parentId: string })[], { taxForm: config.taxForm, vatActive: options.vatActive ?? true });
  const monthReview = (month: number) => { const docs = issued.filter(doc => doc.taxDate.startsWith(`${year}-${String(month).padStart(2, "0")}`) || doc.vatDate.startsWith(`${year}-${String(month).padStart(2, "0")}`)).map(doc => reviews.get(doc.id)!); return { status: worstStatus(docs.map(r => r.status)), open: docs.filter(r => r.status !== "AUTO_VERIFIED").length }; };
  let lumpTaxYtd = 0;
  const rows: JdgTaxMonth[] = [];
  let unresolvedInventory = false;
  let cumulativeIncome = 0, cumulativeCost = 0, cumulativeSocial = 0, cumulativeHealth = 0, cumulativeHealthInCosts = 0, cumulativeOther = 0, priorDue = 0, vatCredit = config.vatOpeningCredit;
  for (let month = 1; month <= 12; month++) {
    const input = monthInput(month), summary = invoiceSummary(ledger.documents, ledger.payments, year, month), issues: string[] = [];
    cumulativeIncome += summary.income; cumulativeCost += summary.cost; cumulativeSocial += input.socialDeduction; cumulativeHealth += input.healthPaid; cumulativeHealthInCosts += input.healthInCosts; cumulativeOther += input.otherDeductions;
    const healthAllowed = Math.max(0, Math.min(cumulativeHealth, healthLimit) - cumulativeHealthInCosts);
    const healthCostInvalid = config.taxForm === "linear" ? cumulativeHealthInCosts > healthLimit : cumulativeHealthInCosts > 0;
    if (healthCostInvalid) issues.push(config.taxForm === "linear" ? "Składka zdrowotna ujęta w kosztach przekracza roczny limit. Skoryguj koszty." : "Na tej formie opodatkowania składka zdrowotna nie jest kosztem PIT. Skoryguj jej ujęcie.");
    const stock = inventoryEffect(inventories, year, jdgStartDate, month), inventoryAdjustment = config.taxForm === "lump_sum" ? 0 : stock.adjustment;
    if (config.taxForm !== "lump_sum" && !stock.valid) unresolvedInventory = true;
    if (unresolvedInventory) issues.push("Brak spisu początkowego dla zatwierdzonego remanentu. Uzupełnij go, aby wyliczyć tę i kolejne zaliczki.");
    const taxProfitYtd = cumulativeIncome - cumulativeCost + inventoryAdjustment;
    const base = Math.max(0, taxProfitYtd - cumulativeSocial - cumulativeOther - (config.taxForm === "linear" ? healthAllowed : 0));
    let pitTaxYtd = config.taxForm === "scale" ? scaleWithRelief(base) : linearTax(base), pitDue: number | null;
    const lumpPeriod = lumpYear ? lumpYear.months[month - 1] : null, review = monthReview(month);
    if (lumpPeriod) {
      // Ryczałt is due for each month's revenue; it is not an advance on a cumulative base.
      pitDue = lumpPeriod.tax; lumpTaxYtd += lumpPeriod.tax; pitTaxYtd = lumpTaxYtd;
      if (lumpPeriod.negativeCarry.length) issues.push("Korekta przewyższa przychód stawki w tym miesiącu — nadwyżkę zmniejszenia przenosimy na kolejne miesiące (art. 6 ust. 1e ustawy o ryczałcie).");
    } else { pitDue = unresolvedInventory ? null : Math.max(0, pitTaxYtd - priorDue); priorDue += pitDue ?? 0; }
    if (healthCostInvalid || (config.taxForm === "lump_sum" && config.previousYearRevenue !== null && config.previousYearRevenue > lumpSumEligibilityLimit(year)!)) pitDue = null;
    if (review.status === "UNSUPPORTED_OR_INVALID") { pitDue = null; issues.push("Dokument z tego okresu ma nieobsługiwane lub błędne ujęcie podatkowe. Wynik wymaga poprawy dokumentu."); }
    else if (review.open) issues.push(`${review.open === 1 ? "1 dokument wymaga" : `${review.open} dokumenty wymagają`} decyzji przed zatwierdzeniem rozliczenia.`);
    const vatDeclaredOutput = outputVatDeclaration(ledger.documents, year, month), vatDeclaredInput = signedWholeZloty(summary.purchaseVat), difference = vatDeclaredOutput - vatDeclaredInput - vatCredit;
    const excess = Math.max(0, -difference), vatRefund = Math.min(input.vatRefundRequested, excess);
    if (input.vatRefundRequested > excess) issues.push("Kwota VAT wskazana do zwrotu przekracza dostępną nadwyżkę.");
    vatCredit = excess - vatRefund;
    rows.push({ ...summary, month, input, pitTaxYtd, inventoryAdjustment, taxProfitYtd, inventoryValid: !unresolvedInventory, pitDue, pitPaid: input.pitPaid, vatDue: Math.max(0, difference), vatCredit, vatRefund, vatDeclaredOutput, vatDeclaredInput, pitDeadline: taxPaymentDeadline(year, month, "pit"), vatDeadline: taxPaymentDeadline(year, month, "vat"), issues, lumpSum: lumpPeriod, review });
  }
  const annual = invoiceSummary(ledger.documents, ledger.payments, year), dn = aggregate(legacy, year, 0);
  const inventory = inventoryEffect(inventories, year, jdgStartDate), inventoryApplicable = config.taxForm !== "lump_sum";
  const taxProfit = annual.profit + (inventoryApplicable ? inventory.adjustment : 0);
  const positiveProfit = Math.max(0, taxProfit), businessDeductions = cumulativeOther + config.businessDeductions, healthAllowed = Math.max(0, Math.min(cumulativeHealth, healthLimit) - cumulativeHealthInCosts);
  const businessBase = Math.max(0, positiveProfit - businessDeductions - cumulativeSocial - (config.taxForm === "linear" ? healthAllowed : 0));
  const primaryPaid = rows.reduce((sum, row) => sum + row.pitPaid, 0) + (config.taxForm === "scale" ? config.otherAdvances : 0);
  const combinedScaleBase = Math.max(0, config.otherIncome + Math.max(0, dn.profit) + Math.max(0, positiveProfit - businessDeductions) - cumulativeSocial - config.scaleDeductions);
  const annualLump = lumpYear?.annual;
  const lump = { tax: annualLump?.tax ?? 0, income: annualLump?.revenue ?? 0, used: annualLump?.deductionUsed ?? 0, unused: annualLump?.deductionUnused ?? 0, negativeRates: annualLump?.negativeRates ?? [],
    buckets: (annualLump?.buckets ?? []).map(bucket => ({ rate: bucket.rateBps, income: bucket.revenue, deduction: bucket.deduction, base: bucket.base, tax: bucket.tax })), categories: annualLump?.categories ?? [] };
  const primaryTax = config.taxForm === "scale" ? scaleWithRelief(combinedScaleBase, config.scaleRelief) : config.taxForm === "linear" ? linearTax(businessBase) : lump.tax;
  const separateScaleBase = Math.max(0, config.otherIncome + Math.max(0, dn.profit) - config.scaleDeductions);
  const secondaryTax = config.taxForm === "scale" ? 0 : scaleWithRelief(separateScaleBase, config.scaleRelief);
  const legacyVatSales = config.legacyVatSales ?? dn.due;
  const vatSales = ledger.documents.filter(doc => doc.status === "issued" && doc.direction === "sale" && doc.saleDate.startsWith(String(year)) && (doc as Invoice & { vatLimitIncluded?: boolean }).vatLimitIncluded !== false).reduce((sum, doc) => sum + doc.net, 0) + legacyVatSales;
  const issues = rows.flatMap(row => row.issues.map(issue => `${String(row.month).padStart(2, "0")}.${year}: ${issue}`));
  const ineligible = config.taxForm === "lump_sum" && config.previousYearRevenue !== null && config.previousYearRevenue > lumpSumEligibilityLimit(year)!;
  if (ineligible) issues.unshift(`Przychód poprzedniego roku przekracza limit ryczałtu na ${year} r. Wybierz właściwą formę rozliczenia.`);
  if (lumpYear) issues.push(...lumpYear.issues);
  const yearReviews = issued.filter(doc => doc.taxDate.startsWith(String(year) + "-") || doc.vatDate.startsWith(String(year) + "-")).map(doc => reviews.get(doc.id)!);
  const reviewStatus = worstStatus(yearReviews.map(review => review.status)), unsupportedDocuments = yearReviews.filter(review => review.status === "UNSUPPORTED_OR_INVALID").length;
  const annualValid = (!inventoryApplicable || inventory.valid) && !ineligible && !(lumpYear && lumpYear.annual.uncoveredReduction) && !unsupportedDocuments && !(config.taxForm === "linear" ? cumulativeHealthInCosts > healthLimit : cumulativeHealthInCosts > 0);
  if (inventoryApplicable && !inventory.valid) issues.push("Roczny remanent nie ma spisu początkowego — roczny PIT wymaga uzupełnienia danych.");
  return { inventory, inventoryApplicable, taxProfit, year, taxForm: config.taxForm as TaxForm, rows, annual, dn, primaryTax, primaryPaid, primaryBalance: primaryTax - primaryPaid, secondaryTax, secondaryPaid: config.otherAdvances, secondaryBalance: secondaryTax - config.otherAdvances, businessBase, combinedScaleBase, primaryForm: config.taxForm === "scale" ? "PIT-36" : config.taxForm === "linear" ? "PIT-36L" : "PIT-28", healthAllowed, healthLimit, lump, vatSales, legacyVatSales, vatLimit: vatExemptionLimit(year, config.activityStartDate), annualValid, issues, lumpSumYear: lumpYear, reviews, reviewStatus, openDocuments: yearReviews.filter(review => review.status !== "AUTO_VERIFIED").length, verified: annualValid && reviewStatus === "AUTO_VERIFIED" };
}

export type SupportedYear = 2025 | 2026;
// One place that resolves the year settings and report used by every JDG view.
export function jdgYearConfig(tax: JdgTaxState, year: SupportedYear, profile: BusinessProfile, legacy: State): JdgYear {
  const activityDate = profile.initialType === "dn" ? legacy.settings.startDate || profile.jdgStartDate : profile.jdgStartDate;
  return tax.years.find(row => row.year === year) ?? defaultJdgYear(year, profile, activityDate);
}
export function jdgReport(ledger: InvoiceState, tax: JdgTaxState, profile: BusinessProfile, legacy: State, inventories: Inventory[], year: SupportedYear) {
  const config = jdgYearConfig(tax, year, profile, legacy);
  return { config, report: calculateJdgTaxes(ledger, tax, config, profile.initialType === "dn" ? legacy : emptyState(), inventories, profile.jdgStartDate, { vatActive: profile.vatStatus === "active" }) };
}
export type JdgReport = ReturnType<typeof calculateJdgTaxes>;
export function taxFormForYear(tax: JdgTaxState, profile: BusinessProfile) { return (year: number): TaxForm => tax.years.find(row => row.year === year)?.taxForm ?? profile.taxForm; }
