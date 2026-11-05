/**
 * Client-side helpers for the shared toast. A "flash" is a short message that must survive one navigation (for example the
 * confirmation after signing in, which happens on a form that is about to be replaced): it is kept in sessionStorage for a few
 * seconds and shown once by <ToastHost />. Only call these after the server confirmed the action (no optimistic success).
 */
export type ToastKind = "success" | "error" | "info";

export const FLASH_KEY = "finbyn.flash";
export const FLASH_EVENT = "finbyn:flash";
export const AUTH_EVENT = "finbyn:auth-changed";
/** A flash older than this is ignored (it belonged to a navigation that never happened). */
export const FLASH_MAX_AGE_MS = 15_000;

/**
 * `deferred: true` stores the message for the NEXT page load only (use it before a full reload such as `window.location.assign`):
 * without it the toast area of the current page shows it at once, and the reload would throw it away.
 */
export function flashToast(kind: ToastKind, text: string, options: { deferred?: boolean } = {}): void {
  try {
    window.sessionStorage.setItem(FLASH_KEY, JSON.stringify({ kind, text, at: Date.now() }));
  } catch {
    /* storage can be blocked: the action itself still worked, only the toast is lost */
  }
  if (!options.deferred) window.dispatchEvent(new Event(FLASH_EVENT));
}

/** Tells the header (and anything else that shows the account) to read the session again. */
export function announceAuthChange(): void {
  window.dispatchEvent(new Event(AUTH_EVENT));
}
