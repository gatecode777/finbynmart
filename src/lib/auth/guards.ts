import { NextResponse } from "next/server";
import { getAdminPermissions, type AdminCapability } from "@/lib/admin/permissions";
import { redirect } from "next/navigation";
import { getCurrentUser } from "./session";
import type { PublicUser } from "./users";
import { resolveSupplierContext, type SupplierContext } from "@/lib/supplier/company";

/**
 * Portal access control (owner decision, CLAUDE.md section L). The identity ALWAYS comes from the verified session cookie and the account
 * must be ACTIVE (getCurrentUser returns nothing for a suspended account or a revoked session). A request body, query string or header
 * never names the user, the role or the company.
 *
 * Pages (browser navigation): an anonymous visitor is sent to sign-in; an authenticated user in the WRONG portal is redirected to
 * /forbidden?portal=... BEFORE any protected data is read. APIs: 401 when anonymous, a real HTTP 403 with a safe JSON error when the role
 * or company is wrong. Hidden navigation is never protection; every service still scopes its queries.
 */
const NO_STORE = { "Cache-Control": "private, no-store" };
const FORBIDDEN_MESSAGE = "You do not have permission to access this resource.";

/** The safe 403 body: no role, company or internal detail. `ok` and `message` are kept for the older clients of this project's APIs. */
export const forbiddenResponse = () =>
  NextResponse.json({ success: false, ok: false, message: FORBIDDEN_MESSAGE, error: { code: "FORBIDDEN", message: FORBIDDEN_MESSAGE } }, { status: 403, headers: NO_STORE });

const unauthorizedResponse = () => NextResponse.json({ ok: false, message: "Sign in to continue." }, { status: 401, headers: NO_STORE });

const signInPath = (nextPath: string) => `/sign-in?next=${encodeURIComponent(nextPath)}`;

/**
 * Buyer-only page access. Anonymous → sign-in. A signed-in non-buyer → /forbidden?portal=buyer (never a 200 notice on the buyer URL).
 * The "NOT_A_BUYER" member of the return type is kept only so older callers still compile; it is never returned (the redirect throws first).
 */
export async function requireBuyerPage(nextPath: string): Promise<PublicUser | "NOT_A_BUYER"> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect(signInPath(nextPath));
  if (user.role !== "buyer") redirect("/forbidden?portal=buyer");
  return user;
}

export async function requireBuyerApi(): Promise<{ user: PublicUser } | { response: NextResponse }> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return { response: unauthorizedResponse() };
  if (user.role !== "buyer") return { response: forbiddenResponse() };
  return { user };
}

/**
 * Supplier-only page access. The company is resolved from the session's own account (one login per company today: the owner), never from
 * the request. A signed-in non-supplier, or a supplier whose company is not active, → /forbidden?portal=supplier.
 */
export async function requireSupplierPage(nextPath: string, opts: { allowSuspended?: boolean } = {}): Promise<{ user: PublicUser; context: SupplierContext }> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect(signInPath(nextPath));
  if (user.role !== "supplier") redirect("/forbidden?portal=supplier");
  const context = await resolveSupplierContext(user.id).catch(() => null);
  // a SUSPENDED company is refused everywhere except the pages that opt in (support and account security); an unknown company is refused everywhere
  if (!context || (context.company.status !== "ACTIVE" && !(opts.allowSuspended && context.company.status === "SUSPENDED"))) redirect("/forbidden?portal=supplier");
  return { user, context };
}

export async function requireSupplierApi(): Promise<{ user: PublicUser; context: SupplierContext } | { response: NextResponse }> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return { response: unauthorizedResponse() };
  if (user.role !== "supplier") return { response: forbiddenResponse() };
  const context = await resolveSupplierContext(user.id).catch(() => null);
  if (!context || context.company.status !== "ACTIVE") return { response: forbiddenResponse() };
  return { user, context };
}

/**
 * Support-ticket APIs: the ticket services scope every query to the signed-in account (reference AND that account), so both a buyer and a
 * supplier whose company is active may use them for their OWN tickets. Any other role is refused with 403.
 */
export async function requireSupportApi(): Promise<{ user: PublicUser } | { response: NextResponse }> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return { response: unauthorizedResponse() };
  if (user.role === "buyer") return { user };
  if (user.role === "supplier") {
    const context = await resolveSupplierContext(user.id).catch(() => null);
    // support and account security stay available to the owner of a suspended company (personal access, not company business)
    if (context && (context.company.status === "ACTIVE" || context.company.status === "SUSPENDED")) return { user };
  }
  return { response: forbiddenResponse() };
}

/**
 * Admin access (page and API). The role and the capability come from the account record on the server (`getAdminPermissions`), never from the
 * request. Anonymous → sign-in; a signed-in non-admin or an admin without the capability → /forbidden?portal=admin (pages) or 403 JSON (APIs).
 */
export async function requireAdminPage(nextPath: string, capability: AdminCapability): Promise<{ user: PublicUser; permissions: AdminCapability[] }> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect(signInPath(nextPath));
  const permissions = user.role === "admin" ? await getAdminPermissions(user.id).catch(() => []) : [];
  if (!permissions.includes(capability)) redirect("/forbidden?portal=admin");
  return { user, permissions };
}

export async function requireAdminApi(capability: AdminCapability): Promise<{ user: PublicUser; permissions: AdminCapability[] } | { response: NextResponse }> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return { response: unauthorizedResponse() };
  const permissions = user.role === "admin" ? await getAdminPermissions(user.id).catch(() => []) : [];
  if (!permissions.includes(capability)) return { response: forbiddenResponse() };
  return { user, permissions };
}

/**
 * Page access for an administrator who holds AT LEAST ONE of the listed capabilities (for example a reports page whose individual report types have their own capability). Redirects exactly like
 * requireAdminPage; the page then offers only the part its permissions cover.
 */
export async function requireAnyAdminPage(nextPath: string, capabilities: readonly AdminCapability[]): Promise<{ user: PublicUser; permissions: AdminCapability[] }> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect(signInPath(nextPath));
  const permissions = user.role === "admin" ? await getAdminPermissions(user.id).catch(() => []) : [];
  if (!capabilities.some((c) => permissions.includes(c))) redirect("/forbidden?portal=admin");
  return { user, permissions };
}

/** API twin of requireAnyAdminPage: 401 when anonymous, 403 when none of the capabilities is held. */
export async function requireAnyAdminApi(capabilities: readonly AdminCapability[]): Promise<{ user: PublicUser; permissions: AdminCapability[] } | { response: NextResponse }> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return { response: unauthorizedResponse() };
  const permissions = user.role === "admin" ? await getAdminPermissions(user.id).catch(() => []) : [];
  if (!capabilities.some((c) => permissions.includes(c))) return { response: forbiddenResponse() };
  return { user, permissions };
}
