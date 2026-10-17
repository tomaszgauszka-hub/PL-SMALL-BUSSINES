// Document assessment. The application asks for facts that cannot be read from
// an invoice and never infers a tax decision from a keyword, product name or
// PKD code. Keyword matches only decide which question to ask.
import type { ReviewFinding, ReviewResult } from "./review-status.ts";
import { reviewResult } from "./review-status.ts";
import type { ClassifiableLine, SupplyStructure } from "./lump-sum.ts";
import { reviewLumpSumDocument } from "./lump-sum.ts";
import { findRule, ruleRef } from "./tax-rules.ts";

export type CorrectionCause = "error" | "other" | "";
export type ReviewLine = ClassifiableLine & { name: string; vatRate: string };
export type ReviewDocument = {
  direction: "sale" | "purchase"; status: "draft" | "issued"; kind: "regular" | "correction";
  issueDate: string; taxDate: string; vatDate: string; receivedDate: string; parentId: string;
  net: number; lines: ReviewLine[]; costCategory: "goods" | "incidental" | "other"; costDeductionBps: number; vatDeductionBps: number;
  notes?: string; reason?: string; supplyStructure?: SupplyStructure; correctionCause?: CorrectionCause; reviewAnswers?: Record<string, string>;
};
export type ReviewContext = { taxForm: "scale" | "linear" | "lump_sum"; vatActive: boolean; source?: { taxDate: string } | null };

// Answer values that a purchase question accepts, by question code.
export const PURCHASE_QUESTIONS: Record<string, { question: string; options: [string, string][] }> = {
  "purchase.fixed_asset": { question: "Czy ten zakup będzie używany w firmie dłużej niż rok (środek trwały lub wartość niematerialna)?", options: [["fixed_asset", "Tak — dłużej niż rok"], ["not_fixed_asset", "Nie — materiał, towar lub usługa"]] },
  "purchase.vehicle": { question: "Jak używasz pojazdu, którego dotyczy wydatek?", options: [["business_only", "Wyłącznie w firmie (ewidencja przebiegu, VAT-26)"], ["mixed", "Także prywatnie"], ["not_car", "To nie samochód osobowy"]] },
  "purchase.private_use": { question: "Czy urządzenie lub usługa jest używane również prywatnie?", options: [["business_only", "Wyłącznie w firmie"], ["mixed", "Także prywatnie"]] },
  "purchase.representation": { question: "Czy wydatek służy reprezentacji (np. przyjęcie, prezent, alkohol dla kontrahenta)?", options: [["representation", "Tak — reprezentacja"], ["not_representation", "Nie — np. posiłek w delegacji lub reklama"]] },
  "purchase.business_link": { question: "Czy materiały lub narzędzia służą Twojej działalności (np. realizacji zlecenia), a nie prywatnemu remontowi?", options: [["business", "Tak — do działalności"], ["private", "Nie — prywatnie"], ["unsure", "Nie wiem"]] },
};
const KEYWORDS: [string, RegExp][] = [
  ["purchase.vehicle", /samoch|\bauto\b|paliw|benzyn|olej nap|\blpg\b|leasing|opon|myjni|serwis pojazd|ubezpieczenie oc/i],
  ["purchase.private_use", /telefon|smartfon|laptop|komputer|notebook|tablet|abonament|internet/i],
  ["purchase.representation", /restaurac|catering|kolacj|obiad|alkohol|wino|prezent|upomin|bankiet/i],
  ["purchase.business_link", /materia(ł|l)y budowlane|cement|farb|płyt|elektronarz|wiertark|szlifierk|narzędzi/i],
];
const month = (date: string) => date.slice(0, 7);

