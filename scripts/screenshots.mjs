// Captures the public demo (no Supabase configuration) for review and the README.
// Usage: BASE_URL=http://127.0.0.1:3000 OUT=docs/screenshots node scripts/screenshots.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const base = process.env.BASE_URL ?? "http://127.0.0.1:3000", out = process.env.OUT ?? "docs/screenshots";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
async function session(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "pl-PL", timezoneId: "Europe/Warsaw" });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  await page.goto(base + "/", { waitUntil: "networkidle" });
  return { context, page };
}
const nav = (page, name) => page.locator("nav").getByRole("button", { name, exact: true }).first().click();
const shot = async (page, name, options = {}) => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${name}.png`, ...options }); console.log("saved", name); };
const step = async (label, fn) => { try { await fn(); } catch (error) { errors.push(`${label}: ${error.message.split("\n")[0]}`); } };

const { context, page } = await session({ width: 1440, height: 900 });
await step("dashboard", () => shot(page, "01-pulpit-jdg", { fullPage: true }));
await step("settlement", async () => { await nav(page, "Rozlicz miesiąc"); await shot(page, "02-rozlicz-miesiac-wrzesien", { fullPage: true }); });
await step("settlement-october", async () => { await page.getByLabel("Miesiąc rozliczenia").selectOption("10"); await shot(page, "03-rozlicz-miesiac-pazdziernik", { fullPage: true }); });
await step("open-document", async () => { await page.getByRole("button", { name: /^Otwórz/ }).first().click(); await page.locator("dialog[open]").waitFor(); await shot(page, "04-ocena-dokumentu"); await page.keyboard.press("Escape"); });
await step("invoices", async () => { await nav(page, "Faktury JDG"); await shot(page, "05-faktury"); });
await step("new-invoice", async () => { await page.getByRole("button", { name: "Nowa faktura" }).click(); await page.locator("dialog[open]").waitFor(); await page.locator("dialog[open] select").filter({ hasText: "wybierz faktycznie wykonaną czynność" }).first().selectOption("p2a-c"); await shot(page, "06-nowa-faktura-ryczalt"); await page.keyboard.press("Escape"); });
await step("tax", async () => { await nav(page, "PIT i VAT"); await shot(page, "07-pit-i-vat", { fullPage: true }); });
await step("dn-demo", async () => { await page.getByRole("button", { name: "Demo DN" }).click(); await shot(page, "08-demo-dn"); });
await context.close();

const mobile = await session({ width: 390, height: 844 });
await step("mobile", () => shot(mobile.page, "09-mobile-pulpit", { fullPage: true }));
await step("mobile-settlement", async () => { await mobile.page.getByRole("button", { name: "Otwórz menu" }).click(); await nav(mobile.page, "Rozlicz miesiąc"); await shot(mobile.page, "10-mobile-rozlicz", { fullPage: true }); });
await mobile.context.close();
await browser.close();
console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no browser errors");
