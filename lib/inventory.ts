import { z } from "zod";
import { today, validDate, validNip } from "./domain.ts";

const text = (max: number) => z.string().trim().max(max);
const amount = z.number().int().min(0).max(99999999999);
const optionalId = z.union([z.string().uuid(), z.literal("")]);
export const INVENTORY_KINDS = { opening: "Spis początkowy", interim: "Spis na koniec miesiąca", closing: "Spis końcowy roku" } as const;
export const INVENTORY_CATEGORIES = { goods: "Towary handlowe", materials: "Materiały i surowce", wip: "Produkcja w toku / półwyroby", finished: "Wyroby gotowe", defective: "Braki", waste: "Odpady" } as const;
export const VALUATION_METHODS = { purchase: "Cena zakupu", acquisition: "Cena nabycia", cost: "Koszt wytworzenia", market: "Niższa cena rynkowa", estimate: "Oszacowanie przydatności", unvalued: "Towary obce — bez wyceny" } as const;
export const INVENTORY_SOURCES = [
  { title: "KPiR od 2026 r. — spis i wycena (§ 20–22)", url: "https://eli.gov.pl/api/acts/DU/2025/1299/text.pdf" },
  { title: "PIT — dochód z remanentem (art. 24 ust. 2 i art. 44 ust. 2)", url: "https://eli.gov.pl/api/acts/DU/2026/592/text/U/D20260592Lj.pdf" },
  { title: "KPiR w 2025 r. — § 24–26", url: "https://eli.gov.pl/api/acts/DU/2019/2544/text.pdf" },
];
export const inventoryLineInput = z.object({
  productId: optionalId, name: text(300).min(1, "Wpisz nazwę składnika."), category: z.enum(["goods", "materials", "wip", "finished", "defective", "waste"]),
  unit: text(30).min(1, "Wpisz jednostkę."), quantityMilli: z.number().int().min(1).max(1000000000), unitPrice: amount,
  method: z.enum(["purchase", "acquisition", "cost", "market", "estimate", "unvalued"]), referencePrice: amount.nullable(), minimumUnitPrice: amount,
  ownership: z.enum(["own", "third_party"]), ownerName: text(200), location: text(400), excludedValue: amount, note: text(1000),
}).superRefine((line, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if (line.ownership === "third_party") {
    if (!line.ownerName || line.method !== "unvalued" || line.unitPrice !== 0 || line.excludedValue !== 0) issue("Towary obce wymagają właściciela i ujęcia ilościowego bez wyceny.");
    return;
  }
  if (line.method === "unvalued") issue("Własny składnik wymaga wyceny.");
  if (["goods", "materials"].includes(line.category) && !["purchase", "acquisition", "market"].includes(line.method)) issue("Towary i materiały wyceń według ceny zakupu/nabycia albo niższej ceny rynkowej.");
  if (["finished", "defective", "wip"].includes(line.category) && !["cost", "market"].includes(line.method)) issue("Dla wyrobów, braków i produkcji w toku wskaż koszt wytworzenia albo uzasadnioną niższą wycenę.");
  if (line.category === "waste" && line.method !== "estimate") issue("Odpady wyceń według oszacowanej przydatności.");
  if (line.method === "market" && (line.referencePrice === null || line.unitPrice > line.referencePrice || !line.note)) issue("Niższa wycena wymaga pierwotnej ceny oraz uzasadnienia; nie może przekraczać ceny pierwotnej.");
  if (line.referencePrice !== null && line.unitPrice < line.referencePrice && !line.note) issue("Uzasadnij obniżenie wyceny względem ceny pierwotnej.");
  if (line.category === "wip" && line.unitPrice < line.minimumUnitPrice) issue("Wycena produkcji w toku nie może być niższa od zużytych materiałów bezpośrednich.");
  const gross = Number((BigInt(line.quantityMilli) * BigInt(line.unitPrice) + 500n) / 1000n);
  if (line.excludedValue > gross || (line.excludedValue > 0 && !line.note)) issue("Pomniejszenie ustawowe wymaga uzasadnienia i nie może przekraczać wartości pozycji.");
});
export type InventoryLine = z.infer<typeof inventoryLineInput>;
export function inventoryLineValue(line: Pick<InventoryLine, "quantityMilli" | "unitPrice" | "ownership" | "excludedValue">) {
  if (!Number.isSafeInteger(line.quantityMilli) || !Number.isSafeInteger(line.unitPrice) || !Number.isSafeInteger(line.excludedValue) || line.quantityMilli < 1 || line.unitPrice < 0 || line.excludedValue < 0) throw new Error("Nieprawidłowa ilość lub wycena.");
  if (line.ownership === "third_party") return { gross: 0, excluded: 0, value: 0 };
  const gross = Number((BigInt(line.quantityMilli) * BigInt(line.unitPrice) + 500n) / 1000n);
  if (!Number.isSafeInteger(gross) || gross > 99999999999 || line.excludedValue > gross) throw new Error("Wycena pozycji poza zakresem.");
  return { gross, excluded: line.excludedValue, value: gross - line.excludedValue };
}
export function inventoryTotal(lines: InventoryLine[]) { const total = lines.reduce((sum, line) => sum + inventoryLineValue(line).value, 0); if (!Number.isSafeInteger(total) || total > 99999999999) throw new Error("Wartość spisu poza zakresem."); return total; }
export function monthEnd(year: number, month: number) { return new Date(Date.UTC(year, month, 0, 12)).toISOString().slice(0, 10); }
export const inventoryInput = z.object({
  id: z.string().uuid(), kind: z.enum(["opening", "interim", "closing"]), date: z.string().refine(validDate, "Nieprawidłowa data spisu.").refine(v => v >= "2025-01-01" && v <= "2026-12-31", "Obsługiwane lata: 2025–2026."),
  status: z.enum(["draft", "final"]), replacesId: optionalId, reason: text(1000), location: text(400), countedBy: text(200), notes: text(2000), zeroConfirmed: z.boolean(),
  lines: z.array(inventoryLineInput).max(300), version: z.number().int().nonnegative(),
}).superRefine((doc, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if (doc.kind === "closing" && doc.date.slice(5) !== "12-31") issue("Spis końcowy roku wymaga daty 31 grudnia.");
  if (doc.kind === "interim" && validDate(doc.date) && (doc.date !== monthEnd(Number(doc.date.slice(0, 4)), Number(doc.date.slice(5, 7))) || doc.date.slice(5) === "12-31")) issue("Spis okresowy zapisz na koniec miesiąca od stycznia do listopada. W grudniu wybierz spis końcowy.");
  if (doc.replacesId && !doc.reason) issue("Poprawiona wersja wymaga przyczyny.");
  if (doc.replacesId === doc.id) issue("Spis nie może zastępować samego siebie.");
  if (doc.status === "final" && doc.date > today()) issue("Przyszły spis zapisz jako szkic.");
  if (doc.status === "final" && (!doc.countedBy || (!doc.lines.length && !doc.zeroConfirmed))) issue("Wpisz osobę sporządzającą spis i potwierdź spis zerowy, jeśli nie ma pozycji.");
  try { inventoryTotal(doc.lines); } catch (error) { issue((error as Error).message); }
});
export type InventoryInput = z.infer<typeof inventoryInput>;
export type Inventory = Omit<InventoryInput, "status"> & { status: "draft" | "final" | "void"; total: number; seller?: { name: string; address: string; nip: string }; createdAt: string; finalizedAt: string };
export const inventoryRestoreInput = z.object({ document: inventoryInput, snapshot: z.object({ total: amount, seller: z.object({ name: text(200).min(1), address: text(400).min(1), nip: text(20).refine(v => !!v && validNip(v)) }).optional(), createdAt: z.string().datetime({ offset: true }), finalizedAt: z.union([z.string().datetime({ offset: true }), z.literal("")]) }) }).superRefine((value, ctx) => { try { if (value.snapshot.total !== inventoryTotal(value.document.lines) || (value.document.status === "final" && !value.snapshot.seller)) ctx.addIssue({ code: "custom", message: "Kopia spisu ma niezgodne kwoty lub nie zawiera danych firmy." }); } catch { ctx.addIssue({ code: "custom", message: "Kopia spisu ma nieprawidłową wycenę." }); } });
export function activeInventories(records: Inventory[]) { const replaced = new Set(records.filter(doc => doc.status === "final" && doc.replacesId).map(doc => doc.replacesId)); return records.filter(doc => doc.status === "final" && !replaced.has(doc.id)); }
export function inventoryEffect(records: Inventory[], year: number, jdgStartDate = "", month = 0) {
  const active = activeInventories(records);
  const opening = active.find(doc => doc.kind === "opening" && doc.date.startsWith(String(year))) ?? (jdgStartDate && jdgStartDate < `${year}-01-01` ? active.find(doc => doc.kind === "closing" && doc.date === `${year - 1}-12-31`) : undefined);
  const date = month ? monthEnd(year, month) : `${year}-12-31`, ending = active.find(doc => doc.kind === (month && month < 12 ? "interim" : "closing") && doc.date === date);
  return { opening, ending, complete: !!opening && !!ending, valid: !ending || !!opening, adjustment: opening && ending ? ending.total - opening.total : 0, carriedOpening: !!opening && opening.date === `${year - 1}-12-31` };
}
export function inventoryImportOrder(records: Inventory[], existing = new Set<string>()): Inventory[] {
  const remaining = records.filter(doc => doc.status !== "void" && !existing.has(doc.id)), result: Inventory[] = [], known = new Set(existing);
  while (remaining.length) { const index = remaining.findIndex(doc => !doc.replacesId || known.has(doc.replacesId)); if (index < 0) throw new Error("Kopia spisów ma brakującą wersję źródłową albo cykl korekt."); const [next] = remaining.splice(index, 1); if (!known.has(next.id)) { result.push(next); known.add(next.id); } }
  return result;
}
