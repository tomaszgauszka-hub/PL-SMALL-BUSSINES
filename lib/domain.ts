export type Client = { id: string; name: string; nip: string; email: string; phone: string; address: string; notes: string; archived: number; version: number };
export type Sale = { id: string; clientId: string; clientName: string; date: string; issueDate: string; dueDate: string; amount: number; description: string; category: string; number: string; kind: "sale" | "correction"; parentId: string; reason: string; b2b: number; ksefEligible: number; snapshot: string; createdAt: string };
export type Payment = { id: string; saleId: string; date: string; amount: number; method: string; note: string; createdAt: string };
export type Expense = { id: string; date: string; paidDate: string; amount: number; deductible: number; description: string; category: string; evidence: string; notes: string; createdAt: string };
export type Attachment = { id: string; expenseId: string; name: string; mime: string; size: number };
export type Audit = { id: string; action: string; details: string; createdAt: string };
export type Settings = { sellerName: string; sellerAddress: string; sellerNip: string; sellerEmail: string; startDate: string; eligible60: boolean; regulated: boolean; specialVat: boolean; specialCash: boolean; version: number };
export type TaxInput = { year: number; otherIncome: number; deductions: number; advances: number; taxRelief: number; version: number };
export type LegalEvent = { kind: string; date: string; details: string };
export type State = { clients: Client[]; sales: Sale[]; payments: Payment[]; expenses: Expense[]; attachments: Attachment[]; audit: Audit[]; settings: Settings; tax: TaxInput[]; legalEvents: LegalEvent[] };

