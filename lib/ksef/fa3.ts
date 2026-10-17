import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateXML } from "xmllint-wasm";
import { testInvoiceInput, testTotals, syntheticBuyerNip } from "./test-model.ts";
import type { TestInvoiceInput } from "./test-model.ts";
import { validNip } from "../domain.ts";
export const FA3_NAMESPACE = "http://crd.gov.pl/wzor/2025/06/25/13775/";
const escape = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const amount = (v: number) => (v / 100).toFixed(2);
const element = (name: string, value: string | number) => `<${name}>${escape(String(value))}</${name}>`;
export function buildTestInvoice(id: string, nip: string, raw: TestInvoiceInput, createdAt: string) {
  if (!validNip(nip) || !/^\d{10}$/.test(nip) || !/^[a-f0-9-]{36}$/i.test(id) || !Number.isFinite(Date.parse(createdAt))) throw new Error("Nieprawidłowe dane laboratorium TEST.");
  const input = testInvoiceInput.parse(raw), totals = testTotals(input);
  const number = `TEST/${input.issueDate.slice(0, 4)}/${id.replace(/-/g, "").toUpperCase()}`;
  const buyerNip = syntheticBuyerNip(id, nip);
  const identity = (n: string, name: string) => `<DaneIdentyfikacyjne>${element("NIP", n)}${element("Nazwa", name)}</DaneIdentyfikacyjne><Adres><KodKraju>PL</KodKraju><AdresL1>ul. Fikcyjna 1, 00-001 Miasto Testowe</AdresL1></Adres>`;
  const summaries = (["23", "8", "5", "0", "zw"] as const).map(rate => {
    const lines = totals.lines.filter(line => line.vatRate === rate); if (!lines.length) return "";
    const net = amount(lines.reduce((s, l) => s + l.net, 0)), vat = amount(lines.reduce((s, l) => s + l.vat, 0));
    return rate === "0" ? element("P_13_6_1", net) : rate === "zw" ? element("P_13_7", net) : element(`P_13_${{ "23": 1, "8": 2, "5": 3 }[rate]}`, net) + element(`P_14_${{ "23": 1, "8": 2, "5": 3 }[rate]}`, vat);
  }).join("");
  const exemption = input.lines.some(l => l.vatRate === "zw") ? "<P_19>1</P_19><P_19A>Art. 113 ust. 1 ustawy o VAT — fikcyjny przykład TEST</P_19A>" : "<P_19N>1</P_19N>";
  const lines = totals.lines.map((line, i) => `<FaWiersz>${element("NrWierszaFa", i + 1)}${element("P_7", "TEST: " + line.name)}${element("P_8A", line.unit)}${element("P_8B", (line.quantityMilli / 1000).toFixed(3))}${element("P_9A", amount(line.unitPrice))}${element("P_11", amount(line.net))}${element("P_12", line.vatRate === "0" ? "0 KR" : line.vatRate)}</FaWiersz>`).join("");
  const xml = `<?xml version="1.0" encoding="utf-8"?><Faktura xmlns="${FA3_NAMESPACE}"><Naglowek><KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza><WariantFormularza>3</WariantFormularza>${element("DataWytworzeniaFa", createdAt)}<SystemInfo>Ewidora — wyłącznie KSeF TEST</SystemInfo></Naglowek><Podmiot1>${identity(nip, "Fikcyjny Testowy — JDG Ewidora TEST")}</Podmiot1><Podmiot2>${identity(buyerNip, "Fikcyjny odbiorca TEST")}<JST>2</JST><GV>2</GV></Podmiot2><Fa><KodWaluty>PLN</KodWaluty>${element("P_1", input.issueDate)}${element("P_2", number)}${summaries}${element("P_15", amount(totals.gross))}<Adnotacje><P_16>2</P_16><P_17>2</P_17><P_18>2</P_18><P_18A>2</P_18A><Zwolnienie>${exemption}</Zwolnienie><NoweSrodkiTransportu><P_22N>1</P_22N></NoweSrodkiTransportu><P_23>2</P_23><PMarzy><P_PMarzyN>1</P_PMarzyN></PMarzy></Adnotacje><RodzajFaktury>VAT</RodzajFaktury>${lines}</Fa></Faktura>`;
  return { xml, input, number, buyerNip, net: totals.net, vat: totals.vat, gross: totals.gross };
}
export async function validateTestXml(xml: string) {
  if (Buffer.byteLength(xml) > 300000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Niedozwolona zawartość XML.");
  const names = ["schemat.xsd", "StrukturyDanych_v10-0E.xsd", "ElementarneTypyDanych_v10-0E.xsd", "KodyKrajow_v10-0E.xsd"];
  const files = await Promise.all(names.map(async fileName => ({ fileName, contents: await readFile(join(process.cwd(), "lib/ksef/schemas", fileName), "utf8") })));
  const result = await validateXML({ xml: [{ fileName: "faktura-test.xml", contents: xml }], schema: [files[0]], preload: files.slice(1), initialMemoryPages: 256, maxMemoryPages: 1024 });
  if (!result.valid) throw new Error("XML FA(3): " + result.errors.map(e => e.message).join(" ").slice(0, 1500));
}
