/**
 * The ONE safe return-destination rule of the site (client-safe, no server imports). `safeReturnPath` turns an untrusted value into a normalized same-site path or null. It is applied when a
 * destination is received (/unauthorized, /sign-in), when it is sent to the sign-in API, and again at the final post-login redirect (`resolvePostLoginPath`). The result never grants anything: the
 * destination still enforces session, role and ownership itself.
 *
 * Rejected: not a string, empty, over 300 characters, control characters, backslashes, anything that does not start with a single "/", protocol-relative "//", any value that DECODES (up to twice)
 * to one of those, a parse that leaves the site origin, authentication and recovery pages (a redirect loop), /unauthorized, /forbidden and /api/. Accepted: the parsed, dot-segment-normalized
 * path plus its query string, limited to the characters the site's own routes use.
 */
export const RETURN_MAX = 300;
const ORIGIN = "https://finbyn-mart.invalid";
const ALLOWED = /^\/[A-Za-z0-9\-._~/%?=&]*$/;
const SENSITIVE_PARAM = /token|passw|secret|credential|session|auth|api[-_]?key|otp|^code$|^key$|^sid$/i;
const BAD =/[\u0000-\u001f\u007f\\]/;
/** Pages a visitor must never be "returned" to (they are the sign-in journey itself, or the recovery pages). */
const LOOP_PATHS = ["/unauthorized", "/maintenance", "/forbidden", "/sign-in", "/sign-up", "/login", "/register", "/register-supplier", "/forgot-password", "/reset-password", "/password-reset", "/verify-email"] as const;

export function safeReturnPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > RETURN_MAX) return null;
  if (BAD.test(raw) || !raw.startsWith("/") || raw.startsWith("//")) return null;
  // the RAW value must already use only the characters the site's routes use: parsing must never "repair" a space, markup or a fragment into an accepted path
  if (!ALLOWED.test(raw)) return null;
  // an encoded bypass ("/%2F%2Fevil.example", "/%5Cevil.example", double encoding) is judged by what it decodes to
  let cur = raw;
  for (let i = 0; i < 2; i++) {
    let dec: string;
    try { dec = decodeURIComponent(cur); } catch { return null; }
    if (dec === cur) break;
    if (BAD.test(dec) || dec.startsWith("//") || /^\/\s*[\\/]/.test(dec)) return null;
    cur = dec;
  }
  let url: URL;
  try { url = new URL(raw, ORIGIN); } catch { return null; }
  if (url.origin !== ORIGIN) return null;
  let path: string;
  try { path = decodeURIComponent(url.pathname).toLowerCase(); } catch { return null; }
  if (path === "/api" || path.startsWith("/api/") || LOOP_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) return null;
  // credentials and one-time values never travel in a return URL: parameters with such names are dropped (the rest of the query keeps its original encoding)
  const kept = url.search.replace(/^\?/, "").split("&").filter((pair) => { if (!pair) return false; let name = pair.split("=")[0]; try { name = decodeURIComponent(name); } catch { /* keep the raw name */ } return !SENSITIVE_PARAM.test(name); });
  const out = url.pathname + (kept.length ? `?${kept.join("&")}` : "");
  if (out.length > RETURN_MAX || !/^\/[A-Za-z0-9\-._~/%?=&]*$/.test(out)) return null;
  return out;
}

/** `/sign-in?next=<validated path>` (or plain `/sign-in` when there is no safe destination). */
export function signInHref(next: unknown): string {
  const safe = safeReturnPath(next);
  return safe ? `/sign-in?next=${encodeURIComponent(safe)}` : "/sign-in";
}