function correctionFindings(doc: ReviewDocument, ctx: ReviewContext): ReviewFinding[] {
  if (doc.kind !== "correction") return [];
  const rule = findRule("RYCZALT_CORRECTION_PERIOD", doc.taxDate), ref = rule ? ruleRef(rule) : "art. 14 ust. 1m ustawy o PIT";
  const purchase = doc.direction === "purchase", basis = purchase ? "art. 22 ust. 7c ustawy o PIT" : ctx.taxForm === "lump_sum" ? "art. 6 ust. 1e ustawy o ryczałcie i art. 14 ust. 1m ustawy o PIT" : "art. 14 ust. 1m ustawy o PIT";
  if (purchase && ctx.taxForm === "lump_sum") return [];
  if (!doc.correctionCause) return [{ status: "NEEDS_USER_INPUT", code: "correction.cause", ruleRef: ref, message: "Okres ujęcia korekty zależy od jej przyczyny.", question: "Czy korekta wynika z błędu rachunkowego lub innej oczywistej omyłki, czy z innej przyczyny (zwrot, rabat, zmiana ceny)?", options: ["Błąd rachunkowy lub oczywista omyłka", "Inna przyczyna"] }];
  if (doc.correctionCause === "other") {
    const expected = purchase ? doc.receivedDate : doc.issueDate;
    if (month(doc.taxDate) !== month(expected)) return [{ status: "NEEDS_USER_INPUT", code: "correction.period_other", ruleRef: ref, message: `Korekta z innej przyczyny niż błąd zmienia ${purchase ? "koszty w okresie otrzymania" : "przychód w okresie wystawienia"} faktury korygującej (${basis}). Ustaw datę PIT w ${expected.slice(5, 7)}.${expected.slice(0, 4)}.` }];
  } else if (ctx.source && month(doc.taxDate) !== month(ctx.source.taxDate)) {
    return [{ status: "NEEDS_USER_INPUT", code: "correction.period_error", ruleRef: ref, message: `Korekta błędu rachunkowego lub oczywistej omyłki dotyczy okresu dokumentu pierwotnego (${ctx.source.taxDate.slice(5, 7)}.${ctx.source.taxDate.slice(0, 4)}). Sprawdź datę PIT i, jeśli trzeba, skoryguj tamten okres.` }];
  }
  return [{ status: "AUTO_VERIFIED", code: "correction.period", ruleRef: ref, message: "Okres korekty odpowiada jej przyczynie." }];
}

