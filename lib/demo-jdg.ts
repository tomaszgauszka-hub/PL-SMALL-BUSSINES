// Fictitious JDG for the public demo: a small design and print studio on
// ryczałt with four rates, VAT active. All names and NIP numbers are invented
// (NIPs only pass the checksum). Paid taxes for January–August equal the
// calculated amounts; September waits for payment; October has open questions.
import type { BusinessProfile, CatalogItem, InvoiceLineInput } from "./business.ts";
import { calculateInvoice, defaultBusinessProfile } from "./business.ts";
import type { Invoice, InvoicePayment, InvoiceState } from "./invoices.ts";
import type { JdgMonth, JdgTaxState, JdgYear } from "./jdg-tax.ts";
import { calculateJdgTaxes, defaultJdgMonth, defaultJdgYear } from "./jdg-tax.ts";
import { emptyState } from "./domain.ts";

export const DEMO_SELLER = { name: "Pracownia Oli — przykład", address: "ul. Przykładowa 8, 30-001 Kraków", nip: "" };
export function demoJdgProfile(): BusinessProfile {
  return { ...defaultBusinessProfile("jdg"), configured: true, jdgStartDate: "2026-01-01", taxForm: "lump_sum", vatStatus: "active", vatStartDate: "2026-01-01", version: 1 };
}
const pid = (n: number) => `00000000-0000-4000-8000-${String(800 + n).padStart(12, "0")}`;
export function demoJdgProducts(): CatalogItem[] {
  return [
    { id: pid(11), name: "Zaproszenie ślubne z personalizacją", kind: "product", sku: "ZAP-01", unit: "szt.", unitPrice: 1500, vatRate: "23", lumpSumRate: 550, description: "Wytwarzanie — art. 12 ust. 1 pkt 6 lit. a", archived: false, version: 1 },
    { id: pid(12), name: "Projekt graficzny", kind: "service", sku: "PRJ-01", unit: "usł.", unitPrice: 60000, vatRate: "23", lumpSumRate: 1400, description: "Specjalistyczne projektowanie, PKWiU 74.10 — pkt 2a lit. c", archived: false, version: 1 },
    { id: pid(13), name: "Warsztaty kaligrafii", kind: "service", sku: "WAR-01", unit: "godz.", unitPrice: 30000, vatRate: "23", lumpSumRate: 850, description: "Edukacja, PKWiU 85 — pkt 5 lit. c", archived: false, version: 1 },
    { id: pid(14), name: "Kartki okolicznościowe (towar)", kind: "product", sku: "TOW-01", unit: "szt.", unitPrice: 1200, vatRate: "23", lumpSumRate: 300, description: "Działalność handlowa — pkt 7 lit. b", archived: false, version: 1 },
  ];
}

type LineSpec = [name: string, unit: string, quantity: number, priceZl: number, category: string, rateBps: number, confirmed?: "pkd_hint"];
const line = ([name, unit, quantity, priceZl, category, rateBps, source]: LineSpec): InvoiceLineInput =>
  ({ name, unit, quantityMilli: Math.round(quantity * 1000), unitPrice: Math.round(priceZl * 100), vatRate: "23", discountBps: 0, lumpSumRate: rateBps, productId: "", revenueCategory: category, classificationSource: source ?? "user_confirmed", pkwiu: "" });
