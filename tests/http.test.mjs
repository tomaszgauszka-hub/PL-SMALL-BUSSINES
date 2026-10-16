import test from "node:test";
import assert from "node:assert/strict";
import { safeReturnPath, sameOrigin, json } from "../lib/http.ts";
import { backupInput } from "../lib/validation.ts";

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
