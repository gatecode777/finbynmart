import type { TokenState } from "./tokens";

/** What the public sees for each token state. ACCOUNT_UNAVAILABLE is shown as INVALID so a link never reveals anything about the account. */
export type PublicTokenState = Exclude<TokenState, "ACCOUNT_UNAVAILABLE">;

export const toPublicState = (state: TokenState): PublicTokenState => (state === "ACCOUNT_UNAVAILABLE" ? "INVALID" : state);

export const RESET_MESSAGES: Record<PublicTokenState, string> = {
  VALID: "",
  INVALID: "This password reset link is invalid. Please request a new link.",
  EXPIRED: "This password reset link has expired. Request a new link to continue.",
  ALREADY_USED: "This password reset link has already been used. Please sign in or request a new link.",
  REVOKED: "This password reset link was replaced by a newer one. Use the latest email, or request a new link.",
};

/** Where a person goes after a reset. Decided from the stored account role, never from the request. */
export const LOGIN_PATH = { buyer: "/login/buyer", supplier: "/login/supplier" } as const;
