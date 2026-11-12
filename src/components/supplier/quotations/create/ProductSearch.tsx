"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ProductChoice } from "@/lib/supplier/quoteService";
import styles from "./QuoteBuilder.module.css";

/** Search the company's OWN products (server side, 20 per page): debounced 300 ms, stale answers ignored. Picking one fills the line; it never changes a price. */
export function ProductSearch({ onPick, inputId }: { onPick: (product: ProductChoice) => void; inputId: string }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ProductChoice[] | null>(null);
  const [error, setError] = useState(false);
  const listId = useId();
  const counter = useRef(0);

  useEffect(() => {
    const mine = ++counter.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/supplier/quotation-products?${new URLSearchParams({ ...(q ? { q } : {}), limit: "20" })}`, { cache: "no-store", signal: controller.signal });
        const body = await res.json().catch(() => null);
        if (mine !== counter.current) return;
        if (!res.ok || !body?.ok) throw new Error("failed");
        setItems(body.items);
        setError(false);
      } catch (e) {
        if ((e as Error).name !== "AbortError" && mine === counter.current) setError(true);
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>Search your products</label>
      <input id={inputId} type="search" className={styles.input} value={q} maxLength={60} autoComplete="off" aria-controls={listId} onChange={(e) => setQ(e.target.value)} placeholder="Type a product name" />
      <div id={listId} aria-live="polite">
        {error ? (
          <p className={styles.error} role="alert">Products could not be loaded. Try again.</p>
        ) : items === null ? (
          <p className={styles.hint}>Loading your products...</p>
        ) : items.length === 0 ? (
          <p className={styles.hint}>{q ? "None of your products match." : "No product is linked to your company yet. Use a manual item."}</p>
        ) : (
          <ul className={styles.results} aria-label="Your products">
            {items.map((p) => (
              <li key={`${p.source}-${p.key}`}>
                <button type="button" className={styles.result} onClick={() => onPick(p)}>
                  {p.name} <span className={styles.hint}>({p.unit}{p.moq ? `, MOQ ${p.moq.quantity} ${p.moq.unit}` : ""})</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