const iid = (n: number) => `00000000-0000-4000-8000-${String(9000 + n).padStart(12, "0")}`;
const day = (month: number, d: number) => `2026-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const CONSUMER = { partyName: "Klient indywidualny", partyAddress: "Kraków", partyNip: "" };
const HOTEL = { partyName: "Hotel Przykładowy sp. z o.o.", partyAddress: "ul. Testowa 1, 30-002 Kraków", partyNip: "1111111111" };
const CAFE = { partyName: "Kawiarnia Przykładowa s.c.", partyAddress: "ul. Testowa 5, 30-003 Kraków", partyNip: "2222222222" };
const PAPER = { partyName: "Hurtownia Papieru — przykład", partyAddress: "ul. Magazynowa 2, Kraków", partyNip: "3333333333" };
const FUEL = { partyName: "Stacja paliw — przykład", partyAddress: "ul. Drogowa 9, Kraków", partyNip: "4444444444" };
const SHOP = { partyName: "Sklep komputerowy — przykład", partyAddress: "ul. Cyfrowa 3, Kraków", partyNip: "5555555555" };

function invoice(n: number, direction: "sale" | "purchase", date: string, party: typeof CONSUMER, lines: InvoiceLineInput[], extra: Partial<Invoice> = {}): Invoice {
  const totals = calculateInvoice(lines), vatShare = extra.vatDeductionBps ?? (direction === "purchase" ? 10000 : 0), costShare = extra.costDeductionBps ?? (direction === "purchase" ? 10000 : 0);
  const deductibleVat = direction === "purchase" ? Math.round(totals.vat * vatShare / 10000) : 0;
  const status = extra.status ?? "issued", kind = extra.kind ?? "regular";
  return { id: iid(n), direction, status, kind, number: "", clientId: "", ...party, issueDate: date, saleDate: date, dueDate: date, taxDate: date, vatDate: date, receivedDate: date, lines, parentId: "", reason: "", notes: "",
    vatDeductionBps: vatShare, costDeductionBps: costShare, costCategory: "goods", exemptionBasis: "", paymentAccount: "", splitPayment: false, vatLimitIncluded: true, initialPayment: 0, paymentDate: date, method: "Przelew", version: 1,
    ...totals, deductibleVat, pitCost: direction === "purchase" ? Math.round((totals.gross - deductibleVat) * costShare / 10000) : 0, seller: DEMO_SELLER, source: null,
    createdAt: `${date}T10:00:00Z`, issuedAt: status === "issued" ? `${date}T10:00:00Z` : "", ...extra };
}

export function demoJdgLedger(): InvoiceState {
  const documents: Invoice[] = [], payments: InvoicePayment[] = [];
  const season = [0, 0.6, 0.7, 0.9, 1.1, 1.4, 1.5, 1.3, 1.4, 1.2, 0.8];
  let fv = 0, zak = 0, n = 0;
  const sale = (date: string, party: typeof CONSUMER, specs: LineSpec[], extra: Partial<Invoice> = {}) => { const doc = invoice(++n, "sale", date, party, specs.map(line), { supplyStructure: new Set(specs.map(s => s[5])).size > 1 ? "separate" : "", ...extra }); if (doc.status === "issued") doc.number = doc.kind === "correction" ? doc.number : `FV/2026/${++fv}`; documents.push(doc); return doc; };
  const purchase = (date: string, party: typeof PAPER, name: string, netZl: number, extra: Partial<Invoice> = {}) => { const doc = invoice(++n, "purchase", date, party, [{ ...line([name, "szt.", 1, netZl, "", 0]), revenueCategory: undefined, classificationSource: undefined, pkwiu: undefined, lumpSumRate: 850 }], { number: `ZAK/${String(++zak).padStart(3, "0")}/2026`, ...extra }); documents.push(doc); return doc; };
  for (let month = 1; month <= 10; month++) {
    const f = season[month], last = month === 10;
    sale(day(month, 6), CONSUMER, [["Zaproszenia ślubne z personalizacją", "szt.", Math.round(160 * f), 15, "p6-a", 550], ["Projekt graficzny zaproszenia", "usł.", 1, 600, "p2a-c", 1400]]);
    if (month % 2 === 0 || last) sale(day(month, 12), HOTEL, [["Warsztaty kaligrafii dla zespołu", "godz.", 8, 350, "p5-c", 850], ["Kartki okolicznościowe (towar)", "szt.", Math.round(120 * f), 12, "p7-b", 300]]);
    if (!last) sale(day(month, 20), CAFE, [["Projekt identyfikacji wizualnej", "usł.", 1, Math.round(2600 * f), "p2a-c", 1400]]);
    purchase(day(month, 3), PAPER, "Papier, koperty i tusze do drukarki", Math.round(1400 * f + 400));
    if (month % 2 === 1) purchase(day(month, 15), FUEL, "Paliwo — samochód osobowy (użytek mieszany)", 380, { vatDeductionBps: 5000, costDeductionBps: 7500, costCategory: "other", reviewAnswers: { "purchase.vehicle": "mixed" } });
    for (const doc of documents.filter(doc => doc.status === "issued" && doc.issueDate.startsWith(day(month, 1).slice(0, 7)) && !last))
      payments.push({ id: iid(5000 + payments.length), invoiceId: doc.id, date: doc.issueDate, amount: doc.gross, method: "Przelew", note: "Przykładowa płatność", reversalOf: "", createdAt: `${doc.issueDate}T12:00:00Z` });
  }
  // June: return of 10 invitations from the May invoice (cause other than an error).
  const may = documents.find(doc => doc.direction === "sale" && doc.issueDate === day(5, 6))!;
  const correction = invoice(++n, "sale", day(6, 9), CONSUMER, [{ ...may.lines[0], quantityMilli: -10000 }], { kind: "correction", parentId: may.id, number: "FK/2026/1", reason: "Zwrot 10 zaproszeń", correctionCause: "other",
    source: { number: may.number, issueDate: may.issueDate, net: may.net, vat: may.vat, gross: may.gross, lines: may.lines } });
  documents.push(correction);
  // October: open questions shown in the review and the month settlement.
  sale(day(10, 14), CAFE, [["Projekt logo — kategoria z podpowiedzi PKD", "usł.", 1, 1800, "p2a-c", 1400, "pkd_hint"]]);
  purchase(day(10, 9), SHOP, "Laptop do projektowania", 5200);
  sale(day(10, 16), CONSUMER, [["Zaproszenia — szkic oferty", "szt.", 50, 15, "p6-a", 550]], { status: "draft" });
  return { documents: documents.sort((x, y) => y.issueDate.localeCompare(x.issueDate)), payments, attachments: [] };
}

const SOCIAL = 192676, HEALTH = 83058; // pełny ZUS 2026 z chorobowym; zdrowotna ryczałt 60–300 tys. zł (2026)
export function demoJdgTax(ledger = demoJdgLedger()): JdgTaxState {
  const year: JdgYear = { ...defaultJdgYear(2026, demoJdgProfile()), version: 1 };
  const months: JdgMonth[] = Array.from({ length: 9 }, (_, i) => ({ ...defaultJdgMonth(2026, i + 1), socialDeduction: SOCIAL, healthPaid: HEALTH, version: 1 }));
  const report = calculateJdgTaxes(ledger, { years: [year], months }, year, emptyState(), [], "2026-01-01", { vatActive: true });
  for (const row of months) if (row.month <= 8) { const calc = report.rows[row.month - 1]; row.pitPaid = calc.pitDue ?? 0; row.vatPaid = calc.vatDue; }
  return { years: [year], months };
}
