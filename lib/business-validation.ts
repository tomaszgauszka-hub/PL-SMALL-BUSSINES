import { z } from "zod";
import { validDate, today } from "./domain.ts";
import { VAT_RATES, LUMP_SUM_RATES } from "./business.ts";
const text = (max: number) => z.string().trim().max(max);
const date = z.string().refine(validDate, "Wpisz prawidłową datę.").refine(d => d >= "1900-01-01" && d <= "2026-12-31", "Sprawdź historyczną datę rozpoczęcia.");
export const businessTypeInput = z.enum(["dn", "jdg"]);
export const businessProfileInput = z.object({ businessType: businessTypeInput, jdgStartDate: z.union([date, z.literal("")]), taxForm: z.enum(["scale", "linear", "lump_sum"]), vatStatus: z.enum(["exempt", "active"]), vatStartDate: z.union([date, z.literal("")]), exemptionBasis: text(300), confirmTransition: z.boolean().default(false), version: z.number().int().nonnegative() }).superRefine((p, ctx) => {
  if (p.businessType === "dn" && (p.taxForm !== "scale" || p.vatStatus !== "exempt")) ctx.addIssue({ code: "custom", message: "Obecna ewidencja DN obsługuje skalę i zwolnienie z VAT." });
  if (p.businessType === "jdg" && (!p.jdgStartDate || p.jdgStartDate > today())) ctx.addIssue({ code: "custom", message: "Podaj datę rozpoczęcia JDG, nie późniejszą niż dziś." });
  if (p.vatStatus === "active" && !p.vatStartDate) ctx.addIssue({ code: "custom", message: "Podaj datę rozpoczęcia rozliczania VAT." });
});
export const catalogItemInput = z.object({ id: z.string().uuid(), name: text(160).min(1, "Wpisz nazwę produktu lub usługi."), kind: z.enum(["product", "service"]), sku: text(60), unit: text(30).min(1), unitPrice: z.number().int().min(0).max(99999999999), vatRate: z.enum(VAT_RATES as [string, ...string[]]), lumpSumRate: z.number().int().refine(n => LUMP_SUM_RATES.some(rate => Math.round(rate * 100) === n), "Nieobsługiwana stawka ryczałtu."), description: text(1500), archived: z.boolean(), version: z.number().int().nonnegative() });
export const businessMutationInput = z.object({ opId: z.string().uuid(), action: z.enum(["register", "profile", "product"]), data: z.unknown() });