function purchaseFindings(doc: ReviewDocument, ctx: ReviewContext): ReviewFinding[] {
  const findings: ReviewFinding[] = [], answers = doc.reviewAnswers ?? {}, text = [...doc.lines.map(line => line.name), doc.notes ?? ""].join(" ");
  const ask = (code: string, message: string): ReviewFinding => ({ status: "NEEDS_USER_INPUT", code, message, question: PURCHASE_QUESTIONS[code].question, options: PURCHASE_QUESTIONS[code].options.map(([, label]) => label) });
  const pitCost = ctx.taxForm !== "lump_sum" && doc.costDeductionBps > 0;
  const lowValue = findRule("FIXED_ASSET_LOW_VALUE", doc.taxDate), car = findRule("MIXED_USE_CAR", doc.taxDate);
  if (pitCost && lowValue && doc.net > lowValue.params.netLimit && doc.costCategory === "other") {
    const answer = answers["purchase.fixed_asset"];
    if (!answer) findings.push({ ...ask("purchase.fixed_asset", `Wartość netto przekracza ${lowValue.params.netLimit / 100} zł. Składnik używany dłużej niż rok rozlicza się przez amortyzację.`), ruleRef: ruleRef(lowValue) });
    else if (answer === "fixed_asset") findings.push({ status: "UNSUPPORTED_OR_INVALID", code: "purchase.fixed_asset", ruleRef: ruleRef(lowValue), message: "Środek trwały nie może trafić jednorazowo do kosztów. Ewidencja środków trwałych i amortyzacja nie są jeszcze obsługiwane — ustaw udział kosztu 0% i skonsultuj ujęcie." });
  }
  for (const [code, pattern] of KEYWORDS) {
    if (!pattern.test(text)) continue;
    if (code === "purchase.representation" && !pitCost) continue;
    if (code === "purchase.business_link" && !pitCost && !(ctx.vatActive && doc.vatDeductionBps > 0)) continue;
    if (code === "purchase.private_use" && !pitCost && !(ctx.vatActive && doc.vatDeductionBps > 0)) continue;
    if (code === "purchase.vehicle" && !pitCost && !(ctx.vatActive && doc.vatDeductionBps > 0)) continue;
    const answer = answers[code];
    if (!answer) { findings.push({ ...ask(code, "Opis dokumentu wskazuje wydatek, którego ujęcie zależy od okoliczności. To tylko podpowiedź na podstawie słów w opisie."), ruleRef: code === "purchase.vehicle" && car ? ruleRef(car) : undefined }); continue; }
    if (code === "purchase.vehicle" && answer === "mixed" && car) {
      const vatOk = !ctx.vatActive || doc.vatDeductionBps <= car.params.vatDeductionBps, pitOk = ctx.taxForm === "lump_sum" || doc.costDeductionBps <= car.params.pitCostBps;
      if (!vatOk || !pitOk) findings.push({ status: "UNSUPPORTED_OR_INVALID", code, ruleRef: ruleRef(car), message: `Przy użytku mieszanym samochodu osobowego odliczysz najwyżej ${car.params.vatDeductionBps / 100}% VAT, a do kosztów PIT zaliczysz ${car.params.pitCostBps / 100}% wydatków eksploatacyjnych. Popraw udziały.` });
    }
    if (code === "purchase.vehicle" && answer === "business_only") findings.push({ status: "NEEDS_EXPERT_REVIEW", code, ruleRef: car ? ruleRef(car) : undefined, message: "Pełne odliczenie wymaga wyłącznie firmowego użytku, ewidencji przebiegu i zgłoszenia VAT-26. Potwierdź te warunki z księgowym." });
    if (code === "purchase.private_use" && answer === "mixed") findings.push({ status: "NEEDS_EXPERT_REVIEW", code, message: "Przy użytku prywatnym ustala się proporcję firmowego wykorzystania. Wymaga to indywidualnej oceny." });
    if (code === "purchase.representation" && answer === "representation" && doc.costDeductionBps > 0) findings.push({ status: "UNSUPPORTED_OR_INVALID", code, message: "Wydatki na reprezentację nie są kosztem podatkowym (art. 23 ust. 1 pkt 23 ustawy o PIT). Ustaw udział kosztu 0%." });
    if (code === "purchase.business_link" && answer === "private") findings.push({ status: "UNSUPPORTED_OR_INVALID", code, message: "Wydatek prywatny nie jest kosztem firmy ani nie daje prawa do odliczenia VAT. Nie rejestruj go jako zakupu firmowego." });
    if (code === "purchase.business_link" && answer === "unsure") findings.push({ status: "NEEDS_EXPERT_REVIEW", code, message: "Związek wydatku z działalnością wymaga oceny." });
  }
  if (!findings.length) findings.push({ status: "AUTO_VERIFIED", code: "purchase.ok", message: "Brak okoliczności wymagających wyjaśnienia." });
  return findings;
}

export function reviewDocument(doc: ReviewDocument, ctx: ReviewContext): ReviewResult {
  if (doc.status !== "issued" && doc.status !== "draft") return reviewResult([]);
  const year = Number(doc.taxDate.slice(0, 4));
  if (!findRule("RYCZALT_RATE_CATALOGUE", doc.taxDate)) return reviewResult([{ status: "UNSUPPORTED_OR_INVALID", code: "period.unsupported", message: `Okres ${year} nie jest obsługiwany przez zweryfikowane reguły.` }]);
  const findings: ReviewFinding[] = [];
  if (doc.direction === "sale" && ctx.taxForm === "lump_sum") findings.push(...reviewLumpSumDocument(doc.lines, doc.supplyStructure ?? "", year));
  if (doc.direction === "purchase") findings.push(...purchaseFindings(doc, ctx));
  findings.push(...correctionFindings(doc, ctx));
  return reviewResult(findings);
}
export function reviewLedger<T extends ReviewDocument & { id: string; parentId: string }>(documents: T[], ctx: Omit<ReviewContext, "source">) {
  const byId = new Map(documents.map(doc => [doc.id, doc]));
  return new Map(documents.map(doc => [doc.id, reviewDocument(doc, { ...ctx, source: doc.parentId ? byId.get(doc.parentId) ?? null : null })]));
}
