import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUser, serverSupabase } from "../../../lib/supabase/server";
import { json, sameOrigin } from "../../../lib/http";
import { testInvoiceInput } from "../../../lib/ksef/test-model";
import { buildTestInvoice, validateTestXml } from "../../../lib/ksef/fa3";
import { KsefTestError, sha256 } from "../../../lib/ksef/test-client";
import { runTestOperation } from "../../../lib/ksef/test-service";
import type { TestClaim } from "../../../lib/ksef/test-service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const uuid = z.string().uuid();
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect") }).strict(),
  z.object({ action: z.literal("create"), id: uuid, input: testInvoiceInput }).strict(),
  z.object({ action: z.literal("send"), id: uuid }).strict(),
  z.object({ action: z.literal("refresh"), id: uuid }).strict(),
]);
const workspaceColumns = "id,display_name,test_nip,environment,business_type,status,last_auth_at";
const documentColumns = "id,number,input,net,vat,gross,status,phase,session_reference,invoice_reference,invoice_hash,ksef_number,mf_status,message,upo_hash,created_at,updated_at,events";
async function state(db: SupabaseClient) {
  const [workspace, documents] = await Promise.all([
    db.from("mk_ksef_test_workspaces").select(workspaceColumns).maybeSingle(),
    db.from("mk_ksef_test_documents").select(documentColumns).order("created_at", { ascending: false }).limit(100),
  ]);
  if (workspace.error || documents.error) return json({ error: "Nie udało się odczytać laboratorium TEST." }, 503);
  if (!workspace.data) return json({ error: "To konto nie ma przydzielonego laboratorium TEST." }, 403);
  return json({ workspace: workspace.data, documents: documents.data });
}
export async function GET(request: Request) {
  if (!await currentUser()) return json({ error: "Zaloguj się." }, 401);
  const db = await serverSupabase(), url = new URL(request.url), download = url.searchParams.get("download"), id = url.searchParams.get("id");
  if (!download) return state(db);
  if (!["xml", "upo"].includes(download) || !uuid.safeParse(id).success) return json({ error: "Nieprawidłowy dokument TEST." }, 400);
  const result = await db.from("mk_ksef_test_documents").select("id,xml,upo,status").eq("id", id!).maybeSingle();
  if (result.error) return json({ error: "Nie udało się pobrać pliku TEST." }, 503);
  if (!result.data) return json({ error: "Nie znaleziono dokumentu TEST." }, 404);
  const text = download === "xml" ? result.data.xml : result.data.status === "accepted" ? result.data.upo : null;
  if (!text) return json({ error: "UPO nie jest jeszcze dostępne. Sprawdź status faktury." }, 404);
  return new Response(text, { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="ewidora-test-${id}-${download}.xml"`, "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" } });
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Nieprawidłowe źródło żądania." }, 403);
  if (!await currentUser()) return json({ error: "Zaloguj się." }, 401);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Wymagany JSON." }, 415);
  try {
    const raw = await request.text(); if (raw.length > 100000) return json({ error: "Żądanie TEST jest za duże." }, 413);
    const value = command.parse(JSON.parse(raw)), db = await serverSupabase();
    const assigned = await db.from("mk_ksef_test_workspaces").select("id,test_nip,status").maybeSingle();
    if (assigned.error) return json({ error: "Nie udało się odczytać konfiguracji TEST." }, 503);
    if (!assigned.data || assigned.data.status !== "person_created") return json({ error: "Brak przygotowanej JDG TEST dla tego konta." }, 403);
    if (value.action === "create") {
      const prepared = buildTestInvoice(value.id, assigned.data.test_nip, value.input, new Date().toISOString());
      await validateTestXml(prepared.xml);
      const result = await db.rpc("mk_ksef_test_create", { p_id: value.id, p_data: { ...prepared, invoiceHash: sha256(prepared.xml) } });
      if (result.error) return json({ error: result.error.code === "40001" ? result.error.message : result.error.code === "P0001" ? result.error.message : "Nie udało się zapisać faktury TEST." }, result.error.code === "40001" ? 409 : 503);
    } else {
      await runTestOperation({
        async claim(action, id) {
          const result = await db.rpc("mk_ksef_test_claim", { p_action: action, p_document_id: id });
          if (result.error) throw new KsefTestError(["40001", "P0001", "42501"].includes(result.error.code) ? result.error.message : "Nie udało się rozpocząć operacji TEST.", result.error.code === "40001" ? 409 : result.error.code === "42501" ? 403 : 503);
          return result.data as TestClaim;
        },
        async commit(lease, data, release) {
          const result = await db.rpc("mk_ksef_test_commit", { p_lease: lease, p_data: data, p_release: release });
          if (result.error) throw new KsefTestError("Nie udało się utrwalić etapu operacji. Sprawdź status przed ponowieniem.", 503);
        },
      }, value.action, value.action === "connect" ? null : value.id);
    }
    return state(db);
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: error.issues.map(issue => issue.message).join(" ") }, 400);
    if (error instanceof KsefTestError) {
      const status = [403, 409, 429, 503, 504].includes(error.status) ? error.status : 502;
      const response = json({ error: error.message }, status);
      if (status === 429) response.headers.set("Retry-After", String(error.retryAfter || 10));
      return response;
    }
    return json({ error: "Nie udało się przygotować dokumentu lub wykonać operacji TEST. Odśwież stan przed ponowieniem." }, 400);
  }
}
