/** A fresh key for one intended action (16 to 64 letters, digits, - or _). It is kept for retries of the SAME content so a lost response can be retried safely, and replaced when the content changes. */
export const newIdempotencyKey = (): string =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`).slice(0, 40).padEnd(16, "0");
