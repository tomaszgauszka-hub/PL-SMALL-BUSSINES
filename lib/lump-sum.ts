// Ryczałt od przychodów ewidencjonowanych: revenue categories, line
// classification and the multi-rate calculation engine.
//
// Sources (verified 17.10.2026): art. 12 ust. 1, 3, 13, 14, art. 11 ust. 1a, 3,
// art. 6 ust. 1e and art. 21 of the ryczałt act (Dz.U. 2025 poz. 843 ze zm.);
// PKWiU 2015 applies to ryczałt until 31.12.2028 (Dz.U. 2025 poz. 1829 § 2 pkt 2).
// A category only describes the statutory scope. The user confirms which
// activity was actually performed; PKD, product names or AI hints never decide.
import type { ReviewFinding } from "./review-status.ts";
import { ruleForYear, ruleRef } from "./tax-rules.ts";

export type CategoryScope = "symbols" | "partial" | "description";
export type RevenueCategory = {
  id: string; provision: string; label: string; rateBps: number; thresholdGroup?: "pkt4";
  pkwiu: string[]; scope: CategoryScope; outsideJdg?: boolean; expertOnly?: boolean; question?: string;
};
const P = "art. 12 ust. 1";
const cat = (id: string, provision: string, rateBps: number, label: string, pkwiu: string[], scope: CategoryScope, extra: Partial<RevenueCategory> = {}): RevenueCategory =>
  ({ id, provision: `${P} ${provision}`, rateBps, label, pkwiu, scope, ...extra });

