import { authenticateTest, encryptedTestInvoice, KsefTestError, referencePath, sha256 } from "./test-client.ts";
import type { TestConnection } from "./test-client.ts";
import { buildTestInvoice, validateTestXml } from "./fa3.ts";
import type { TestDocument } from "./test-model.ts";

export type StoredTestDocument = TestDocument & { xml: string; upo: string | null; closed_at: string | null };
export type TestClaim = { lease: string; workspace: { id: string; test_nip: string }; document: StoredTestDocument | null };
export type TestStore = { claim: (action: string, id: string | null) => Promise<TestClaim>; commit: (lease: string, data: Record<string, unknown>, release: boolean) => Promise<void> };
type MfInvoice = { invoiceHash: string; invoiceNumber?: string; referenceNumber: string; ksefNumber?: string; status: { code: number; description?: string; details?: string[] } };

export async function verifyStoredTestInvoice(doc: StoredTestDocument, nip: string) {
  const timestamp = doc.xml.match(/<DataWytworzeniaFa>([^<]+)<\/DataWytworzeniaFa>/)?.[1];
  if (!timestamp) throw new KsefTestError("Brak daty wygenerowania XML TEST.");
  const expected = buildTestInvoice(doc.id, nip, doc.input, timestamp);
  if (expected.xml !== doc.xml || expected.number !== doc.number || sha256(doc.xml) !== doc.invoice_hash || expected.gross !== doc.gross || expected.net !== doc.net || expected.vat !== doc.vat) throw new KsefTestError("Dane XML nie odpowiadają fikcyjnemu dokumentowi laboratorium. Wysyłkę zablokowano.");
  await validateTestXml(doc.xml);
}

