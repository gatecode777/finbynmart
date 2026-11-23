"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Package, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/Modal";
import { flashToast } from "@/components/ui/Toast";
import { AUTH_EVENT } from "@/components/ui/Toast/flash";
import { viewedLabel } from "@/lib/recentlyViewed/rules";
import type { RecentItem, RecentPage } from "@/lib/recentlyViewed/service";
import inquiries from "../inquiries/Inquiries.module.css";
import saved from "../saved/Saved.module.css";
import styles from "./Recent.module.css";

type Status = "ready" | "loading" | "error";

async function api(path: string, init?: RequestInit): Promise<{ ok: boolean; json: { data?: RecentPage } | null }> {
  try {
    const response = await fetch(path, { cache: "no-store", credentials: "same-origin", ...init });
    return { ok: response.ok, json: await response.json().catch(() => null) };
  } catch {
    return { ok: false, json: null };
  }
}

/**
 * The history list. Nothing here is optimistic: an entry leaves the list only after the server confirmed its removal, and Clear History empties it only after the server
 * confirmed that. A failed first load shows a Retry state, never an empty history. The data lives only in this component (no client cache), and it is dropped when the
 * signed-in account changes.
 */
export function RecentlyViewedWorkspace({ initial }: { initial: RecentPage | null }) {
  const [items, setItems] = useState<RecentItem[]>(initial?.items ?? []);
  const [cursor, setCursor] = useState<string | null>(initial?.nextCursor ?? null);
  const [status, setStatus] = useState<Status>(initial ? "ready" : "error");
  const [moreBusy, setMoreBusy] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  // synchronous guards: two clicks in the same tick must send one request (state updates are not visible until the next render)
  const busy = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    setStatus("loading");
    setAnnounce("Loading your recently viewed products.");
    const result = await api("/api/buyer/recently-viewed");
    if (!result.ok || !result.json?.data) { setStatus("error"); setAnnounce("We couldn't load your recently viewed products."); return; }
    setItems(result.json.data.items);
    setCursor(result.json.data.nextCursor);
    setStatus("ready");
    setAnnounce("");
  }, []);

  useEffect(() => {
    // another account on this browser must never briefly see this history
    const onAuth = () => { setItems([]); setCursor(null); setStatus("loading"); window.location.assign("/buyer/recently-viewed"); };
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_EVENT, onAuth);
  }, []);

  async function loadMore() {
    if (!cursor || moreBusy) return;
    setMoreBusy(true);
    const result = await api(`/api/buyer/recently-viewed?cursor=${encodeURIComponent(cursor)}`);
    setMoreBusy(false);
    if (!result.ok || !result.json?.data) { flashToast("error", "We couldn't load more products. Please try again."); return; }
    const page = result.json.data;
    setItems((current) => { const seen = new Set(current.map((i) => i.id)); return [...current, ...page.items.filter((i) => !seen.has(i.id))]; });
    setCursor(page.nextCursor);
  }

  async function remove(item: RecentItem) {
    if (busy.current.has(item.id)) return;
    busy.current.add(item.id);
    setPending((p) => new Set(p).add(item.id));
    setError(null);
    const result = await api(`/api/buyer/recently-viewed/${item.id}`, { method: "DELETE" });
    busy.current.delete(item.id);
    setPending((p) => { const n = new Set(p); n.delete(item.id); return n; });
    if (!result.ok) { setError("We couldn't remove that product from your history. It is still listed; please try again."); flashToast("error", "Removal failed. The product is still in your history."); return; }
    setItems((current) => current.filter((i) => i.id !== item.id));
    setAnnounce(`${item.name ?? "Product"} removed from your recently viewed products.`);
    flashToast("success", "Removed from your recently viewed products.");
    listRef.current?.focus();
  }

  async function clearAll() {
    if (busy.current.has("*")) return;
    busy.current.add("*");
    setClearing(true);
    setError(null);
    const result = await api("/api/buyer/recently-viewed", { method: "DELETE" });
    busy.current.delete("*");
    setClearing(false);
    setConfirmClear(false);
    if (!result.ok) { setError("We couldn't clear your history. Your products are still listed; please try again."); flashToast("error", "Clearing failed. Your history is unchanged."); return; }
    setItems([]); setCursor(null);
    setAnnounce("Your recently viewed history was cleared.");
    flashToast("success", "Recently viewed history cleared.");
    listRef.current?.focus();
  }

  return (
    <div ref={listRef} tabIndex={-1} aria-busy={status === "loading"}>
      <p className="visually-hidden" role="status" aria-live="polite">{announce}</p>
      {status === "error" ? (
        <div className={styles.panel} role="alert">
          <h2>We couldn&rsquo;t load your recently viewed products.</h2>
          <p>Nothing was changed.</p>
          <button type="button" className={styles.retry} onClick={load}>Retry</button>
        </div>
      ) : status === "loading" ? (
        <ul className={styles.list} aria-label="Loading your recently viewed products">
          {Array.from({ length: 6 }, (_, i) => <li key={i}><span className={styles.skeleton} /></li>)}
        </ul>
      ) : (
        <>
          <div className={styles.toolbar}>
            <p className={styles.hint}>Most recently viewed first.</p>
            <button type="button" className={styles.clear} disabled={items.length === 0 || clearing} onClick={() => setConfirmClear(true)}>Clear History</button>
          </div>
          {error && <p className={styles.inlineError} role="alert">{error}</p>}
          {items.length === 0 ? (
            <div className={styles.panel}>
              <h2>No recently viewed products yet.</h2>
              <p>Explore products to start your history.</p>
              <Link prefetch={false} href="/products" className={styles.retry}>Browse Products</Link>
            </div>
          ) : (
            <>
              <ul className={styles.list} aria-label="Your recently viewed products">
                {items.map((item) => (
                  <li key={item.id} className={`${saved.card} ${item.available ? "" : saved.gone}`}>
                    <span className={saved.image} aria-hidden>
                      {item.imageSrc ? <Image src={item.imageSrc} alt="" width={320} height={240} unoptimized={item.imageRemote} /> : <Package size={40} />}
                    </span>
                    <button type="button" className={saved.heart} disabled={pending.has(item.id)} aria-label={item.name ? `Remove ${item.name} from recently viewed` : "Remove unavailable product from recently viewed"} onClick={() => remove(item)}>
                      <X size={20} aria-hidden />
                    </button>
                    {item.available && item.url && item.name ? (
                      <>
                        <h3 className={saved.name}><Link prefetch={false} href={item.url}>{item.name}</Link></h3>
                        {item.supplierName && <p className={styles.meta}>Supplier: {item.supplierName}</p>}
                        {item.location && <p className={styles.meta}>Location: {item.location}</p>}
                        <p className={saved.price}>
                          {item.price ? <>{item.price.estimated ? "Est. " : ""}{item.price.text} <span className={saved.unit}>/ {item.price.unit}</span></> : "Price on request"}
                        </p>
                        <p className={styles.when}>{viewedLabel(item.viewedAt)}</p>
                        <div className={saved.actions}>
                          <Link prefetch={false} href={item.url} className={inquiries.btn}>View Product</Link>
                        </div>
                      </>
                    ) : (
                      <>
                        <h3 className={saved.name}>Product no longer available</h3>
                        <p className={saved.goneNote}>This product is no longer public. You can remove it from your history.</p>
                        <p className={styles.when}>{viewedLabel(item.viewedAt)}</p>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {cursor && <button type="button" className={styles.more} disabled={moreBusy} onClick={loadMore}>{moreBusy ? "Loading…" : "Load more"}</button>}
            </>
          )}
        </>
      )}
      {confirmClear && (
        <ConfirmDialog
          title="Clear viewing history?"
          message="This clears only your recently viewed history. Your saved products, inquiries, quotations and orders are not affected. A product you open later will appear here again."
          confirmLabel={clearing ? "Clearing…" : "Clear History"}
          tone="danger"
          busy={clearing}
          onConfirm={clearAll}
          onCancel={() => !clearing && setConfirmClear(false)}
        />
      )}
    </div>
  );
}
