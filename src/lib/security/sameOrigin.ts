/**
 * Extra protection for requests that change security state (ending a session, acknowledging an alert) on top of the SameSite=Lax session
 * cookie: a request that the browser itself marks as coming from another site, or whose Origin is not this site, is refused. A request with
 * neither header (a command-line client, a server-side call) is allowed: it cannot be forged from another site's page.
 */
export function isCrossSiteWrite(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== (request.headers.get("host") ?? new URL(request.url).host);
  } catch {
    return true;
  }
}
