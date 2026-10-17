// Node.js only. No credentials are written to disk, database, logs or responses.
import "reflect-metadata";
import { webcrypto, randomBytes, createHash, createCipheriv, publicEncrypt, constants, X509Certificate } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import * as x509 from "@peculiar/x509";
import * as xades from "xadesjs";
import { DOMParser, XMLSerializer, DOMImplementation } from "@xmldom/xmldom";
import xpath from "xpath";

export const TEST_API = "https://api-test.ksef.mf.gov.pl/v2";
const cryptoEngine = webcrypto as unknown as Crypto;
x509.cryptoProvider.set(cryptoEngine);
xades.Application.setEngine("Node.js", cryptoEngine);
xades.setNodeDependencies({ DOMParser, XMLSerializer, DOMImplementation, xpath });

export class KsefTestError extends Error {
  status: number; retryAfter: number;
  constructor(message: string, status = 502, retryAfter = 0) { super(message); this.status = status; this.retryAfter = retryAfter; }
}
export const sha256 = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("base64");
export function referencePath(value: string) {
  if (!/^[A-Z0-9-]{10,100}$/.test(value)) throw new KsefTestError("Nieprawidłowa referencja MF TEST.");
  return value;
}
function apiMessage(raw: string, status: number) {
  // MF validation details are useful; never include bearer tokens in diagnostics.
  let details = "";
  try {
    const value = JSON.parse(raw);
    details = [value.title, value.detail, ...(value.errors ?? []).map((e: { code?: number; description?: string; details?: string[] }) => [e.code, e.description, ...(e.details ?? [])].join(" ")), ...(value.exception?.exceptionDetailList ?? []).map((e: { exceptionCode?: number; exceptionDescription?: string; details?: string[] }) => [e.exceptionCode, e.exceptionDescription, ...(e.details ?? [])].join(" "))].filter(Boolean).join(" ");
  } catch { /* HTML, infrastructure and non-JSON errors are not displayed. */ }
  return (`MF TEST: HTTP ${status}. ${details}`).replace(/eyJ[A-Za-z0-9_.-]+/g, "[ukryto token]").slice(0, 1400);
}
export async function testRequest(path: string, options: { method?: string; token?: string; body?: unknown; xml?: string; fetcher?: typeof fetch; deadline?: number } = {}) {
  if (!/^\/[a-z0-9/?=&_-]+$/i.test(path) || path.includes("..") || path.includes("//")) throw new KsefTestError("Niedozwolony adres API TEST.");
  const remaining = (options.deadline ?? Date.now() + 12000) - Date.now();
  if (remaining < 500) throw new KsefTestError("Kończy się czas operacji. Sprawdź zapisany status faktury TEST.", 504);
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(TEST_API + path, {
      method: options.method ?? "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(Math.min(12000, remaining)),
      headers: { Accept: "application/json, application/xml", "X-Error-Format": "problem-details", ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}), ...(options.xml ? { "Content-Type": "application/xml" } : options.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: options.xml ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    });
  } catch { throw new KsefTestError("Nie ustalono odpowiedzi MF TEST. Sprawdź status przed ponowieniem wysyłki.", 504); }
  const text = await response.text();
  if (text.length > 2_000_000) throw new KsefTestError("Odpowiedź MF TEST przekracza limit rozmiaru.");
  if (!response.ok) throw new KsefTestError(apiMessage(text, response.status), response.status, Math.min(300, Math.max(1, Number(response.headers.get("retry-after")) || 10)));
  return { response, text, data: text && response.headers.get("content-type")?.includes("json") ? JSON.parse(text) : null };
}

