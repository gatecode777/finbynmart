import { parsePercent } from "@/lib/quotations/decimal";
import type { TaxRule } from "@/lib/quotations/quoteRules";

/**
 * The tax treatments a supplier may select on a quotation. Server-only.
 *
 * There is NO built-in rate: no GST rate, exemption, HSN/SAC rule, place-of-supply logic or CGST/SGST/IGST split exists in this code. The platform
 * configures the approved treatments in the environment variable QUOTATION_TAX_RULES, a JSON array such as
 *   [{"id":"gst-18","version":"2026-04","label":"GST 18%","kind":"RATE","ratePercent":"18"},
 *    {"id":"exempt","version":"1","label":"Exempt","kind":"EXEMPT"}]
 * kind RATE needs ratePercent (0-100, 2 decimals); EXEMPT and NOT_APPLICABLE are explicit zero treatments. The id and version of the selected rule are stored
 * on every submitted quotation. With nothing configured (the default) drafts still work but submission is BLOCKED with a clear message.
 * A malformed entry is ignored and logged by position (never its content), so one typo cannot silently become a wrong rate.
 */
let cache: { raw: string | undefined; rules: TaxRule[] } | undefined;

export function getTaxRules(): TaxRule[] {
  const raw = process.env.QUOTATION_TAX_RULES;
  if (cache && cache.raw === raw) return cache.rules;
  const rules: TaxRule[] = [];
  if (raw && raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [];
      list.slice(0, 50).forEach((entry, index) => {
        const e = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
        const id = typeof e.id === "string" && /^[A-Za-z0-9_.-]{1,60}$/.test(e.id) ? e.id : null;
        const version = typeof e.version === "string" && /^[A-Za-z0-9_.-]{1,20}$/.test(e.version) ? e.version : null;
        const label = typeof e.label === "string" && e.label.trim().length > 0 && e.label.length <= 40 ? e.label.trim() : null;
        const kind = e.kind === "RATE" || e.kind === "EXEMPT" || e.kind === "NOT_APPLICABLE" ? e.kind : null;
        let bp: number | null = null;
        let valid = Boolean(id && version && label && kind) && !rules.some((r) => r.id === id);
        if (valid && kind === "RATE") {
          const p = parsePercent(e.ratePercent);
          if (p.ok) bp = p.value;
          else valid = false;
        }
        if (valid && id && version && label && kind) rules.push({ id, version, label, kind, bp });
        else console.error(`QUOTATION_TAX_RULES entry ${index} ignored: it is not a valid rule`);
      });
    } catch {
      console.error("QUOTATION_TAX_RULES is not valid JSON: no tax rule is available");
    }
  }
  cache = { raw, rules };
  return rules;
}

export const getTaxRule = (id: string): TaxRule | null => getTaxRules().find((r) => r.id === id) ?? null;
