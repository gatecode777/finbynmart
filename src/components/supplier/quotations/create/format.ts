import { formatDecimal, parseMoney } from "@/lib/quotations/decimal";
import { formatMoney } from "@/lib/quotations/money";

/** "61500.00" -> "₹61,500.00" (integer text arithmetic: the decimal string is turned into whole minor units, never a float). null -> an em dash. */
export const showMoney = (decimal: string | null | undefined, currency: string): string => (decimal ? formatMoney(Number(decimal.replace(".", "")), currency) : "—");

/** An amount as typed ("120", "120.5") shown with two decimals; anything that is not a valid amount shows an em dash. */
export const showEntered = (text: string | null | undefined, currency: string): string => {
  if (!text) return "—";
  const p = parseMoney(text);
  return p.ok ? showMoney(formatDecimal(p.value), currency) : "—";
};

export const fieldId = (key: string) => `f-${key.replace(/\./g, "-")}`;