export const REVENUE_CATEGORIES: RevenueCategory[] = [
  cat("p1", "pkt 1", 1700, "Wolny zawód wykonywany osobiście", [], "description", { question: "Wykonujesz osobiście jeden z zawodów z art. 4 ust. 1 pkt 11 (np. tłumacz, adwokat, radca prawny, doradca podatkowy), bez zatrudniania osób na umowę o pracę, zlecenie lub dzieło?" }),
  cat("p2-a", "pkt 2 lit. a", 1500, "Reprodukcja komputerowych nośników informacji", ["18.20.30.0"], "symbols"),
  cat("p2-b", "pkt 2 lit. b", 1500, "Pośrednictwo w sprzedaży motocykli, części i akcesoriów", ["45.40.40.0"], "symbols"),
  cat("p2-c", "pkt 2 lit. c", 1500, "Pośrednictwo w handlu hurtowym", ["46.1"], "symbols"),
  cat("p2-d", "pkt 2 lit. d", 1500, "Magazynowanie płynów i gazów, składy celne, parkingi, centrale radio-taxi, pilotaż", ["52.10.12.0", "ex 52.10.19.0", "52.21.24.0", "ex 52.21.29.0", "ex 52.22.13.0", "ex 52.22.14.0"], "partial"),
  cat("p2-e", "pkt 2 lit. e", 1500, "Licencje do książek, katalogów, czasopism, gier i programów komputerowych", ["58.11.60.0", "58.12.30.0", "58.14.40.0", "58.19.30.0", "58.21.40.0", "58.29.50.0"], "symbols"),
  cat("p2-f", "pkt 2 lit. f", 1500, "Sprzedaż przestrzeni reklamowej w katalogach i wykazach", ["58.12.40.0"], "symbols"),
  cat("p2-h", "pkt 2 lit. h", 1500, "Nadawanie programów ogólnodostępnych i abonamentowych", ["60"], "symbols"),
  cat("p2-i", "pkt 2 lit. i", 1500, "Przetwarzanie danych, streaming, agencje informacyjne, pozostałe usługi informacyjne", ["ex 63.11.1", "59.11.25.0", "59.20.36.0", "63.91.1", "63.99"], "partial"),
  cat("p2-j", "pkt 2 lit. j", 1500, "Usługi finansowe i ubezpieczeniowe (poza wolnym zawodem)", ["64", "65", "66"], "partial"),
  cat("p2-k", "pkt 2 lit. k", 1500, "Zarządzanie nieruchomościami na zlecenie", ["68.3"], "symbols"),
  cat("p2-l", "pkt 2 lit. l", 1500, "Usługi prawne, rachunkowo-księgowe i doradztwa podatkowego (poza wolnym zawodem)", ["69"], "partial"),
  cat("p2-m", "pkt 2 lit. m", 1500, "Usługi firm centralnych i doradztwo w zakresie zarządzania", ["ex 70"], "partial", { question: "Usługa należy do działu 70 PKWiU, nie jest doradztwem dotyczącym rynku rybnego (70.22.16) i nie jest wykonywana w ramach wolnego zawodu?" }),
  cat("p2-o", "pkt 2 lit. o", 1500, "Reklama, badanie rynku i opinii publicznej", ["73"], "symbols"),
  cat("p2-q", "pkt 2 lit. q", 1500, "Usługi fotograficzne", ["74.2"], "symbols"),
  cat("p2-r", "pkt 2 lit. r", 1500, "Tłumaczenia (poza wolnym zawodem)", ["74.3"], "partial"),
  cat("p2-s", "pkt 2 lit. s", 1500, "Usługi związane z zatrudnieniem", ["78"], "symbols"),
  cat("p2-t", "pkt 2 lit. t", 1500, "Organizatorzy turystyki, pośrednicy, rezerwacje", ["79"], "symbols"),
  cat("p2-u", "pkt 2 lit. u", 1500, "Usługi detektywistyczne i ochroniarskie", ["80"], "partial", { question: "Usługa należy do działu 80 PKWiU i nie jest instalacją alarmów przeciwpożarowych lub przeciwwłamaniowych z późniejszym monitoringiem?" }),
  cat("p2-v", "pkt 2 lit. v", 1500, "Obsługa nieruchomości, dezynfekcja, wsparcie działalności, call center, kongresy i targi", ["81.10.10.0", "81.29.11.0", "82.9", "82.20.10.0", "82.19.11.0", "82.30"], "symbols"),
  cat("p2-x", "pkt 2 lit. x", 1500, "Pomoc społeczna bez zakwaterowania (z wyłączeniami)", ["ex 88"], "partial", { question: "Usługa należy do działu 88 PKWiU i nie jest jedną z wyłączonych usług (88.10.14, 88.10.15, 88.91.11, 88.91.12, 88.91.13, 88.99.19)?" }),
  cat("p2-y", "pkt 2 lit. y", 1500, "Usługi twórcze, artystyczne i rozrywkowe", ["90"], "symbols"),
  cat("p2-z", "pkt 2 lit. z", 1500, "Usługi sportowe, rozrywkowe i rekreacyjne", ["93"], "symbols"),
  cat("p2a-a", "pkt 2a lit. a", 1400, "Opieka zdrowotna", ["86"], "symbols"),
  cat("p2a-b", "pkt 2a lit. b", 1400, "Usługi architektoniczne i inżynierskie, badania i analizy techniczne", ["71"], "symbols"),
  cat("p2a-c", "pkt 2a lit. c", 1400, "Specjalistyczne projektowanie", ["74.1"], "symbols"),
  cat("p2b-a", "pkt 2b lit. a", 1200, "Wydawanie pakietów oprogramowania (bez gier online)", ["ex 58.21.10.0", "58.29.1", "58.29.2", "ex 58.29.3"], "partial"),
  cat("p2b-b", "pkt 2b lit. b", 1200, "Usługi IT: programowanie, doradztwo w zakresie oprogramowania i sprzętu, zarządzanie siecią", ["62.02.10.0", "ex 62.01.1", "62.01.2", "ex 62.02", "ex 62.09.20.0", "62.03.1"], "partial"),
  cat("p3", "pkt 3", 1000, "Kupno i sprzedaż nieruchomości na własny rachunek", ["68.10.1"], "symbols"),
  cat("p4-a", "pkt 4 lit. a", 850, "Najem prywatny (poza działalnością)", [], "description", { thresholdGroup: "pkt4", outsideJdg: true }),
  cat("p4-b", "pkt 4 lit. b", 850, "Przychody z art. 14 ust. 2 pkt 11 ustawy o PIT", [], "description", { thresholdGroup: "pkt4", expertOnly: true }),
  cat("p4-c", "pkt 4 lit. c", 850, "Usługi związane z zakwaterowaniem", ["55"], "symbols", { thresholdGroup: "pkt4" }),
  cat("p4-d", "pkt 4 lit. d", 850, "Wynajem i zarządzanie nieruchomościami własnymi lub dzierżawionymi", ["68.20.1"], "symbols", { thresholdGroup: "pkt4" }),
  cat("p4-e", "pkt 4 lit. e", 850, "Badania naukowe i prace rozwojowe", ["72"], "symbols", { thresholdGroup: "pkt4" }),
  cat("p4-f", "pkt 4 lit. f", 850, "Wynajem i dzierżawa pojazdów, kontenerów i własności intelektualnej (bez utworów)", ["77.11.10.0", "77.12.1", "77.34.10.0", "77.35.10.0", "77.39.11.0", "77.39.12.0", "77.39.13.0", "ex 77.40"], "partial", { thresholdGroup: "pkt4" }),
  cat("p4-g", "pkt 4 lit. g", 850, "Pomoc społeczna z zakwaterowaniem", ["87"], "symbols", { thresholdGroup: "pkt4" }),
  cat("p5-a", "pkt 5 lit. a", 850, "Pozostałe usługi (także gastronomia z alkoholem powyżej 1,5%)", [], "description", { question: "Usługa nie jest wymieniona w art. 12 ust. 1 pkt 1–4 ani 6–7 i nie podlega wyższej stawce?" }),
  cat("p5-b", "pkt 5 lit. b", 850, "Usługi ochrony przeciwpożarowej i zapobiegania pożarom", ["84.25.11.0"], "symbols"),
  cat("p5-c", "pkt 5 lit. c", 850, "Usługi w zakresie edukacji", ["85"], "symbols"),
  cat("p5-d", "pkt 5 lit. d", 850, "Usługi bibliotek, archiwów, muzeów i inne usługi kulturalne", ["91"], "symbols"),
  cat("p5-e", "pkt 5 lit. e", 850, "Wytwarzanie wyrobów z materiału powierzonego przez zleceniodawcę", [], "description", { question: "Wytwarzasz wyrób wyłącznie z materiału powierzonego przez zleceniodawcę?" }),
  cat("p5-f", "pkt 5 lit. f", 850, "Prowizja ze sprzedaży komisowej", [], "description", { question: "Przychodem jest wyłącznie prowizja z umowy komisu?" }),
  cat("p5-g", "pkt 5 lit. g", 850, "Prowizja kolportera prasy", [], "description"),
  cat("p5-h", "pkt 5 lit. h", 850, "Przychody z art. 14 ust. 2 pkt 12 ustawy o PIT", [], "description", { expertOnly: true }),
  cat("p6-a", "pkt 6 lit. a", 550, "Działalność wytwórcza, roboty budowlane, przewóz ładunków pojazdami powyżej 2 t", [], "description", { question: "Czynność to wytwarzanie wyrobów, robota budowlana lub przewóz ładunków pojazdem o ładowności powyżej 2 t — a nie usługa wymieniona w pkt 1–5?" }),
  cat("p6-b", "pkt 6 lit. b", 550, "Prowizja ze sprzedaży biletów, znaczków, żetonów i kart magnetycznych", [], "description"),
  cat("p6-c", "pkt 6 lit. c", 550, "Przychody z art. 14 ust. 2 pkt 14 ustawy o PIT", [], "description", { expertOnly: true }),
  cat("p7-a", "pkt 7 lit. a", 300, "Gastronomia (bez napojów powyżej 1,5% alkoholu)", [], "description", { question: "Sprzedaż gastronomiczna nie obejmuje napojów o zawartości alkoholu powyżej 1,5%?" }),
  cat("p7-b", "pkt 7 lit. b", 300, "Działalność handlowa", [], "description", { question: "Sprzedajesz towary handlowe w niezmienionej postaci (nie części i akcesoria do pojazdów, które wyłączają ryczałt)?" }),
  cat("p7-c", "pkt 7 lit. c", 300, "Usługi wspomagające produkcję zwierzęcą", ["01.62.10.0"], "symbols"),
  cat("p7-d", "pkt 7 lit. d", 300, "Rybołówstwo i sprzedaż ryb z własnego połowu (bez przetworów)", [], "description"),
  cat("p7-e", "pkt 7 lit. e", 300, "Przychody z art. 14 ust. 2 pkt 2, 5–10 i 19–21 ustawy o PIT", [], "description", { expertOnly: true }),
  cat("p7-f", "pkt 7 lit. f", 300, "Zbycie ruchomych składników majątku wykorzystywanych w działalności", [], "description", { question: "Sprzedajesz ruchomy składnik majątku, który był wykorzystywany w Twojej działalności?" }),
  cat("p7-g", "pkt 7 lit. g", 300, "Zbycie ruchomych składników majątku przedsiębiorstwa w spadku", [], "description", { expertOnly: true }),
  cat("p8", "pkt 8", 200, "Sprzedaż przetworzonych produktów roślinnych i zwierzęcych (art. 6 ust. 1d)", [], "description", { outsideJdg: true }),
];
const BY_ID = new Map(REVENUE_CATEGORIES.map(category => [category.id, category]));
export function revenueCategory(id: string | null | undefined): RevenueCategory | null { return id ? BY_ID.get(id) ?? null : null; }
export function categoryRateLabel(category: RevenueCategory) { return category.thresholdGroup === "pkt4" ? "8,5% / 12,5% ponad 100 000 zł" : `${(category.rateBps / 100).toLocaleString("pl-PL")}%`; }
export function categoryQuestion(category: RevenueCategory) {
  if (category.question) return category.question;
  const symbols = category.pkwiu.join(", ");
  return category.scope === "partial" ? `Faktycznie wykonana czynność mieści się w PKWiU ${symbols} i nie należy do wyłączeń wskazanych w ${category.provision}?` : `Faktycznie wykonana czynność mieści się w PKWiU ${symbols}?`;
}
export function selectableCategories() { return REVENUE_CATEGORIES.filter(category => !category.outsideJdg); }

