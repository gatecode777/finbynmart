import { safeReturnPath } from "./safeReturn";
/**
 * Which portal a role belongs to and where it lands after signing in. Client-safe and pure: the server uses it to decide the redirect
 * (the login route returns the resolved path), the browser only follows it. Access itself is never decided here: every portal route
 * and API still checks the verified session on the server.
 *
 * Portals: PUBLIC (the marketplace site and its sign-in/registration pages), BUYER (`/buyer/*`), SUPPLIER (`/supplier/*`), ADMIN
 * (`/admin/*` and `/super-admin/*`, with their own authorization; neither exists yet).
 */
export type Portal = "PUBLIC" | "BUYER" | "SUPPLIER" | "ADMIN";
export type AccountRole = "buyer" | "supplier" | "admin";

/**
 * The supplier portal (Page 39 onward) is built.
 */
export const SUPPLIER_PORTAL_AVAILABLE = true;

export function portalOfPath(path: string): Portal {
  const clean = path.split(/[?#]/)[0];
  const under = (base: string) => clean === base || clean.startsWith(`${base}/`);
  if (under("/buyer")) return "BUYER";
  if (under("/supplier")) return "SUPPLIER";
  if (under("/admin") || under("/super-admin")) return "ADMIN";
  return "PUBLIC";
}

/** The home page of the role's own portal. */
export function portalHome(role: AccountRole): string {
  if (role === "buyer") return "/buyer/dashboard";
  if (role === "admin") return "/admin/dashboard";
  return SUPPLIER_PORTAL_AVAILABLE ? "/supplier/dashboard" : "/";
}

const OWN_PORTAL: Record<AccountRole, Portal> = { buyer: "BUYER", supplier: "SUPPLIER", admin: "ADMIN" };

/**
 * Where to go after a successful sign-in or registration. The role's portal home, unless the visitor was heading somewhere they may
 * legitimately go: a public page or a page of their OWN portal (a buyer is never sent to a supplier page, or the reverse).
 * `next` must already be a same-site path (see `safeNext`); anything else is ignored.
 */
export function resolvePostLoginPath(role: AccountRole, next: string | null | undefined): string {
  const home = portalHome(role);
  // the destination is validated again here, at the final redirect, whatever the caller already did
  const safe = safeReturnPath(next);
  if (!safe || safe === "/") return home;
  next = safe;
  const portal = portalOfPath(next);
  // a page of the role's own portal is kept only if that portal exists (a supplier is never sent to a /supplier page that would 404)
  if (portal === OWN_PORTAL[role]) return role === "supplier" && !SUPPLIER_PORTAL_AVAILABLE ? home : next;
  if (portal === "PUBLIC") return next;
  return home;
}
