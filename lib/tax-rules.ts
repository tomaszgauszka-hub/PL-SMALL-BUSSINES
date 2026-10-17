// Versioned tax rules. Every amount used by a calculation comes from a rule
// that is valid on the date of the event being settled. A date outside every
// verified version is unsupported: we never fall back to "current" values.
//
// Amounts are in grosze, rates in basis points (1% = 100 bps).

export type TaxKind = "PIT" | "RYCZALT" | "VAT" | "GENERAL";
export type LegalBasis = { act: string; provision: string; url: string };

const ORDYNACJA = "Ordynacja podatkowa";
const PIT_ACT = "Ustawa o podatku dochodowym od osób fizycznych (Dz.U. 2026 poz. 592 ze zm.)";
const RYCZALT_ACT = "Ustawa o zryczałtowanym podatku dochodowym (Dz.U. 2025 poz. 843 ze zm.)";
const VAT_ACT = "Ustawa o podatku od towarów i usług";
const PIT_URL = "https://eli.gov.pl/api/acts/DU/2026/592/text/U/D20260592Lj.pdf";
const RYCZALT_URL = "https://eli.gov.pl/api/acts/DU/2025/843/text/U/D20250843Lj.pdf";

type RuleParams = {
  PIT_SCALE: { threshold: number; lowerRateBps: number; upperRateBps: number; taxReducingAmount: number };
  PIT_LINEAR: { rateBps: number };
  PIT_LINEAR_HEALTH_LIMIT: { annualLimit: number };
  PIT_ADVANCE_DEADLINE: { dayOfNextMonth: number };
  RYCZALT_ELIGIBILITY_LIMIT: { previousYearRevenueLimit: number; eurAmount: number; eurRate: string };
  RYCZALT_QUARTERLY_LIMIT: { previousYearRevenueLimit: number; eurAmount: number; eurRate: string };
  RYCZALT_RATE_CATALOGUE: { catalogueVersion: string; classification: string; classificationValidTo: string };
  RYCZALT_PKT4_THRESHOLD: { threshold: number; spousesThreshold: number; lowerRateBps: number; upperRateBps: number };
  RYCZALT_HEALTH_DEDUCTION: { shareBps: number };
  RYCZALT_DEDUCTION_ALLOCATION: { annual: "proportional_to_annual_revenue"; monthly: "proportional_to_period_revenue" };
  RYCZALT_CORRECTION_PERIOD: { otherCause: "correction_issue_period"; errorCause: "original_period"; shortfall: "following_periods" };
  RYCZALT_PAYMENT_DEADLINE: { dayOfNextMonth: number };
  ROUNDING_FULL_ZLOTY: { roundHalfUp: true };
  VAT_RATES: { rates: string[] };
  VAT_EXEMPTION_LIMIT: { annualLimit: number };
  VAT_PAYMENT_DEADLINE: { dayOfNextMonth: number };
  FIXED_ASSET_LOW_VALUE: { netLimit: number };
  MIXED_USE_CAR: { vatDeductionBps: number; pitCostBps: number };
};
export type RuleId = keyof RuleParams;
export type TaxRule<K extends RuleId = RuleId> = {
  id: K; tax: TaxKind; version: number; validFrom: string; validTo: string | null;
  legalBasis: LegalBasis[]; params: RuleParams[K]; tests: string[]; verifiedAt: string; note?: string;
};

export class UnsupportedPeriodError extends Error {
  ruleId: RuleId; date: string;
  constructor(ruleId: RuleId, date: string) { super(`Brak zweryfikowanej reguły ${ruleId} dla daty ${date}. Ten okres nie jest obsługiwany.`); this.name = "UnsupportedPeriodError"; this.ruleId = ruleId; this.date = date; }
}

const VERIFIED = "2026-10-17";
const YEAR_2025 = { validFrom: "2025-01-01", validTo: "2025-12-31" } as const;
const YEAR_2026 = { validFrom: "2026-01-01", validTo: "2026-12-31" } as const;
const YEARS_2025_2026 = { validFrom: "2025-01-01", validTo: "2026-12-31" } as const;