export const defaultSettings: Settings = { sellerName: "", sellerAddress: "", sellerNip: "", sellerEmail: "", startDate: "", eligible60: false, regulated: false, specialVat: false, specialCash: false, version: 0 };
export function emptyState(): State { return { clients: [], sales: [], payments: [], expenses: [], attachments: [], audit: [], settings: { ...defaultSettings }, tax: [], legalEvents: [] }; }
export const CHECKED_DATE = "2026-10-16";
export const SOURCES = [
  { title: "Działalność nierejestrowana — zasady i limity", url: "https://www.podatki.gov.pl/poradniki-i-informatory/dzialalnosc-nierejestrowana" },
  { title: "PIT: przychody, koszty i rozliczenie roczne", url: "https://www.podatki.gov.pl/podatki-osobiste/pit/informacje-podstawowe/co-jest-opodatkowane/dochody-z-dzialalnosci-nierejestrowanej" },
  { title: "KSeF: przejściowy próg 10 000 zł w 2026", url: "https://ksef.podatki.gov.pl/ponizej-10-000-zl/" },
  { title: "Kasy rejestrujące — zwolnienia i wyjątki", url: "https://www.podatki.gov.pl/podatki-firmowe/vat/poradniki-i-informatory/ewidencja-sprzedazy-z-wykorzystaniem-kas-rejestrujacych" },
  { title: "Rozporządzenie o zwolnieniach z kas", url: "https://eli.gov.pl/api/acts/DU/2024/1902/text.html" },
];
export function money(value: number): string { return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(value / 100); }
export function parseMoney(input: unknown): number {
  if (typeof input !== "string" || !/^-?\d{1,9}([.,]\d{1,2})?$/.test(input.replace(/\s/g, ""))) throw new Error("Wpisz kwotę z maksymalnie dwoma miejscami po przecinku.");
  const clean = input.replace(/\s/g, "").replace(",", "."); const neg = clean.startsWith("-"); const [whole, frac = ""] = clean.replace("-", "").split(".");
  return (neg ? -1 : 1) * (Number(whole) * 100 + Number(frac.padEnd(2, "0")));
}
export function decimal(value: number): string { return (value / 100).toFixed(2); }
export function today(): string { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date()); }
// The verified rules end on this date. Default form dates never leave the supported range.
export const LAST_SUPPORTED_DATE = "2026-12-31";
export function workDate(): string { const date = today(); return date > LAST_SUPPORTED_DATE ? LAST_SUPPORTED_DATE : date; }
export function validDate(input: unknown): input is string { if (typeof input !== "string" || !/^(19|20)\d{2}-\d{2}-\d{2}$/.test(input)) return false; const d = new Date(input + "T12:00:00Z"); return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === input; }
export function dateLabel(value: string): string { return value ? value.split("-").reverse().join(".") : "—"; }
export function periodRule(year: number) { if (year === 2025) return { limit: 349950, periods: 12, label: "miesiąc", short: "M" }; if (year === 2026) return { limit: 1081350, periods: 4, label: "kwartał", short: "Q" }; return null; }
export function periodNumber(date: string, year: number): number { return year === 2025 ? Number(date.slice(5, 7)) : Math.ceil(Number(date.slice(5, 7)) / 3); }
export function inPeriod(date: string, year: number, period: number): boolean { return Number(date.slice(0, 4)) === year && (period === 0 || periodNumber(date, year) === period); }
export function total<T>(rows: T[], amount: (row: T) => number): number { return rows.reduce((sum, row) => sum + amount(row), 0); }
export function paidFor(sale: Sale, payments: Payment[]): number { return total(payments.filter(p => p.saleId === sale.id), p => p.amount); }
export function aggregate(state: State, year: number, period: number) {
  const sales = state.sales.filter(s => inPeriod(s.date, year, period)); const payments = state.payments.filter(p => inPeriod(p.date, year, period)); const expenses = state.expenses.filter(e => inPeriod(e.paidDate, year, period));
  const due = total(sales, s => s.amount); const received = total(payments, p => p.amount); const spent = total(expenses, e => e.amount); const deductible = total(expenses, e => e.deductible);
  const outstanding = total(state.sales, s => s.amount) - total(state.payments, p => p.amount);
  return { due, received, spent, deductible, profit: received - deductible, outstanding, sales, payments, expenses };
}
// Art. 63 Ordynacji podatkowej: dodatnia podstawa i podatek do pełnego złotego.
export function roundedPLN(cents: number): number { return Math.floor((Math.max(0, cents) + 50) / 100); }
export function scaleTaxRawCents(cents: number): number { const base = roundedPLN(cents); return Math.max(0, base <= 120000 ? base * 12 - 360000 : 1080000 + (base - 120000) * 32); }
export function scaleTax(cents: number): number { return roundedPLN(scaleTaxRawCents(cents)) * 100; }
export function annualTax(state: State, year: number) {
  const a = aggregate(state, year, 0); const input = state.tax.find(t => t.year === year) ?? { year, otherIncome: 0, deductions: 0, advances: 0, taxRelief: 0, version: 0 };
  const positiveProfit = Math.max(0, a.profit); const base = Math.max(0, input.otherIncome + positiveProfit - input.deductions);
  const tax = roundedPLN(Math.max(0, scaleTaxRawCents(base) - input.taxRelief)) * 100;
  const increment = Math.max(0, scaleTax(base) - scaleTax(Math.max(0, input.otherIncome - input.deductions)));
  return { ...a, input, base, tax, increment, balance: tax - input.advances, loss: Math.max(0, -a.profit) };
}
export function firstBreach(sales: Sale[]) {
  const sorted = [...sales].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)); const sums = new Map<string, number>();
  for (const s of sorted) { const year = Number(s.date.slice(0, 4)); const rule = periodRule(year); if (!rule) continue; const key = `${year}-${periodNumber(s.date, year)}`; const sum = (sums.get(key) ?? 0) + s.amount; sums.set(key, sum); if (sum > rule.limit) return { date: s.date, amount: sum, limit: rule.limit }; }
  return null;
}
export function ksefBreach(sales: Sale[]) {
  const totals = new Map<string, number>();
  for (const s of [...sales].filter(s => s.b2b && s.ksefEligible && s.issueDate >= "2026-04-01" && s.issueDate <= "2026-12-31").sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.createdAt.localeCompare(b.createdAt))) { const month = s.issueDate.slice(0, 7); const sum = (totals.get(month) ?? 0) + s.amount; totals.set(month, sum); if (sum > 1000000) return s.issueDate; }
  return null;
}
export function filingDeadline(year: number): string { const d = new Date(Date.UTC(year + 1, 3, 30, 12)); while ([0, 6].includes(d.getUTCDay()) || ["05-01", "05-03"].includes(d.toISOString().slice(5, 10))) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
function polishHolidays(year: number): Set<string> {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = (h + l - 7 * m + 114) % 31 + 1;
  const holidays = new Set(["01-01", "01-06", "05-01", "05-03", "08-15", "11-01", "11-11", "12-25", "12-26", ...(year >= 2025 ? ["12-24"] : [])].map(md => `${year}-${md}`));
  for (const offset of [0, 1, 49, 60]) { const date = new Date(Date.UTC(year, month - 1, day + offset, 12)); holidays.add(date.toISOString().slice(0, 10)); } return holidays;
}
export function nextBusinessDate(value: string): string { const d = new Date(value + "T12:00:00Z"); while ([0, 6].includes(d.getUTCDay()) || polishHolidays(d.getUTCFullYear()).has(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
export function ceidgDeadline(breachDate: string): string { const d = new Date(breachDate + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 7); while ([0, 6].includes(d.getUTCDay()) || polishHolidays(d.getUTCFullYear()).has(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
export function csvCell(value: unknown): string { const text = String(value ?? ""); const clean = text.trimStart(); const unsafe = /^[=+@]/.test(clean) || (clean.startsWith("-") && !/^-\d+([.,]\d+)?$/.test(clean)) || /^[\t\r\n]/.test(text); return '"' + (unsafe ? "'" : "") + text.replace(/"/g, '""') + '"'; }
export function toCsv(rows: unknown[][]): string { return "\ufeff" + rows.map(row => row.map(csvCell).join(";")).join("\r\n"); }
export function validNip(value: string): boolean { if (!value) return true; const n = value.replace(/[\s-]/g, ""); return /^\d{10}$/.test(n) && [6, 5, 7, 2, 3, 4, 5, 6, 7].reduce((sum, weight, i) => sum + Number(n[i]) * weight, 0) % 11 === Number(n[9]); }
