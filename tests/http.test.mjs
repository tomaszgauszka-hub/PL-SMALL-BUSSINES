import test from "node:test";
import assert from "node:assert/strict";
import { safeReturnPath, sameOrigin, json } from "../lib/http.ts";
import { backupInput } from "../lib/validation.ts";
import { MAX_EVIDENCE_BYTES, uploadEvidence, validateEvidence } from "../lib/attachments.ts";

test("email callback redirects stay on this application", () => {
  for (const path of ["https://evil.test", "//evil.test", "/\\evil.test", "/\n/evil.test", null]) assert.equal(safeReturnPath(path), "/");
  assert.equal(safeReturnPath("/reset-password?from=email"), "/reset-password?from=email");
  assert.equal(safeReturnPath(null, "/reset-password"), "/reset-password");
});
test("financial and auth writes require the exact same origin", () => {
  const request = origin => new Request("https://ksiega.test/api/state", { method: "POST", headers: origin ? { origin } : {} });
  assert.equal(sameOrigin(request("https://ksiega.test")), true);
  for (const origin of [undefined, "null", "https://evil.test", "http://ksiega.test", "https://ksiega.test.evil.test"]) assert.equal(sameOrigin(request(origin)), false);
});
test("private API responses cannot be publicly cached", async () => {
  const response = json({ error: "Zaloguj się." }, 401);
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("vary"), "Cookie");
});
test("backup validation rejects missing arrays and invalid profile data", () => {
  const backup = { format: "mala-ksiega-1", clients: [], sales: [], payments: [], expenses: [] };
  assert.equal(backupInput.safeParse(backup).success, true);
  assert.equal(backupInput.safeParse({ ...backup, expenses: undefined }).success, false);
  assert.equal(backupInput.safeParse({ ...backup, settings: { sellerName: 5 } }).success, false);
});
test("evidence validates actual bytes and size before sending a request", async () => {
  const pdf = new File(["%PDF-test"], "dowod.pdf", { type: "text/plain" });
  await validateEvidence(pdf);
  await assert.rejects(validateEvidence(new File(["invalid"], "dowod.pdf", { type: "application/pdf" })), /formaty/);
  await assert.rejects(validateEvidence(new File([], "pusty.pdf")), /pusty/);
  let calls = 0;
  await assert.rejects(uploadEvidence("expense", new File([new Uint8Array(MAX_EVIDENCE_BYTES + 1)], "duzy.pdf"), async () => { calls++; return Response.json({}); }), /maksymalnie 4 MB/);
  assert.equal(calls, 0);
});
test("attachment failures remain readable for network and non-JSON hosting errors", async () => {
  const file = new File(["%PDF-test"], "dowod.pdf");
  await assert.rejects(uploadEvidence("expense", file, async () => { throw new TypeError("Failed to fetch"); }), /Sprawdź połączenie/);
  await assert.rejects(uploadEvidence("expense", file, async () => new Response("FUNCTION_PAYLOAD_TOO_LARGE", { status: 413 })), /do 4 MB/);
  await assert.rejects(uploadEvidence("expense", file, async () => Response.json({ error: "Nie znaleziono wydatku." }, { status: 404 })), /Nie znaleziono wydatku/);
  await uploadEvidence("expense", file, async (_url, options) => { assert.equal(options.body.get("expenseId"), "expense"); assert.equal(options.body.get("file").name, "dowod.pdf"); return Response.json({ ok: true }); });
});