const RULES: { [K in RuleId]: TaxRule<K>[] } = {
  PIT_SCALE: [{ id: "PIT_SCALE", tax: "PIT", version: 1, ...YEARS_2025_2026, verifiedAt: VERIFIED,
    legalBasis: [{ act: PIT_ACT, provision: "art. 27 ust. 1", url: PIT_URL }],
    params: { threshold: 12000000, lowerRateBps: 1200, upperRateBps: 3200, taxReducingAmount: 360000 }, tests: ["tests/jdg-tax.test.mjs", "tests/tax-rules.test.mjs"] }],
  PIT_LINEAR: [{ id: "PIT_LINEAR", tax: "PIT", version: 1, ...YEARS_2025_2026, verifiedAt: VERIFIED,
    legalBasis: [{ act: PIT_ACT, provision: "art. 30c ust. 1", url: PIT_URL }], params: { rateBps: 1900 }, tests: ["tests/jdg-tax.test.mjs"] }],
  PIT_LINEAR_HEALTH_LIMIT: [
    { id: "PIT_LINEAR_HEALTH_LIMIT", tax: "PIT", version: 1, ...YEAR_2025, verifiedAt: VERIFIED, params: { annualLimit: 1290000 }, tests: ["tests/tax-rules.test.mjs"],
      legalBasis: [{ act: PIT_ACT, provision: "art. 26 ust. 1 pkt 2b, limit ogłoszony przez MF", url: "https://www.podatki.gov.pl/ulgi-i-odliczenia/odliczenie-skladek-na-ubezpieczenie-zdrowotne-pit" }] },
    { id: "PIT_LINEAR_HEALTH_LIMIT", tax: "PIT", version: 2, ...YEAR_2026, verifiedAt: VERIFIED, params: { annualLimit: 1410000 }, tests: ["tests/jdg-tax.test.mjs", "tests/tax-rules.test.mjs"],
      legalBasis: [{ act: PIT_ACT, provision: "art. 26 ust. 1 pkt 2b, limit ogłoszony przez MF", url: "https://www.podatki.gov.pl/ulgi-i-odliczenia/odliczenie-skladek-na-ubezpieczenie-zdrowotne-pit" }] },
  ],
  PIT_ADVANCE_DEADLINE: [{ id: "PIT_ADVANCE_DEADLINE", tax: "PIT", version: 1, ...YEARS_2025_2026, verifiedAt: VERIFIED, params: { dayOfNextMonth: 20 }, tests: ["tests/jdg-tax.test.mjs"],
    legalBasis: [{ act: PIT_ACT, provision: "art. 44 ust. 6", url: PIT_URL }, { act: ORDYNACJA, provision: "art. 12 § 5 (przesunięcie na dzień roboczy)", url: "https://eli.gov.pl/eli/DU/2025/111/ogl" }] }],
  RYCZALT_ELIGIBILITY_LIMIT: [
    { id: "RYCZALT_ELIGIBILITY_LIMIT", tax: "RYCZALT", version: 1, ...YEAR_2025, verifiedAt: VERIFIED, params: { previousYearRevenueLimit: 856920000, eurAmount: 2000000, eurRate: "4,2846 (NBP, 1.10.2024)" }, tests: ["tests/jdg-tax.test.mjs"],
      legalBasis: [{ act: RYCZALT_ACT, provision: "art. 6 ust. 4 pkt 1 lit. a, art. 4 ust. 2", url: RYCZALT_URL }] },
    { id: "RYCZALT_ELIGIBILITY_LIMIT", tax: "RYCZALT", version: 2, ...YEAR_2026, verifiedAt: VERIFIED, params: { previousYearRevenueLimit: 851720000, eurAmount: 2000000, eurRate: "4,2586 (NBP, 1.10.2025)" }, tests: ["tests/jdg-tax.test.mjs"],
      legalBasis: [{ act: RYCZALT_ACT, provision: "art. 6 ust. 4 pkt 1 lit. a, art. 4 ust. 2", url: RYCZALT_URL }] },
  ],
  RYCZALT_QUARTERLY_LIMIT: [
    { id: "RYCZALT_QUARTERLY_LIMIT", tax: "RYCZALT", version: 1, ...YEAR_2025, verifiedAt: VERIFIED, params: { previousYearRevenueLimit: 85692000, eurAmount: 200000, eurRate: "4,2846 (NBP, 1.10.2024)" }, tests: ["tests/tax-rules.test.mjs"],
      legalBasis: [{ act: RYCZALT_ACT, provision: "art. 21 ust. 1a i 1b, art. 4 ust. 2", url: RYCZALT_URL }] },
    { id: "RYCZALT_QUARTERLY_LIMIT", tax: "RYCZALT", version: 2, ...YEAR_2026, verifiedAt: VERIFIED, params: { previousYearRevenueLimit: 85172000, eurAmount: 200000, eurRate: "4,2586 (NBP, 1.10.2025)" }, tests: ["tests/tax-rules.test.mjs"],
      legalBasis: [{ act: RYCZALT_ACT, provision: "art. 21 ust. 1a i 1b, art. 4 ust. 2", url: RYCZALT_URL }] },
  ],
  RYCZALT_RATE_CATALOGUE: [{ id: "RYCZALT_RATE_CATALOGUE", tax: "RYCZALT", version: 1, ...YEARS_2025_2026, verifiedAt: VERIFIED, tests: ["tests/lump-sum.test.mjs"],
    params: { catalogueVersion: "art12-2025-843", classification: "PKWiU 2015 (Dz.U. 2015 poz. 1676)", classificationValidTo: "2028-12-31" },
    legalBasis: [{ act: RYCZALT_ACT, provision: "art. 12 ust. 1 pkt 1–8, art. 12 ust. 3", url: RYCZALT_URL },
      { act: "Rozporządzenie RM w sprawie PKWiU (Dz.U. 2025 poz. 1829)", provision: "§ 2 pkt 2 — PKWiU 2015 dla ryczałtu do 31.12.2028", url: "https://eli.gov.pl/api/acts/DU/2025/1829/text/I/D20251829.pdf" }],
    note: "Tekst ujednolicony obejmuje zmiany do Dz.U. 2026 poz. 779 i 1098; art. 12 nie zmienił się w 2026 r." }],
  RYCZALT_PKT4_THRESHOLD: [{ id: "RYCZALT_PKT4_THRESHOLD", tax: "RYCZALT", version: 1, ...YEARS_2025_2026, verifiedAt: VERIFIED, tests: ["tests/lump-sum.test.mjs"],
    params: { threshold: 10000000, spousesThreshold: 20000000, lowerRateBps: 850, upperRateBps: 1250 },
    legalBasis: [{ act: RYCZALT_ACT, provision: "art. 12 ust. 1 pkt 4, ust. 13 i 14", url: RYCZALT_URL }],
    note: "Próg liczony łącznie dla wszystkich przychodów z pkt 4 w roku, osobno dla działalności i najmu prywatnego (ust. 14)." }],
  RYCZALT_HEALTH_DEDUCTION: [{ id: "RYCZALT_HEALTH_DEDUCTION", tax: "RYCZALT", version: 1, ...YEARS_2025_2026, verifiedAt: VERIFIED, params: { shareBps: 5000 }, tests: ["tests/lump-sum.test.mjs"],
    legalBasis: [{ act: RYCZALT_ACT, provision: "art. 11 ust. 1a i 1b", url: RYCZALT_URL }] }],
  RYCZALT_DEDUCTION_ALLOCATION: [{ id: "RYCZALT_DEDUCTION_ALLOCATION", tax: "RYCZALT", version: 1, ...YEARS_2025_2026, verifiedAt: VERIFIED, tests: ["tests/lump-sum.test.mjs", "tests/jdg-tax.test.mjs"],
    params: { annual: "proportional_to_annual_revenue", monthly: "proportional_to_period_revenue" },
    legalBasis: [{ act: RYCZALT_ACT, provision: "art. 11 ust. 3 (rok), art. 21 ust. 3 (miesiące)", url: RYCZALT_URL }],
    note: "Rocznie proporcja przychodów roku podatkowego. Ustawa nie określa proporcji w miesiącu; aplikacja stosuje proporcję przychodów danego okresu, a rozliczenie roczne ją uzgadnia." }],
  RYCZALT_CORRECTION_PERIOD: [{ id: "RYCZALT_CORRECTION_PERIOD", tax: "RYCZALT", version: 1, ...YEARS_2025_2026, verifiedAt: VERIFIED, tests: ["tests/lump-sum.test.mjs"],
    params: { otherCause: "correction_issue_period", errorCause: "original_period", shortfall: "following_periods" },
    legalBasis: [{ act: RYCZALT_ACT, provision: "art. 6 ust. 1e", url: RYCZALT_URL }, { act: PIT_ACT, provision: "art. 14 ust. 1m", url: PIT_URL }],
    note: "Brak przychodu na pokrycie zmniejszenia: zmniejszenie w następnych okresach. Niepokryte zmniejszenie na koniec roku wymaga weryfikacji." }],
  RYCZALT_PAYMENT_DEADLINE: [{ id: "RYCZALT_PAYMENT_DEADLINE", tax: "RYCZALT", version: 1, ...YEARS_2025_2026, verifiedAt: VERIFIED, params: { dayOfNextMonth: 20 }, tests: ["tests/jdg-tax.test.mjs"],
    legalBasis: [{ act: RYCZALT_ACT, provision: "art. 21 ust. 1 i 1a", url: RYCZALT_URL }] }],
  ROUNDING_FULL_ZLOTY: [{ id: "ROUNDING_FULL_ZLOTY", tax: "GENERAL", version: 1, ...YEARS_2025_2026, verifiedAt: VERIFIED, params: { roundHalfUp: true }, tests: ["tests/domain.test.mjs"],
    legalBasis: [{ act: ORDYNACJA, provision: "art. 63 § 1", url: "https://eli.gov.pl/eli/DU/2025/111/ogl" }] }],
  VAT_RATES: [{ id: "VAT_RATES", tax: "VAT", version: 1, ...YEARS_2025_2026, verifiedAt: VERIFIED, params: { rates: ["23", "8", "5", "0", "zw", "np"] }, tests: ["tests/invoices.test.mjs"],
    legalBasis: [{ act: VAT_ACT, provision: "art. 41, art. 43, art. 113, art. 146ef", url: "https://lexlege.pl/ustawa-o-podatku-od-towarow-i-uslug/art-146ef/" }],
    note: "Stawka VAT jest niezależna od stawki ryczałtu. Przypisanie stawki do towaru lub usługi wymaga osobnej klasyfikacji VAT." }],
  VAT_EXEMPTION_LIMIT: [
    { id: "VAT_EXEMPTION_LIMIT", tax: "VAT", version: 1, ...YEAR_2025, verifiedAt: VERIFIED, params: { annualLimit: 20000000 }, tests: ["tests/jdg-tax.test.mjs"],
      legalBasis: [{ act: VAT_ACT, provision: "art. 113 ust. 1 i 9", url: "https://www.podatki.gov.pl/podatki-firmowe/vat/poradniki-i-informatory/zwolnienie-podmiotowe-od-podatku-vat" }] },
    { id: "VAT_EXEMPTION_LIMIT", tax: "VAT", version: 2, ...YEAR_2026, verifiedAt: VERIFIED, params: { annualLimit: 24000000 }, tests: ["tests/jdg-tax.test.mjs"],
      legalBasis: [{ act: VAT_ACT, provision: "art. 113 ust. 1 i 9", url: "https://www.podatki.gov.pl/podatki-firmowe/vat/poradniki-i-informatory/zwolnienie-podmiotowe-od-podatku-vat" }] },
  ],
  VAT_PAYMENT_DEADLINE: [{ id: "VAT_PAYMENT_DEADLINE", tax: "VAT", version: 1, ...YEARS_2025_2026, verifiedAt: VERIFIED, params: { dayOfNextMonth: 25 }, tests: ["tests/jdg-tax.test.mjs"],
    legalBasis: [{ act: VAT_ACT, provision: "art. 103 ust. 1", url: "https://www.podatki.gov.pl/podatki-firmowe/vat/" }] }],
  FIXED_ASSET_LOW_VALUE: [{ id: "FIXED_ASSET_LOW_VALUE", tax: "PIT", version: 1, ...YEARS_2025_2026, verifiedAt: VERIFIED, params: { netLimit: 1000000 }, tests: ["tests/document-review.test.mjs"],
    legalBasis: [{ act: PIT_ACT, provision: "art. 22d ust. 1, art. 22a", url: PIT_URL }],
    note: "Wydatek powyżej limitu, wykorzystywany dłużej niż rok, wymaga oceny jako środek trwały. Aplikacja zadaje pytanie, nie rozstrzyga." }],
  MIXED_USE_CAR: [{ id: "MIXED_USE_CAR", tax: "GENERAL", version: 1, ...YEARS_2025_2026, verifiedAt: VERIFIED, params: { vatDeductionBps: 5000, pitCostBps: 7500 }, tests: ["tests/document-review.test.mjs"],
    legalBasis: [{ act: VAT_ACT, provision: "art. 86a ust. 1–3", url: "https://www.podatki.gov.pl/podatki-firmowe/vat/" }, { act: PIT_ACT, provision: "art. 23 ust. 1 pkt 46a", url: PIT_URL }],
    note: "Dotyczy samochodu osobowego o mieszanym użytku. Pełne odliczenie wymaga wyłącznie firmowego użytku, ewidencji przebiegu i zgłoszenia VAT-26." }],
};

export function ruleVersions<K extends RuleId>(id: K): TaxRule<K>[] { return RULES[id]; }
export function findRule<K extends RuleId>(id: K, date: string): TaxRule<K> | null {
  return RULES[id].find(rule => rule.validFrom <= date && (rule.validTo === null || date <= rule.validTo)) ?? null;
}
export function ruleAt<K extends RuleId>(id: K, date: string): TaxRule<K> {
  const rule = findRule(id, date); if (!rule) throw new UnsupportedPeriodError(id, date); return rule;
}
export function ruleForYear<K extends RuleId>(id: K, year: number): TaxRule<K> { return ruleAt(id, `${year}-12-31`); }
export function allRules(): TaxRule[] { return (Object.keys(RULES) as RuleId[]).flatMap(id => RULES[id] as TaxRule[]); }
export function ruleRef(rule: TaxRule) { return `${rule.id}@v${rule.version}`; }
export function supportedYear(year: number) { return year === 2025 || year === 2026; }