// PKWiU is hierarchical by digits: 62.01.11.0 belongs to 62.01.1 and to dział 62.
const digits = (symbol: string) => symbol.replace(/^ex\s+/, "").replace(/\D/g, "");
export function pkwiuMatch(category: RevenueCategory, pkwiu: string): "match" | "partial" | "none" | "unknown" {
  const code = digits(pkwiu); if (!code || !category.pkwiu.length) return "unknown";
  const hit = category.pkwiu.find(symbol => code.startsWith(digits(symbol)));
  return !hit ? "none" : hit.startsWith("ex ") ? "partial" : "match";
}

export type ClassificationSource = "user_confirmed" | "pkd_hint" | "ai_suggestion" | "legacy_rate_only";
export type ClassifiableLine = { lumpSumRate: number; revenueCategory?: string; classificationSource?: ClassificationSource | ""; pkwiu?: string };
export function expectedLumpSumRate(category: RevenueCategory) { return category.rateBps; }

export function classifyLumpSumLine(line: ClassifiableLine, lineIndex: number, year: number): ReviewFinding[] {
  const ref = ruleRef(ruleForYear("RYCZALT_RATE_CATALOGUE", year));
  const category = revenueCategory(line.revenueCategory);
  if (!line.revenueCategory) return [{ status: "NEEDS_USER_INPUT", code: "ryczalt.category_missing", lineIndex, ruleRef: ref, message: "Pozycja nie ma wskazanego rodzaju przychodu. Sama stawka nie wystarcza do ewidencji ryczałtu.", question: "Jaki rodzaj przychodu dokumentuje ta pozycja?" }];
  if (!category) return [{ status: "UNSUPPORTED_OR_INVALID", code: "ryczalt.category_unknown", lineIndex, ruleRef: ref, message: "Nieznany rodzaj przychodu. Wybierz pozycję z aktualnego katalogu." }];
  if (category.outsideJdg) return [{ status: "UNSUPPORTED_OR_INVALID", code: "ryczalt.outside_jdg", lineIndex, ruleRef: ref, message: `${category.label} nie jest przychodem z tej działalności i nie należy do ewidencji JDG.` }];
  if (line.lumpSumRate !== expectedLumpSumRate(category)) return [{ status: "UNSUPPORTED_OR_INVALID", code: "ryczalt.rate_mismatch", lineIndex, ruleRef: ref, message: `Stawka ${line.lumpSumRate / 100}% nie odpowiada przepisowi ${category.provision} (${categoryRateLabel(category)}).` }];
  const findings: ReviewFinding[] = [];
  if (category.expertOnly) findings.push({ status: "NEEDS_EXPERT_REVIEW", code: "ryczalt.expert_category", lineIndex, ruleRef: ref, message: `${category.provision} odsyła do ustawy o PIT. Zakres tego przychodu wymaga indywidualnej weryfikacji.` });
  const match = line.pkwiu ? pkwiuMatch(category, line.pkwiu) : "unknown";
  if (match === "none") findings.push({ status: "NEEDS_EXPERT_REVIEW", code: "ryczalt.pkwiu_mismatch", lineIndex, ruleRef: ref, message: `Podany symbol PKWiU ${line.pkwiu} nie mieści się w ${category.provision}. Sprawdź klasyfikację.` });
  if (line.classificationSource !== "user_confirmed") findings.push({ status: "NEEDS_USER_INPUT", code: "ryczalt.unconfirmed", lineIndex, ruleRef: ref,
    message: line.classificationSource === "pkd_hint" || line.classificationSource === "ai_suggestion" ? "Podpowiedź z PKD lub AI nie jest podstawą stawki. Potwierdź faktycznie wykonaną czynność." : "Potwierdź, że rodzaj przychodu odpowiada faktycznie wykonanej czynności.",
    question: categoryQuestion(category), options: ["Tak, potwierdzam", "Nie — wybiorę inny rodzaj", "Nie wiem — przekaż do weryfikacji"] });
  if (!findings.length) findings.push({ status: "AUTO_VERIFIED", code: "ryczalt.verified", lineIndex, ruleRef: ref, message: `${category.provision}: ${categoryRateLabel(category)}.` });
  return findings;
}
export type SupplyStructure = "separate" | "composite" | "";
// One document may carry several separately supplied services. Different
// rates on one document are never assumed to be separate supplies.
export function reviewLumpSumDocument(lines: ClassifiableLine[], supplyStructure: SupplyStructure, year: number): ReviewFinding[] {
  const findings = lines.flatMap((line, index) => classifyLumpSumLine(line, index, year));
  const groups = new Set(lines.map(line => { const category = revenueCategory(line.revenueCategory); return category?.thresholdGroup ?? String(category?.rateBps ?? line.lumpSumRate); }));
  if (groups.size > 1) {
    if (supplyStructure === "composite") findings.push({ status: "NEEDS_EXPERT_REVIEW", code: "ryczalt.composite_supply", message: "Świadczenie kompleksowe z pozycjami o różnych stawkach wymaga ustalenia świadczenia głównego i jednej stawki." });
    else if (supplyStructure !== "separate") findings.push({ status: "NEEDS_USER_INPUT", code: "ryczalt.supply_structure", message: "Dokument zawiera przychody o różnych stawkach ryczałtu.", question: "Czy pozycje to odrębne świadczenia (każde można wykonać i rozliczyć osobno), czy jedno świadczenie kompleksowe?", options: ["Odrębne świadczenia", "Jedno świadczenie kompleksowe", "Nie wiem — przekaż do weryfikacji"] });
  }
  return findings;
}