export async function signedTestChallenge(nip: string, challenge: string) {
  if (!/^\d{10}$/.test(nip) || !/^[A-Z0-9-]{10,100}$/.test(challenge)) throw new KsefTestError("Nieprawidłowa tożsamość lub wyzwanie TEST.");
  const alg = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) };
  const keys = await cryptoEngine.subtle.generateKey(alg, false, ["sign", "verify"]);
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: randomBytes(16).toString("hex"), name: `2.5.4.3=Fikcyjny Testowy Ewidora TEST,2.5.4.42=Fikcyjny,2.5.4.4=Testowy,2.5.4.5=TINPL-${nip},2.5.4.6=PL`,
    notBefore: new Date(Date.now() - 300_000), notAfter: new Date(Date.now() + 86_400_000), signingAlgorithm: alg, keys,
    extensions: [new x509.BasicConstraintsExtension(false, undefined, true), new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.nonRepudiation, true)],
  });
  const base64 = cert.toString("base64");
  const doc = xades.Parse(`<AuthTokenRequest xmlns="http://ksef.mf.gov.pl/auth/token/2.0"><Challenge>${challenge}</Challenge><ContextIdentifier><Nip>${nip}</Nip></ContextIdentifier><SubjectIdentifierType>certificateSubject</SubjectIdentifierType></AuthTokenRequest>`);
  const signature = new xades.SignedXml();
  await signature.Sign({ name: alg.name }, keys.privateKey, doc, { x509: [base64], signingCertificate: base64, references: [{ uri: "", hash: "SHA-256", transforms: ["enveloped", "exc-c14n"] }] });
  return signature.toString();
}

export type TestConnection = { request: (path: string, options?: { method?: string; body?: unknown }) => ReturnType<typeof testRequest>; dispose?: () => Promise<void> };
export async function authenticateTest(nip: string): Promise<TestConnection> {
  const deadline = Date.now() + 45000;
  const challenge = (await testRequest("/auth/challenge", { method: "POST", deadline })).data;
  const xml = await signedTestChallenge(nip, challenge.challenge);
  const init = (await testRequest("/auth/xades-signature?verifyCertificateChain=false", { method: "POST", xml, deadline })).data;
  const reference = referencePath(init.referenceNumber);
  for (let i = 0; i < 10; i++) {
    const result = (await testRequest(`/auth/${reference}`, { token: init.authenticationToken.token, deadline })).data;
    if (result.status.code === 200) {
      const tokens = (await testRequest("/auth/token/redeem", { method: "POST", token: init.authenticationToken.token, deadline })).data;
      const token: string = tokens.accessToken.token;
      return { request: (path, options = {}) => testRequest(path, { ...options, token, deadline }), dispose: async () => { await testRequest("/auth/sessions/current", { method: "DELETE", token, deadline: Date.now() + 3000 }); } };
    }
    if (result.status.code >= 400) throw new KsefTestError(`MF TEST odrzuciło uwierzytelnienie (${result.status.code}): ${String(result.status.description).slice(0, 300)}`);
    await delay(600);
  }
  throw new KsefTestError("MF TEST nadal przetwarza uwierzytelnienie. Spróbuj po chwili.", 503);
}

export async function encryptedTestInvoice(connection: TestConnection, xml: string) {
  const certificates = (await connection.request("/security/public-key-certificates")).data as { certificate: string; publicKeyId: string; validFrom: string; validTo: string; usage: string[] }[];
  const selected = certificates.find(c => c.usage.includes("SymmetricKeyEncryption") && Date.parse(c.validFrom) <= Date.now() && Date.parse(c.validTo) > Date.now() + 60_000);
  if (!selected) throw new KsefTestError("Brak ważnego klucza MF TEST do szyfrowania faktury.");
  const cert = new X509Certificate(Buffer.from(selected.certificate, "base64"));
  if (cert.publicKey.asymmetricKeyType !== "rsa" || Date.parse(cert.validTo) <= Date.now()) throw new KsefTestError("Nieprawidłowy certyfikat szyfrujący MF TEST.");
  const key = randomBytes(32), iv = randomBytes(16), cipher = createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(xml, "utf8"), cipher.final()]);
  const encryptedKey = publicEncrypt({ key: cert.publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, key);
  key.fill(0);
  return { encryption: { encryptedSymmetricKey: encryptedKey.toString("base64"), initializationVector: iv.toString("base64"), publicKeyId: selected.publicKeyId },
    invoice: { invoiceHash: sha256(xml), invoiceSize: Buffer.byteLength(xml, "utf8"), encryptedInvoiceHash: sha256(encrypted), encryptedInvoiceSize: encrypted.length, encryptedInvoiceContent: encrypted.toString("base64"), offlineMode: false } };
}
