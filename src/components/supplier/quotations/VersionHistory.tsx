"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import type { VersionSummary } from "@/lib/supplier/quotationService";
import { SupplierStatusBadge } from "./SupplierStatusBadge";
import dash from "../dashboard/SupplierDashboard.module.css";
import styles from "./SupplierQuotations.module.css";

interface Props {
  reference: string;
  selectedVersion: number;
  initial: VersionSummary[];
  nextCursor: number | null;
  total: number;
}

/**
 * The versions of this quotation, newest first, as summaries only (a full version is read when it is selected). Selecting a version is a link to
 * ?version=n, so it is shareable, works with the keyboard and the back button, and is re-authorised by the server on every load. Older pages are loaded on request
 * with a cursor; an answer overtaken by a newer click is ignored.
 */
export function VersionHistory({ reference, selectedVersion, initial, nextCursor, total }: Props) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const counter = useRef(0);

  async function more() {
    if (!cursor) return;
    const mine = ++counter.current;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/supplier/quotations/${encodeURIComponent(reference)}/versions?${new URLSearchParams({ cursor: String(cursor), limit: "20" })}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (mine !== counter.current) return;
      if (!res.ok || !body?.ok) throw new Error("failed");
      setItems((cur) => [...cur, ...(body.items as VersionSummary[]).filter((v) => !cur.some((c) => c.version === v.version))]);
      setCursor(body.meta.nextCursor);
    } catch {
      if (mine === counter.current) setError(true);
    } finally {
      if (mine === counter.current) setLoading(false);
    }
  }

  return (
    <>
      <p className={dash.muted} style={{ marginTop: 0 }}>{total.toLocaleString("en-IN")} version{total === 1 ? "" : "s"}. Selecting a version shows it exactly as it was saved; nothing here can edit a submitted version.</p>
      <ul className={styles.versionList} aria-label="Versions, newest first">
        {items.map((v) => {
          const selected = v.version === selectedVersion;
          return (
            <li key={v.version} className={clsx(styles.versionItem, selected && styles.versionSelected)}>
              <div>
                <Link href={v.href} className={styles.versionLink} aria-current={selected ? "page" : undefined} aria-label={`Version ${v.version}${v.isDraft ? ", draft" : v.isCurrent ? ", current offer" : ", previous"}${selected ? ", selected" : ""}`}>
                  <span className={clsx(styles.marker, selected && styles.markerOn)} aria-hidden />
                  Version {v.version}
                </Link>{" "}
                {v.isDraft ? <span className={clsx(styles.tag, styles.tagGold)}>Draft (not submitted)</span> : v.isCurrent ? <span className={clsx(styles.tag, styles.tagTeal)}>Current</span> : <span className={styles.tag}>Previous</span>}{" "}
                {v.isAccepted && <span className={clsx(styles.tag, styles.tagTeal)}>Accepted</span>}
                {v.revisionReason && <span className={styles.small}>Revision of version {v.revisionOf}: {v.revisionReason}</span>}
              </div>
              <div>
                <span className={styles.small} style={{ marginTop: 0 }}>{v.submittedLabel ? `Submitted ${v.submittedLabel}` : `Created ${v.createdLabel}`}</span>
                <span className={styles.small}>{v.totalText ? `${v.totalText}${v.provisional ? " (provisional)" : ""}` : v.provisional ? "Not priced yet" : "Total not available"} · valid until {v.validLabel}</span>
              </div>
              <SupplierStatusBadge status={v.status} label={v.statusLabel} />
            </li>
          );
        })}
      </ul>
      {error && <p className={styles.fieldError} role="alert">Older versions could not be loaded. <button type="button" className={styles.textBtn} onClick={() => void more()}>Try again</button></p>}
      {cursor && <button type="button" className={dash.btn} onClick={() => void more()} disabled={loading} aria-busy={loading} style={{ marginTop: "var(--space-3)" }}>{loading ? "Loading..." : "Load older versions"}</button>}
    </>
  );
}