export async function runTestOperation(store: TestStore, action: "connect" | "send" | "refresh", id: string | null, authenticate = authenticateTest) {
  const claim = await store.claim(action, id), doc = claim.document;
  let currentStatus = action === "send" ? "sending" : doc?.status;
  let session = doc?.session_reference ?? null, invoice = doc?.invoice_reference ?? null;
  let submissionStarted = doc?.phase === "submission_started" || !!invoice, verified = false;
  let connection: TestConnection | undefined;
  const commit = async (data: Record<string, unknown>, release = false) => {
    await store.commit(claim.lease, data, release);
    if (typeof data.status === "string") currentStatus = data.status;
  };
  try {
    if (doc) { await verifyStoredTestInvoice(doc, claim.workspace.test_nip); verified = true; }
    connection = await authenticate(claim.workspace.test_nip);
    await commit({ authenticated: true });
    if (action === "connect") { await commit({}, true); return; }
    if (!doc) throw new KsefTestError("Nie znaleziono testowego dokumentu.");

    if (action === "send") {
      const prepared = await encryptedTestInvoice(connection, doc.xml);
      const opened = (await connection.request("/sessions/online", { method: "POST", body: { formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" }, encryption: prepared.encryption } })).data;
      session = referencePath(opened.referenceNumber);
      await commit({ status: "sending", phase: "session_open", sessionReference: session, message: "Otwarto sesję w MF TEST." });
      // This durable checkpoint MUST succeed before the non-idempotent MF POST.
      await commit({ status: "sending", phase: "submission_started", message: "Rozpoczęto przekazanie faktury do MF TEST." });
      submissionStarted = true;
      const sent = (await connection.request(`/sessions/online/${session}/invoices`, { method: "POST", body: prepared.invoice })).data;
      invoice = referencePath(sent.referenceNumber);
      await commit({ status: "processing", phase: "submitted", invoiceReference: invoice, message: "MF TEST otrzymało plik. Oczekujemy na wynik weryfikacji." });
    }

    if (!session) {
      await commit({ status: "ready", phase: "validated", message: "Poprzednia operacja zakończyła się przed wysyłką. Możesz wysłać dokument." }, true);
      return;
    }
    session = referencePath(session);
    let closed = !!doc.closed_at;
    if (!closed) {
      try {
        await connection.request(`/sessions/online/${session}/close`, { method: "POST" });
        await commit({ closed: true, message: "Zamknięto sesję TEST; MF przetwarza fakturę i UPO." }); closed = true;
      } catch (error) {
        // 21180 also means an already closed session: verify its status instead of
        // re-sending an invoice or opening a replacement session.
        if (error instanceof KsefTestError && /21180/.test(error.message)) {
          const state = (await connection.request(`/sessions/${session}`)).data;
          if (state.status.code === 200) { await commit({ closed: true }); closed = true; }
        }
      }
    }

    let mf: MfInvoice | undefined;
    if (!invoice) {
      const list = (await connection.request(`/sessions/${session}/invoices?pageSize=10`)).data;
      mf = (list.invoices as MfInvoice[]).find(item => item.invoiceHash === doc.invoice_hash && (!item.invoiceNumber || item.invoiceNumber === doc.number));
      if (!mf) {
        await commit({ status: "unknown", message: "Nie znaleziono jeszcze tej faktury w sesji MF TEST. Nie ponawiaj wysyłki; sprawdź status później." }, true);
        return;
      }
      invoice = referencePath(mf.referenceNumber);
      await commit({ invoiceReference: invoice, status: "processing", phase: "submitted", message: "Odnaleziono fakturę w sesji na podstawie jej SHA-256." });
    }
    mf ??= (await connection.request(`/sessions/${session}/invoices/${referencePath(invoice)}`)).data as MfInvoice;
    if (mf.invoiceHash !== doc.invoice_hash || mf.referenceNumber !== invoice || (mf.invoiceNumber && mf.invoiceNumber !== doc.number)) throw new KsefTestError("Odpowiedź MF TEST nie odpowiada temu dokumentowi.");
    const message = [mf.status.description, ...(mf.status.details ?? [])].filter(Boolean).join(" ").slice(0, 1400);
    if (mf.status.code === 200 && mf.ksefNumber) {
      if (!new RegExp(`^${claim.workspace.test_nip}-[0-9]{8}-[A-F0-9]{12}-[A-F0-9]{2}$`).test(mf.ksefNumber)) throw new KsefTestError("Numer KSeF TEST nie odpowiada fikcyjnej JDG.");
      await commit({ status: "accepted", phase: "checked", mfStatus: 200, ksefNumber: mf.ksefNumber, message: "Faktura przyjęta w MF TEST. " + message });
      if (!doc.upo) {
        try {
          const upo = await connection.request(`/sessions/${session}/invoices/${invoice}/upo`);
          const digest = sha256(upo.text), expected = upo.response.headers.get("x-ms-meta-hash");
          if (!upo.response.headers.get("content-type")?.includes("xml") || /<!DOCTYPE|<!ENTITY/i.test(upo.text) || !upo.text.includes(mf.ksefNumber) || (expected && expected !== digest)) throw new KsefTestError("Nie udało się potwierdzić zgodności UPO z fakturą TEST.");
          await commit({ upo: upo.text, upoHash: digest, message: "Faktura przyjęta w MF TEST. UPO pobrane i sprawdzone." });
        } catch (error) {
          await commit({ message: error instanceof KsefTestError && error.status === 429 ? "Faktura przyjęta. Limit MF: pobierz UPO przy kolejnym sprawdzeniu." : "Faktura przyjęta w MF TEST. UPO nie jest jeszcze dostępne albo nie przeszło sprawdzenia; sprawdź ponownie." });
        }
      }
      await commit({ phase: "finished" }, true);
    } else if (mf.status.code >= 400) {
      await commit({ status: "rejected", phase: "finished", mfStatus: mf.status.code, message: message || `MF TEST odrzuciło dokument (${mf.status.code}).` }, true);
    } else {
      await commit({ status: "processing", phase: "checked", mfStatus: mf.status.code, message: message || "MF TEST nadal przetwarza dokument. Sprawdź ponownie." }, true);
    }
  } catch (error) {
    const message = error instanceof KsefTestError ? error.message : "Nie udało się zakończyć operacji TEST. Sprawdź stan dokumentu przed ponowieniem.";
    if (doc) {
      const status = currentStatus === "accepted" ? "accepted" : currentStatus === "processing" ? "processing" : submissionStarted || session ? "unknown" : verified ? (action === "send" ? "ready" : doc.status) : "blocked";
      try { await commit({ status, message }, true); } catch { /* Keep the original error. Lease expires; reconciliation is read-only at MF. */ }
    } else {
      try { await commit({}, true); } catch { /* Lease expires without exposing credentials. */ }
    }
    throw error instanceof KsefTestError ? error : new KsefTestError(message, 503);
  } finally {
    try { await connection?.dispose?.(); } catch { /* Access token expires; no credential is persisted or returned. */ }
  }
}
