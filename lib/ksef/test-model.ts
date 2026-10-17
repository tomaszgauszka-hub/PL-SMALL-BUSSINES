import { z } from "zod";
import { validDate, validNip, today } from "../domain.ts";
import { calculateInvoice, calculateInvoiceLine } from "../business.ts";

export const testLineInput = z.object({
  name: z.string().trim().min(1).max(200).refine(v => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v), "Niedozwolony znak w nazwie."),
  unit: z.string().trim().min(1).max(20).regex(/^[\p{L}\p{N}. /-]+$/u),
  quantityMilli: z.number().int().min(1).max(1_000_000), unitPrice: z.number().int().min(1).max(10_000_000),
  vatRate: z.enum(["23", "8", "5", "0", "zw"]),
}).strict();
export const testInvoiceInput = z.object({
  synthetic: z.literal(true, { errorMap: () => ({ message: "Potwierdź używanie wyłącznie fikcyjnych danych." }) }),
  issueDate: z.string().refine(validDate, "Nieprawidłowa data.").refine(v => v >= "2025-01-01" && v <= today(), "Data testu nie może być przyszła."),
  lines: z.array(testLineInput).min(1).max(20),
}).strict();
export type TestInvoiceInput = z.infer<typeof testInvoiceInput>;
export function testTotals(input: TestInvoiceInput) {
  const lines = input.lines.map(line => ({ ...line, discountBps: 0, lumpSumRate: 850, productId: "" }));
  return { ...calculateInvoice(lines), lines: lines.map((line, i) => ({ ...input.lines[i], ...calculateInvoiceLine(line) })) };
}
export const TEST_STATUS_LABELS: Record<string, string> = { ready: "Gotowa do wysłania", sending: "Trwa wysyłka", processing: "MF przetwarza", accepted: "Przyjęta w KSeF TEST", rejected: "Odrzucona przez MF", unknown: "Wynik nieustalony", blocked: "Wymaga sprawdzenia" };
export type TestDocument = {
  id: string; number: string; input: TestInvoiceInput; net: number; vat: number; gross: number; status: string;
  phase: string; session_reference: string | null; invoice_reference: string | null; invoice_hash: string;
  ksef_number: string | null; mf_status: number | null; message: string; upo_hash: string | null; created_at: string; updated_at: string;
  events?: { at: string; status: string; phase: string; message: string }[];
};
export type TestWorkspace = { id: string; display_name: string; test_nip: string; environment: "TEST"; business_type: "jdg"; status: string; last_auth_at: string | null };
export type TestState = { workspace: TestWorkspace; documents: TestDocument[] };
export function syntheticBuyerNip(id: string, seller: string) {
  const seed = id.replace(/-/g, "");
  for (let n = 0; n < 100; n++) {
    const d = Array.from({ length: 9 }, (_, i) => (parseInt(seed[i] || "0", 16) + n) % 10);
    d[0] = d[0] || 1;
    const checksum = d.reduce((s, v, i) => s + v * [6, 5, 7, 2, 3, 4, 5, 6, 7][i], 0) % 11;
    const nip = d.join("") + checksum;
    if (checksum < 10 && nip !== seller && validNip(nip)) return nip;
  }
  throw new Error("Nie udało się przygotować fikcyjnego nabywcy.");
}