// ---------------------------------------------------------------- engine ---
export type LumpSumRevenue = { month: number; amount: number; rateBps: number; categoryId?: string | null };
export type MonthlyDeductions = { social: number; health: number; other: number };
export type LumpSumBucket = { rateBps: number; revenue: number; deduction: number; base: number; tax: number };
export type CategoryRevenue = { key: string; categoryId: string | null; label: string; provision: string; rateLabel: string; revenue: number; upperRateRevenue: number };
export type LumpSumPeriod = {
  month: number; revenue: number; buckets: LumpSumBucket[]; categories: CategoryRevenue[];
  deductionAvailable: number; deductionUsed: number; deductionCarry: number; tax: number;
  negativeCarry: { rateBps: number; amount: number }[]; pkt4Cumulative: number;
};
export type LumpSumYearResult = {
  year: number; months: LumpSumPeriod[];
  annual: { revenue: number; buckets: LumpSumBucket[]; categories: CategoryRevenue[]; deductionRequested: number; deductionUsed: number; deductionUnused: number; tax: number; uncoveredReduction: number; negativeRates: number[] };
  issues: string[]; rules: string[];
};

// Deductions use half-grosz units so that 50% of an odd-grosz health
// contribution stays exact. Bases are rounded to full złoty per rate, the
// total ryczałt once (art. 63 § 1 Ordynacji podatkowej).
export function taxByRate(revenueByRate: Map<number, number>, deductionHalfGrosze: number) {
  const positive = [...revenueByRate].filter(([, amount]) => amount > 0).sort(([a], [b]) => a - b);
  const income = positive.reduce((sum, [, amount]) => sum + amount, 0), requested = Math.max(0, Math.round(deductionHalfGrosze)), usedUnits = Math.min(income * 2, requested);
  const rows = positive.map(([rateBps, amount]) => ({ rateBps, amount, units: income ? Number(BigInt(usedUnits) * BigInt(amount) / BigInt(income)) : 0, remainder: income ? BigInt(usedUnits) * BigInt(amount) % BigInt(income) : 0n }));
  let remaining = usedUnits - rows.reduce((sum, row) => sum + row.units, 0);
  for (const row of [...rows].sort((a, b) => a.remainder === b.remainder ? a.rateBps - b.rateBps : a.remainder > b.remainder ? -1 : 1)) { if (!remaining) break; row.units++; remaining--; }
  const buckets = rows.map(row => { const baseZl = Math.floor((row.amount * 2 - row.units + 100) / 200); return { rateBps: row.rateBps, revenue: row.amount, deduction: row.units / 2, base: baseZl * 100, taxUnits: BigInt(baseZl) * BigInt(row.rateBps) }; });
  const raw = buckets.reduce((sum, bucket) => sum + bucket.taxUnits, 0n);
  return { tax: Number((raw + 5000n) / 10000n) * 100, income, usedUnits, unusedUnits: requested - usedUnits, buckets: buckets.map(({ taxUnits, ...bucket }) => ({ ...bucket, tax: Number(taxUnits) / 100 })) };
}

