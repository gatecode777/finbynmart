const DATE = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const SHORT = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/** India-time date, the dashboard's one timezone. */
export const formatDate = (iso: string) => DATE.format(new Date(iso));
export const formatShortDate = (iso: string) => SHORT.format(new Date(iso));
export const formatCount = (n: number) => new Intl.NumberFormat("en-IN").format(n);

/** Up to two initials for an avatar ("Rahul Kumawat" is "RK"). */
export const initialsOf = (name: string) =>
  name
    .split(/s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "B";
