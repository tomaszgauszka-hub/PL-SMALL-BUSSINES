export type BusinessType = "dn" | "jdg";
export type TaxForm = "scale" | "linear" | "lump_sum";
export type VatRate = "23" | "8" | "5" | "0" | "zw" | "np";
export const VAT_RATES: VatRate[] = ["23", "8", "5", "0", "zw", "np"];
export const LUMP_SUM_RATES = [2, 3, 5.5, 8.5, 10, 12, 12.5, 14, 15, 17];
export const TAX_FORM_LABELS: Record<TaxForm, string> = { scale: "Skala podatkowa", linear: "Podatek liniowy 19%", lump_sum: "Ryczałt od przychodów" };
export type BusinessProfile = { businessType: BusinessType; initialType: BusinessType; jdgStartDate: string; taxForm: TaxForm; vatStatus: "exempt" | "active"; vatStartDate: string; exemptionBasis: string; configured: boolean; version: number };
export type CatalogItem = { id: string; name: string; kind: "product" | "service"; sku: string; unit: string; unitPrice: number; vatRate: VatRate; lumpSumRate: number; description: string; archived: boolean; version: number };
export type BusinessEvent = { id: string; fromType: BusinessType; toType: BusinessType; effectiveDate: string; createdAt: string };
export type BusinessState = { profile: BusinessProfile | null; products: CatalogItem[]; events: BusinessEvent[] };
export function emptyBusinessState(): BusinessState { return { profile: null, products: [], events: [] }; }
export function businessLabel(type: BusinessType) { return type === "jdg" ? "Jednoosobowa działalność gospodarcza" : "Działalność nierejestrowana"; }
export function defaultBusinessProfile(type: BusinessType = "dn"): BusinessProfile { return { businessType: type, initialType: type, jdgStartDate: "", taxForm: "scale", vatStatus: "exempt", vatStartDate: "", exemptionBasis: "art. 113 ust. 1 lub 9 ustawy o VAT", configured: type === "dn", version: 0 }; }
export function demoBusinessState(): BusinessState { return { profile: defaultBusinessProfile(), events: [], products: [
  { id: "00000000-0000-4000-8000-000000000801", name: "Zaproszenie ślubne", kind: "product", sku: "PAP-001", unit: "szt.", unitPrice: 1500, vatRate: "zw", lumpSumRate: 550, description: "Zaproszenie z kopertą i personalizacją", archived: false, version: 1 },
  { id: "00000000-0000-4000-8000-000000000802", name: "Projekt graficzny", kind: "service", sku: "USL-001", unit: "usł.", unitPrice: 25000, vatRate: "zw", lumpSumRate: 1500, description: "Projekt indywidualny", archived: false, version: 1 },
] }; }

export type ClassificationSource = "" | "user_confirmed" | "pkd_hint" | "ai_suggestion" | "legacy_rate_only";
// Income tax (ryczałt category and rate) and VAT treatment are separate fields
// on every line. revenueCategory is the art. 12 ust. 1 provision confirmed by the user.
export type InvoiceLineInput = { name: string; unit: string; quantityMilli: number; unitPrice: number; vatRate: VatRate; discountBps: number; lumpSumRate: number; productId: string; revenueCategory?: string; classificationSource?: ClassificationSource; pkwiu?: string };
const MAX_MONEY = 99999999999n;
function roundRatio(n: bigint, d: bigint): bigint { return n < 0n ? -((-n + d / 2n) / d) : (n + d / 2n) / d; }
// Exact integer arithmetic: amounts are grosze, quantities have three decimals.
export function calculateInvoiceLine(line: InvoiceLineInput) {
  for (const value of [line.quantityMilli, line.unitPrice, line.discountBps]) if (!Number.isSafeInteger(value)) throw new Error("Nieprawidłowe wartości pozycji.");
  if (line.unitPrice < 0 || line.unitPrice > Number(MAX_MONEY) || Math.abs(line.quantityMilli) > 1000000000 || !line.quantityMilli || line.discountBps < 0 || line.discountBps > 10000 || !VAT_RATES.includes(line.vatRate)) throw new Error("Pozycja poza obsługiwanym zakresem.");
  const net = roundRatio(BigInt(line.quantityMilli) * BigInt(line.unitPrice) * BigInt(10000 - line.discountBps), 10000000n);
  const vat = roundRatio(net * BigInt(["zw", "np"].includes(line.vatRate) ? 0 : Number(line.vatRate)), 100n);
  if ([net, vat, net + vat].some(n => n > MAX_MONEY || n < -MAX_MONEY)) throw new Error("Wartość pozycji jest za duża.");
  return { net: Number(net), vat: Number(vat), gross: Number(net + vat) };
}
export function calculateInvoice(lines: InvoiceLineInput[]) {
  if (!lines.length || lines.length > 100) throw new Error("Dokument wymaga od 1 do 100 pozycji.");
  const result = lines.reduce((sum, line) => { const value = calculateInvoiceLine(line); return { net: sum.net + value.net, vat: sum.vat + value.vat, gross: sum.gross + value.gross }; }, { net: 0, vat: 0, gross: 0 });
  if (Object.values(result).some(value => !Number.isSafeInteger(value) || Math.abs(value) > Number(MAX_MONEY))) throw new Error("Wartość dokumentu jest za duża.");
  return result;
}
