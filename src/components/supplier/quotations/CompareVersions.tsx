"use client";

import { useId, useRef, useState } from "react";
import clsx from "clsx";
import { ArrowLeftRight } from "lucide-react";
import type { CompareResult } from "@/lib/supplier/quotationVersions";
import type { VersionSummary } from "@/lib/supplier/quotationService";
import dash from "../dashboard/SupplierDashboard.module.css";
import styles from "./SupplierQuotations.module.css";

const SYMBOL: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£", AED: "AED ", SGD: "S$" };
const MONEY = /^-?\d+\.\d\d$/;
/** Amounts keep their exact decimal text; only the whole part gets digit grouping (Indian for INR), like every other amount in the portal. */
const group = (v: string, currency: string) => { const [whole, frac] = v.replace(/^-/, "").split("."); const g = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US").format(BigInt(whole)); return `${v.startsWith("-") ? "-" : ""}${g}${frac !== undefined ? "." + frac : ""}`; };
const money = (v: string | null, currency: string) => (v === null ? null : MONEY.test(v) ? `${SYMBOL[currency] ?? `${currency} `}${group(v, currency)}` : v);

/**
 * Compare two versions of this quotation (read only: a comparison never changes either one). Every difference is a text card with a Before and an After and a
 * label, never colour alone: "Added", "Removed" or "Changed", and "Commercial change" or "Formatting only". On a phone each card stacks Before over After; there
 * is no table to scroll. A numeric difference appears only between amounts of the same currency. Answers overtaken by a newer request are ignored.
 */
export function CompareVersions({ reference, versions }: { reference: string; versions: VersionSummary[] }) {
  const id = useId();
  const [from, setFrom] = useState(versions[1]?.version ?? versions[0]?.version ?? 1);
  const [to, setTo] = useState(versions[0]?.version ?? 1);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const counter = useRef(0);
  const controller = useRef<AbortController | null>(null);

  async function run() {
    if (from === to) {
      setError("Choose two different versions.");
      setResult(null);
      return;
    }
    const mine = ++counter.current;
    controller.current?.abort();
    controller.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/supplier/quotations/${encodeURIComponent(reference)}/compare?from=${from}&to=${to}`, { cache: "no-store", signal: controller.current.signal });
      const body = await res.json().catch(() => null);
      if (mine !== counter.current) return;
      if (!res.ok || !body?.ok) {
        setResult(null);
        setError(body?.message ?? "These versions could not be compared.");
        return;
      }
      setResult(body.data as CompareResult);
    } catch (e) {
      if ((e as Error).name !== "AbortError" && mine === counter.current) setError("These versions could not be compared. Check your connection and try again.");
    } finally {
      if (mine === counter.current) setLoading(false);
    }
  }

  if (versions.length < 2) return <p className={dash.muted}>There is only one version, so there is nothing to compare yet. A revision creates a second version.</p>;
  const label = (v: VersionSummary) => `Version ${v.version}${v.isDraft ? " (draft)" : v.isCurrent ? " (current)" : ""}`;
  return (
    <>
      <div className={styles.cmpControls}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={`${id}-from`}>Before (older version)</label>
          <select id={`${id}-from`} className={styles.cmpSelect} value={from} onChange={(e) => setFrom(Number(e.target.value))}>
            {versions.map((v) => <option key={v.version} value={v.version}>{label(v)}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={`${id}-to`}>After (newer version)</label>
          <select id={`${id}-to`} className={styles.cmpSelect} value={to} onChange={(e) => setTo(Number(e.target.value))}>
            {versions.map((v) => <option key={v.version} value={v.version}>{label(v)}</option>)}
          </select>
        </div>
        <button type="button" className={dash.btn} onClick={() => void run()} disabled={loading} aria-busy={loading}>
          <ArrowLeftRight size={18} aria-hidden /> {loading ? "Comparing..." : "Compare versions"}
        </button>
      </div>
      <div aria-live="polite">
        {error && <p className={styles.fieldError} role="alert" style={{ marginTop: "var(--space-3)" }}>{error}</p>}
        {result && (
          <>
            <p className={styles.summaryLine} style={{ marginTop: "var(--space-4)" }}>
              Version {result.from.version} ({result.from.statusLabel}) to version {result.to.version} ({result.to.statusLabel}):{" "}
              {result.comparison.identical ? "no differences." : `${result.comparison.commercialChanges} commercial change${result.comparison.commercialChanges === 1 ? "" : "s"}${result.comparison.formattingOnly ? `, ${result.comparison.formattingOnly} formatting-only` : ""}.`}
            </p>
            {result.notes.map((n) => <p key={n} className={styles.reason}>{n}</p>)}
            {result.comparison.currencyChanged && <p className={clsx(styles.banner, styles.bannerInfo)} role="note">Currency changed from {result.from.currency} to {result.to.currency}: no amount difference is calculated.</p>}
            <ul className={styles.changes} aria-label="Differences between the versions">
              {result.comparison.changes.map((c) => (
                <li key={c.key} className={styles.change}>
                  <div className={styles.changeHead}>
                    <span>{c.label}</span>
                    <span className={styles.tag}>{c.group}</span>
                    <span className={clsx(styles.tag, c.kind !== "changed" && styles.tagGold)}>{c.kind === "added" ? "Added" : c.kind === "removed" ? "Removed" : "Changed"}</span>
                    <span className={clsx(styles.tag, c.commercial && styles.tagTeal)}>{c.commercial ? "Commercial change" : "Formatting only"}</span>
                  </div>
                  <dl className={styles.beforeAfter}>
                    <div><dt>Before (version {result.from.version})</dt><dd>{money(c.before, result.from.currency) ?? "Not present"}</dd></div>
                    <div><dt>After (version {result.to.version})</dt><dd>{money(c.after, result.to.currency) ?? "Not present"}</dd></div>
                  </dl>
                  {c.delta && <p className={styles.small} style={{ marginTop: 0 }}>Difference: {c.delta.startsWith("-") ? "decrease" : "increase"} of {money(c.delta.replace(/^[+-]/, ""), result.to.currency)}</p>}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
