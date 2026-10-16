// Leave space for multipart headers below the hosting provider's request limit.
export const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;

export function evidenceMime(bytes: Uint8Array): string {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  return "";
}

export async function validateEvidence(file: File): Promise<void> {
  if (!file.size) throw new Error("Wybrany plik jest pusty.");
  if (file.size > MAX_EVIDENCE_BYTES) throw new Error("Załącznik może mieć maksymalnie 4 MB. Wybierz mniejsze zdjęcie lub PDF.");
  if (!evidenceMime(new Uint8Array(await file.slice(0, 8).arrayBuffer()))) throw new Error("Obsługiwane formaty to PDF, JPG i PNG.");
}

export async function uploadEvidence(expenseId: string, file: File, request: typeof fetch = fetch): Promise<void> {
  await validateEvidence(file);
  const form = new FormData();
  form.set("file", file);
  form.set("expenseId", expenseId);
  let response: Response;
  try { response = await request("/api/files", { method: "POST", body: form, credentials: "same-origin" }); }
  catch { throw new Error("Przerwano wysyłanie załącznika. Sprawdź połączenie i spróbuj ponownie."); }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "";
    throw new Error(message || (response.status === 413 ? "Załącznik jest za duży. Wybierz plik do 4 MB." : "Nie udało się zapisać załącznika. Spróbuj ponownie."));
  }
}
