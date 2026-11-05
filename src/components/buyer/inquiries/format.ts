/** Display helpers of the My Inquiries list. Dates are the stored UTC timestamps shown in India time (the platform's one timezone). */
export function formatDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} ${get("dayPeriod")}`;
}

/** "5,000 Meter"; a missing quantity is "Not Specified", never 0. */
export function formatQuantity(quantity: number | null | undefined, unit: string | null): string {
  if (!quantity || quantity < 1) return "Not Specified";
  return `${quantity.toLocaleString("en-IN")}${unit ? ` ${unit}` : ""}`;
}
