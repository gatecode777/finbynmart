"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import type { PickerItem } from "@/lib/supplier/quoteService";
import dash from "../../dashboard/SupplierDashboard.module.css";
import quotes from "../SupplierQuotations.module.css";
import styles from "./QuoteBuilder.module.css";

interface Result {
  items: PickerItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
  noSellers: boolean;
}

/**
 * Choose the inquiry to quote: only inquiries this company is allowed to quote (the server decides; nothing here filters for security). Search is debounced
 * (300 ms) and an answer overtaken by a newer request is ignored. Each row opens the form for that inquiry, or continues the draft that already exists.
 */
export function InquiryPicker({ initial }: { initial: Result }) {
  const [data, setData] = useState(initial);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const counter = useRef(0);
  const first = useRef(true);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(async (query: string, p: number) => {
    const mine = ++counter.current;
    controller.current?.abort();
    controller.current = new AbortController();
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/supplier/inquiries?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(p) })}`, { cache: "no-store", signal: controller.current.signal });
      const body = await res.json().catch(() => null);
      if (mine !== counter.current) return;
      if (!res.ok || !body?.ok) throw new Error("failed");
      setData({ items: body.items, meta: body.meta, noSellers: Boolean(body.data?.noSellers) });
      setLoading(false);
    } catch (e) {
      if ((e as Error).name === "AbortError" || mine !== counter.current) return;
      setLoading(false);
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = window.setTimeout(() => void load(q, page), page === 1 ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [q, page, load]);

  const { items, meta } = data;
  return (
    <section className={styles.section} aria-labelledby="pick-title">
      <h2 id="pick-title" className={styles.sectionTitle}>Choose an inquiry to quote</h2>
      <p className={styles.hint}>Only inquiries addressed to your sellers that can still be quoted are listed.</p>
      <div className={quotes.search} role="search" style={{ margin: "var(--space-4) 0" }}>
        <Search className={quotes.searchIcon} size={18} aria-hidden />
        <label htmlFor="pick-search" className="visually-hidden">Search eligible inquiries</label>
        <input id="pick-search" type="search" className={quotes.searchInput} placeholder="Search by inquiry reference or product..." value={q} maxLength={60} autoComplete="off" onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        {q && (
          <button type="button" className={quotes.iconBtn} aria-label="Clear search" onClick={() => { setQ(""); setPage(1); }}>
            <X size={18} aria-hidden />
          </button>
        )}
      </div>
      <div aria-busy={loading} aria-live="polite">
        {error ? (
          <div className={quotes.stateBox} role="alert">
            <h3 className={quotes.stateTitle}>The inquiries could not be loaded</h3>
            <p className={quotes.stateText}>Nothing was changed. Check your connection and try again.</p>
            <button type="button" className={dash.btn} onClick={() => void load(q, page)}>Try again</button>
          </div>
        ) : data.noSellers ? (
          <div className={quotes.stateBox}>
            <h3 className={quotes.stateTitle}>No seller is linked to your company yet</h3>
            <p className={quotes.stateText}>Inquiries reach you through the sellers your company owns on Finbyn Mart. None is linked yet (the platform links them), so there is nothing to quote.</p>
          </div>
        ) : items.length === 0 ? (
          <div className={quotes.stateBox}>
            <h3 className={quotes.stateTitle}>{q ? "No matching inquiries" : "No eligible inquiries"}</h3>
            <p className={quotes.stateText}>{q ? "No quotable inquiry matches your search." : "There is no inquiry you can quote right now. Closed, cancelled and declined inquiries, and inquiries from guests without an account, cannot be quoted."}</p>
          </div>
        ) : (
          <>
            <p className={quotes.summaryLine}>{meta.total.toLocaleString("en-IN")} inquir{meta.total === 1 ? "y" : "ies"} you can quote</p>
            <ul className={styles.pickerList} aria-label="Eligible inquiries">
              {items.map((i) => (
                <li key={i.reference} className={styles.pickerCard}>
                  <div>
                    <p className={quotes.ref} style={{ margin: 0 }}>{i.reference} · {i.statusLabel}</p>
                    <p style={{ margin: "var(--space-1) 0 0", fontWeight: 600 }}>{i.productName}{i.category ? <span className={quotes.small}>{i.category}</span> : null}</p>
                    <p className={quotes.small} style={{ marginTop: "var(--space-1)" }}>{i.buyer} · {i.quantity.toLocaleString("en-IN")}{i.unit ? ` ${i.unit}` : ""} · received {i.receivedLabel}</p>
                  </div>
                  {i.existing ? (
                    i.existing.status === "DRAFT" ? (
                      <Link href={`/supplier/quotations/create?reference=${i.existing.reference}`} className={dash.btn}>Continue draft</Link>
                    ) : (
                      <Link href={`/supplier/quotations/${i.existing.reference}`} className={dash.btn}>View quotation</Link>
                    )
                  ) : (
                    <Link href={i.href} className={clsx(dash.btn, quotes.primaryBtn)}>Create quotation</Link>
                  )}
                </li>
              ))}
            </ul>
            {meta.totalPages > 1 && (
              <nav className={quotes.pager} aria-label="Inquiry pages" style={{ marginTop: "var(--space-4)" }}>
                <ul className={quotes.pages}>
                  <li><button type="button" className={quotes.pageBtn} aria-label="Previous page" disabled={meta.page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={18} aria-hidden /></button></li>
                  <li><span className={quotes.small} style={{ alignSelf: "center" }}>Page {meta.page} of {meta.totalPages}</span></li>
                  <li><button type="button" className={quotes.pageBtn} aria-label="Next page" disabled={meta.page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight size={18} aria-hidden /></button></li>
                </ul>
              </nav>
            )}
          </>
        )}
      </div>
    </section>
  );
}