function splitPkt4(previous: number, amount: number, threshold: number) {
  const upper = Math.max(0, previous + amount - threshold) - Math.max(0, previous - threshold);
  return { lower: amount - upper, upper };
}
function categoryKey(row: LumpSumRevenue) { return row.categoryId ? `c:${row.categoryId}` : `r:${row.rateBps}`; }
function describe(key: string, categoryId: string | null, rateBps: number): Omit<CategoryRevenue, "revenue" | "upperRateRevenue"> {
  const category = revenueCategory(categoryId);
  return category ? { key, categoryId, label: category.label, provision: category.provision, rateLabel: categoryRateLabel(category) }
    : { key, categoryId: null, label: "Przychód bez wskazanego rodzaju", provision: "—", rateLabel: `${(rateBps / 100).toLocaleString("pl-PL")}%` };
}

export function calculateLumpSumYear(input: { year: number; revenues: LumpSumRevenue[]; deductions: MonthlyDeductions[]; annualDeductions?: number; spouses?: boolean }): LumpSumYearResult {
  const { year } = input;
  const thresholdRule = ruleForYear("RYCZALT_PKT4_THRESHOLD", year), healthRule = ruleForYear("RYCZALT_HEALTH_DEDUCTION", year);
  const threshold = input.spouses ? thresholdRule.params.spousesThreshold : thresholdRule.params.threshold;
  const { lowerRateBps, upperRateBps } = thresholdRule.params, healthBps = healthRule.params.shareBps;
  const rules = ["RYCZALT_RATE_CATALOGUE", "RYCZALT_PKT4_THRESHOLD", "RYCZALT_HEALTH_DEDUCTION", "RYCZALT_DEDUCTION_ALLOCATION", "RYCZALT_CORRECTION_PERIOD", "ROUNDING_FULL_ZLOTY"].map(id => ruleRef(ruleForYear(id as "RYCZALT_RATE_CATALOGUE", year)));
  const issues: string[] = [];
  const isPkt4 = (row: LumpSumRevenue) => revenueCategory(row.categoryId)?.thresholdGroup === "pkt4";
  const months: LumpSumPeriod[] = [];
  let pkt4Cumulative = 0, deductionCarry = 0;
  let negative = new Map<number, number>();
  const annualByRate = new Map<number, number>(), annualCategories = new Map<string, CategoryRevenue>();
  const addCategory = (target: Map<string, CategoryRevenue>, row: LumpSumRevenue, amount: number, upper: number) => {
    const key = categoryKey(row), existing = target.get(key) ?? { ...describe(key, row.categoryId ?? null, row.rateBps), revenue: 0, upperRateRevenue: 0 };
    existing.revenue += amount; existing.upperRateRevenue += upper; target.set(key, existing);
  };
  let deductionRequestedUnits = 0;
  for (let month = 1; month <= 12; month++) {
    const rows = input.revenues.filter(row => row.month === month);
    const byRate = new Map<number, number>(), categories = new Map<string, CategoryRevenue>();
    const add = (rate: number, amount: number) => { if (amount) byRate.set(rate, (byRate.get(rate) ?? 0) + amount); };
    const pkt4Amount = rows.filter(isPkt4).reduce((sum, row) => sum + row.amount, 0), split = splitPkt4(pkt4Cumulative, pkt4Amount, threshold);
    pkt4Cumulative += pkt4Amount;
    add(lowerRateBps, split.lower); add(upperRateBps, split.upper);
    for (const row of rows) {
      if (isPkt4(row)) { const upper = pkt4Amount ? Math.round(split.upper * row.amount / pkt4Amount) : 0; addCategory(categories, row, row.amount, upper); addCategory(annualCategories, row, row.amount, upper); }
      else { add(row.rateBps, row.amount); addCategory(categories, row, row.amount, 0); addCategory(annualCategories, row, row.amount, 0); }
    }
    for (const [rate, amount] of byRate) annualByRate.set(rate, (annualByRate.get(rate) ?? 0) + amount);
    // art. 6 ust. 1e: a reduction exceeding the period's revenue moves to the following periods.
    for (const [rate, amount] of negative) byRate.set(rate, (byRate.get(rate) ?? 0) + amount);
    const nextNegative = new Map<number, number>();
    for (const [rate, amount] of byRate) if (amount < 0) { nextNegative.set(rate, amount); byRate.set(rate, 0); }
    negative = nextNegative;
    const d = input.deductions[month - 1] ?? { social: 0, health: 0, other: 0 };
    const requested = d.social * 2 + Math.round(d.health * 2 * healthBps / 10000) + d.other * 2;
    deductionRequestedUnits += requested;
    const result = taxByRate(byRate, deductionCarry + requested);
    deductionCarry = result.unusedUnits;
    months.push({ month, revenue: [...byRate.values()].reduce((sum, amount) => sum + amount, 0), buckets: result.buckets, categories: [...categories.values()],
      deductionAvailable: (result.usedUnits + result.unusedUnits) / 2, deductionUsed: result.usedUnits / 2, deductionCarry: result.unusedUnits / 2, tax: result.tax,
      negativeCarry: [...negative].map(([rateBps, amount]) => ({ rateBps, amount })), pkt4Cumulative });
  }
  // A reduction still uncovered by the year's revenue of the same rate cannot be
  // settled automatically. Monthly carries covered by the annual total are
  // reconciled in the annual return.
  const negativeRates = [...annualByRate].filter(([, amount]) => amount < 0).map(([rate]) => rate);
  const uncoveredReduction = [...annualByRate.values()].filter(amount => amount < 0).reduce((sum, amount) => sum - amount, 0);
  if (uncoveredReduction) issues.push(`Zmniejszenia przychodu (korekty) przewyższają roczny przychód danej stawki o ${(uncoveredReduction / 100).toFixed(2).replace(".", ",")} zł. Wymaga to weryfikacji.`);
  const annualDeductionUnits = deductionRequestedUnits + Math.max(0, input.annualDeductions ?? 0) * 2;
  const annual = taxByRate(annualByRate, annualDeductionUnits);
  return { year, months, issues, rules, annual: { revenue: [...annualByRate.values()].reduce((sum, amount) => sum + amount, 0), buckets: annual.buckets, categories: [...annualCategories.values()],
    deductionRequested: annualDeductionUnits / 2, deductionUsed: annual.usedUnits / 2, deductionUnused: annual.unusedUnits / 2, tax: annual.tax, uncoveredReduction, negativeRates } };
}

