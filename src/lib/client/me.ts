import { AUTH_EVENT } from "@/components/ui/Toast/flash";

/**
 * Who is signed in, asked of the server at most once per 30 s per browser tab and shared by every caller (header, mobile menu, product-view recorder).
 * Concurrent callers share one in-flight request; a failure is never remembered; signing in or out (AUTH_EVENT) forgets the answer, and `force` skips it
 * (used when a page is restored from the back/forward cache). The answer is only a display hint: every page and API still checks the session on the server.
 */
export interface Me {
  name: string;
  role: "buyer" | "supplier";
}

const FRESH_MS = 30_000;
let current: { at: number; promise: Promise<Me | null> } | null = null;

export function fetchMe(force = false): Promise<Me | null> {
  if (!force && current && Date.now() - current.at < FRESH_MS) return current.promise;
  const promise = fetch("/api/auth/me", { cache: "no-store" }).then(async (response) => {
    if (!response.ok) throw new Error("unavailable");
    return ((await response.json()).user ?? null) as Me | null;
  });
  const entry = { at: Date.now(), promise };
  current = entry;
  promise.catch(() => {
    if (current === entry) current = null;
  });
  return promise;
}

if (typeof window !== "undefined") window.addEventListener(AUTH_EVENT, () => { current = null; });
