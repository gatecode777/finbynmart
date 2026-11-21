"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CreditCard, Download, Info } from "lucide-react";
import auth from "@/components/auth/Auth.module.css";
import prof from "../profile/SupplierProfile.module.css";
import { flashToast } from "@/components/ui/Toast";
import type { Report } from "@/lib/supplier/analyticsService";
import { METRIC_DEFINITIONS, formatMinor, todayInReportZone } from "@/lib/supplier/analyticsRules";
import s from "./Analytics.module.css";

const TEAL = "#04534F";
const GOLD = "#FDB304";

export function SupplierAnalyticsWorkspace({ initial }: { initial: Report }) {
  const [report, setReport] = useState(initial);
  const [start, setStart] = useState(initial.range.startDay);
  const [end, setEnd] = useState(initial.range.endDay);
  const [currency, setCurrency] = useState(initial.currency ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const first = useRef(true);
  const today = todayInReportZone();

  const load = useCallback(async () => {
    abort.current?.abort();
    const ctl = (abort.current = new AbortController());
    setBusy(true);
    const qs = new URLSearchParams({ start, end });
    if (currency) qs.set("currency", currency);
    const res = await fetch(`/api/supplier/analytics?${qs}`, { cache: "no-store", signal: ctl.signal }).catch(() => null);
    if (ctl.signal.aborted) return;
    const json = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (res?.ok && json?.ok) { setReport(json.data); setError(""); } else setError(json?.message ?? (res ? "Could not load the report." : "Network error. Check your connection and retry."));
  }, [start, end, currency]);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    void load();
  }, [load]);

  async function exportCsv() {
    setExporting(true);
    const res = await fetch("/api/supplier/analytics/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ start, end, currency }) }).catch(() => null);
    setExporting(false);
    if (!res?.ok) { flashToast("error", "Report not exported. " + (res ? "Please try again." : "Network error.")); return; }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url; a.download = `finbyn-report-${start}_${end}.csv`; a.click();
    URL.revokeObjectURL(url);
    flashToast("success", "Report exported.");
  }

  const cur = report.currency ?? "";
  return (
    <>
      <div className={s.controls}>
        <div className={s.field}><label htmlFor="an-start">From</label><input id="an-start" type="date" className={auth.control} value={start} max={end} onChange={(e) => e.target.value && setStart(e.target.value)} /></div>
        <div className={s.field}><label htmlFor="an-end">To</label><input id="an-end" type="date" className={auth.control} value={end} min={start} max={today} onChange={(e) => e.target.value && setEnd(e.target.value)} /></div>
        <div className={s.field}>
          <label htmlFor="an-cur">Currency (order value)</label>
          <select id="an-cur" className={auth.control} value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={report.currencies.length === 0}>
            {report.currencies.length === 0 ? <option value="">No orders</option> : report.currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button type="button" className={prof.btnGold} onClick={exportCsv} disabled={exporting}><Download size={16} aria-hidden /> {exporting ? "Exporting…" : "Export Report"}</button>
      </div>

      {error && <p role="alert" className={s.err}>{error} <button type="button" className={prof.btnSecondary} onClick={() => void load()}>Retry</button></p>}

      <div className={busy ? s.busy : undefined} aria-busy={busy}>
        <dl className={s.kpis} aria-label="Key figures">
          <Kpi label="Inquiries received" value={report.inquiries.toLocaleString("en-IN")} note="Date received" />
          <Kpi label="Quotations submitted" value={report.quotations.toLocaleString("en-IN")} note="First versions, by send date" />
          <Kpi label="Confirmed orders" value={report.orders.toLocaleString("en-IN")} note="By order date" />
          <Kpi label="Confirmed order value" value={report.orderValueMinor === null ? "Unavailable" : formatMinor(report.orderValueMinor, cur)} note={report.orderValueMinor === null ? "No confirmed orders in this period" : `${cur} only, not converted`} />
        </dl>
        <p className={s.hint}><Info size={16} aria-hidden /> Order value is not payment received. Inquiries, quotations and orders are independent counts, not a conversion funnel.</p>

        <div className={s.grid}>
          <section className={s.card} aria-label="Activity trend">
            <h2>Activity trend</h2>
            <TrendChart report={report} />
          </section>
          <section className={`${s.card} ${s.cardMint}`} aria-label="Reporting scope">
            <h2>Reporting scope</h2>
            <dl className={s.scope}>
              <dt>Date basis</dt><dd>Per metric (see definitions)</dd>
              <dt>Timezone</dt><dd>{report.timezone}</dd>
              <dt>Range</dt><dd>{report.range.startDay} to {report.range.endDay}</dd>
              <dt>Buckets</dt><dd>{report.range.bucket === "day" ? "Daily" : "Weekly (from Monday)"}</dd>
              <dt>Currency</dt><dd>{cur || "—"}</dd>
            </dl>
            <p className={s.hint} style={{ marginTop: ".75rem" }}><Info size={16} aria-hidden /> The currency filter applies to order value and top products only.</p>
          </section>
        </div>

        <div className={s.grid}>
          <section className={s.card} aria-label="Top products">
            <h2>Top products by confirmed order value</h2>
            {report.topProducts.length === 0 ? <p className={s.unavail}>No confirmed orders with products in this period.</p> : (
              <>
                <table className={`${s.table} ${s.desktopOnly}`}>
                  <thead><tr><th scope="col">Product</th><th scope="col" className={s.num}>Orders containing it</th><th scope="col" className={s.num}>Order value</th></tr></thead>
                  <tbody>{report.topProducts.map((p) => <tr key={p.name}><td>{p.name}</td><td className={s.num}>{p.orders}</td><td className={s.num}>{formatMinor(p.valueMinor, cur)}</td></tr>)}</tbody>
                </table>
                <div className={s.mobileOnly}>{report.topProducts.map((p) => <div key={p.name} className={s.pcard}><span><strong>{p.name}</strong><br /><span className={s.kpiNote}>{p.orders} order{p.orders === 1 ? "" : "s"}</span></span><strong>{formatMinor(p.valueMinor, cur)}</strong></div>)}</div>
                <p className={s.hint} style={{ marginTop: ".75rem" }}><Info size={16} aria-hidden /> Quantity × agreed unit price per product. Top 10 only; order counts per product are not additive.</p>
              </>
            )}
          </section>
          <section className={`${s.card} ${s.cardMint}`} aria-label="Payment reporting">
            <h2>Payment reporting</h2>
            <div className={s.unavail}><CreditCard size={36} aria-hidden /><strong>Payment analytics unavailable</strong>{report.payments.reason}</div>
          </section>
        </div>

        <details className={s.card}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Report details: metric definitions (version {report.version})</summary>
          <dl className={s.defs}>
            {METRIC_DEFINITIONS.map((d) => (
              <div key={d.key}><dt>{d.label}</dt><dd>Source: {d.source}. Date: {d.dateBasis}. Counted as: {d.grain}. {d.note}</dd></div>
            ))}
          </dl>
          <p className={s.hint}>Generated {new Date(report.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST"}. Numbers are read from live records; there is no cache or rollup.</p>
        </details>
      </div>
    </>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className={s.kpi}><dt className={s.kpiLabel}>{label}</dt><dd style={{ margin: 0 }}><p className={s.kpiValue}>{value}</p><p className={s.kpiNote}>{note}</p></dd></div>;
}

function TrendChart({ report }: { report: Report }) {
  const pts = report.trend;
  const W = 640, H = 240, L = 40, B = 28, T = 10, R = 10;
  const max = Math.max(4, ...pts.map((p) => Math.max(p.inquiries, p.quotations)));
  const nice = Math.ceil(max / 4) * 4;
  const x = (i: number) => L + (pts.length <= 1 ? 0 : (i * (W - L - R)) / (pts.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / nice);
  const line = (k: "inquiries" | "quotations") => pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  const step = Math.max(1, Math.ceil(pts.length / 6));
  const total = pts.reduce((a, p) => a + p.inquiries + p.quotations, 0);
  return (
    <>
      <div className={s.legend}>
        <span><svg width="26" height="10" aria-hidden><line x1="0" y1="5" x2="26" y2="5" stroke={TEAL} strokeWidth="3" /><circle cx="13" cy="5" r="3.5" fill={TEAL} /></svg>Inquiries (solid, circles)</span>
        <span><svg width="26" height="10" aria-hidden><line x1="0" y1="5" x2="26" y2="5" stroke={GOLD} strokeWidth="3" strokeDasharray="5 3" /><rect x="10" y="2" width="6" height="6" fill={GOLD} /></svg>Submitted quotations (dashed, squares)</span>
      </div>
      <svg className={s.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Line chart of inquiries and submitted quotations per ${report.range.bucket}, ${report.range.startDay} to ${report.range.endDay}. ${total === 0 ? "No activity in this period." : "See the table below for the values."}`}>
        {[0, 1, 2, 3, 4].map((i) => { const v = (nice / 4) * i; return <g key={i}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#DCE8E5" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#526563">{v}</text></g>; })}
        {pts.map((p, i) => (i % step === 0 ? <text key={p.bucket} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#526563">{p.bucket.slice(5)}</text> : null))}
        <path d={line("inquiries")} fill="none" stroke={TEAL} strokeWidth="2.5" />
        <path d={line("quotations")} fill="none" stroke={GOLD} strokeWidth="2.5" strokeDasharray="6 4" />
        {pts.length <= 40 && pts.map((p, i) => <g key={p.bucket}><circle cx={x(i)} cy={y(p.inquiries)} r="3" fill={TEAL}><title>{`${p.bucket}: ${p.inquiries} inquiries`}</title></circle><rect x={x(i) - 3} y={y(p.quotations) - 3} width="6" height="6" fill={GOLD}><title>{`${p.bucket}: ${p.quotations} quotations`}</title></rect></g>)}
      </svg>
      <details>
        <summary style={{ cursor: "pointer", fontSize: ".875rem", fontWeight: 600 }}>View as table</summary>
        <div style={{ maxHeight: 260, overflow: "auto" }}>
          <table className={s.table}>
            <caption className="sr-only" style={{ position: "absolute", left: -9999 }}>Counts per {report.range.bucket}</caption>
            <thead><tr><th scope="col">{report.range.bucket === "day" ? "Day" : "Week starting"}</th><th scope="col" className={s.num}>Inquiries</th><th scope="col" className={s.num}>Quotations</th><th scope="col" className={s.num}>Orders</th></tr></thead>
            <tbody>{pts.map((p) => <tr key={p.bucket}><td>{p.bucket}</td><td className={s.num}>{p.inquiries}</td><td className={s.num}>{p.quotations}</td><td className={s.num}>{p.orders}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </>
  );
}