// art. 8 and art. 6 ust. 4: conditions that exclude the ryczałt for the whole business.
export type LumpSumEligibilityAnswers = {
  previousYearRevenue: number | null; startedThisYear: boolean; cardTax: boolean; periodicExemption: boolean;
  pharmacy: boolean; currencyExchange: boolean; vehiclePartsTrade: boolean; exciseProducer: boolean; formerEmployerServices: boolean; spouseFormChange: boolean;
};
export function evaluateLumpSumEligibility(year: number, answers: Partial<LumpSumEligibilityAnswers>): ReviewFinding[] {
  const limit = ruleForYear("RYCZALT_ELIGIBILITY_LIMIT", year), ref = ruleRef(limit), findings: ReviewFinding[] = [];
  const exclusions: [keyof LumpSumEligibilityAnswers, string][] = [["cardTax", "opłacanie karty podatkowej"], ["periodicExemption", "korzystanie z okresowego zwolnienia od podatku"], ["pharmacy", "prowadzenie apteki"], ["currencyExchange", "kupno i sprzedaż wartości dewizowych"], ["vehiclePartsTrade", "handel częściami i akcesoriami do pojazdów mechanicznych"], ["exciseProducer", "wytwarzanie wyrobów akcyzowych (poza energią z OZE)"], ["formerEmployerServices", "świadczenie usług dla byłego lub obecnego pracodawcy w zakresie wcześniejszej pracy"], ["spouseFormChange", "zmiana formy prowadzenia działalności z udziałem małżonka opodatkowanego na zasadach ogólnych"]];
  for (const [key, label] of exclusions) {
    if (answers[key] === undefined) findings.push({ status: "NEEDS_USER_INPUT", code: `eligibility.${key}`, ruleRef: "art. 8 ustawy o ryczałcie", message: `Brak odpowiedzi: ${label}.`, question: `Czy dotyczy Cię ${label}?`, options: ["Tak", "Nie"] });
    else if (answers[key]) findings.push({ status: "UNSUPPORTED_OR_INVALID", code: `eligibility.${key}`, ruleRef: "art. 8 ustawy o ryczałcie", message: `Ryczałt wyłączony: ${label}.` });
  }
  if (!answers.startedThisYear) {
    if (answers.previousYearRevenue === null || answers.previousYearRevenue === undefined) findings.push({ status: "NEEDS_USER_INPUT", code: "eligibility.previous_revenue", ruleRef: ref, message: "Brak przychodu z poprzedniego roku.", question: `Jaki był przychód z działalności w ${year - 1} r.?` });
    else if (answers.previousYearRevenue > limit.params.previousYearRevenueLimit) findings.push({ status: "UNSUPPORTED_OR_INVALID", code: "eligibility.limit", ruleRef: ref, message: `Przychód ${year - 1} r. przekracza limit ${limit.params.previousYearRevenueLimit / 100} zł.` });
  }
  if (!findings.length) findings.push({ status: "AUTO_VERIFIED", code: "eligibility.ok", ruleRef: ref, message: "Brak przesłanek wyłączających ryczałt według udzielonych odpowiedzi." });
  return findings;
}
