"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import prof from "@/components/supplier/profile/SupplierProfile.module.css";
import { Dropdown } from "@/components/ui/Dropdown";
import { MAX_RANGE_DAYS, REPORT_TIMEZONE, chartPoints, dayLabel, dayLong, defaultRange, niceMax, parseRange, type ReportKey } from "@/lib/admin/reportRules";
import type { ReportResult } from "@/lib/admin/reportService";
import r from "./AdminReports.module.css";

interface State { report: ReportKey; from: string; to: string }
const PAGE = 31;
const genAt = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: REPORT_TIMEZONE }) + " IST";
const qs = (s: State) => new URLSearchParams({ report: s.report, from: s.from, to: s.to }).toString();

/** The chart: an SVG bar chart with an integer count axis. Its text equivalent is the daily breakdown table below it (the chart itself is one labelled image). */
function Chart({ data }: { data: ReportResult }) {
  const { bucket, points } = chartPoints(data.rows, data.range.days);
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const W = 640, H = 260, L = 40, B = 36, T = 12, R = 8;
  const bw = (W - L - R) / Math.max(points.length, 1);
  const step = Math.max(1, Math.ceil(points.length / 8));
  const ticks = [0, 1, 2, 3, 4].map((i) => Math.round((max / 4) * i)).filter((v, i, a) => a.indexOf(v) === i);
  return (
    <div className={r.chartWrap}>
      <svg className={r.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${data.label} per ${bucket}: total ${data.summary.total} between ${dayLong(data.range.from)} and ${dayLong(data.range.to)}. The same numbers are in the table below.`}>
        {ticks.map((v) => { const y = T + (H - T - B) * (1 - v / max); return <g key={v}><line className={r.grid} x1={L} x2={W - R} y1={y} y2={y} /><text className={r.axis} x={L - 6} y={y + 4} textAnchor="end">{v}</text></g>; })}
        {points.map((p, i) => { const h = (H - T - B) * (p.value / max); const x = L + i * bw + bw * 0.15; return <g key={p.label}><rect className={r.bar} x={x} y={H - B - h} width={Math.max(1, bw * 0.7)} height={h}><title>{`${bucket === "week" ? "Week of " : ""}${dayLong(p.label)}: ${p.value}`}</title></rect>{i % step === 0 && <text className={r.axis} x={x + (bw * 0.7) / 2} y={H - B + 16} textAnchor="middle">{dayLabel(p.label)}</text>}</g>; })}
      </svg>
      {bucket === "week" && <p className={r.note}>This range is longer than 62 days, so the chart shows weekly totals (weeks start on Monday). The breakdown below stays daily.</p>}
    </div>
  );
}

/**
 * The reports workspace. The applied state (report, From, To) is in the URL and drives the request; a response that arrives after a newer request is ignored; the result on screen always names
 * its own report, range and generation time, so old results are never presented as the new request; a failed request keeps the filters and shows Retry (never zeros).
 */
export function AdminReportsWorkspace({ initial, permitted, state, today, initialError, failed }: { initial: ReportResult | null; permitted: { key: ReportKey; label: string }[]; state: State; today: string; initialError: string | null; failed: boolean }) {
  const uid = useId();
  const [applied, setApplied] = useState<State>(state);
  const [draft, setDraft] = useState<State>(state);
  const [data, setData] = useState<ReportResult | null>(initial);
  const [error, setError] = useState(failed ? "The report could not be generated." : "");
  const [rangeError, setRangeError] = useState(initialError ?? "");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const first = useRef(true);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setBusy(true);
    let res: Response | null = null;
    try { res = await fetch(`/api/admin/reports?${qs(applied)}`, { cache: "no-store", credentials: "same-origin" }); } catch { res = null; }
    const json = res ? await res.json().catch(() => null) : null;
    if (mine !== seq.current) return; // a newer request owns the screen
    setBusy(false);
    if (res?.ok && json?.ok) { setData(json.data); setError(""); setPage(0); }
    else if (res?.status === 422) setRangeError(json?.fields?.range ?? json?.message ?? "Check the report and the dates.");
    else setError(res?.status === 403 ? "You do not have access to this report." : json?.message ?? (res ? "The report could not be generated." : "Network error. Check your connection and retry."));
  }, [applied]);

  useEffect(() => {
    if (first.current) { first.current = false; if (failed) void load(); return; }
    void load();
  }, [load, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // back / forward restores the state kept in the URL
    const onPop = () => {
      const sp = new URLSearchParams(window.location.search);
      const rep = permitted.find((p) => p.key === sp.get("report"))?.key ?? permitted[0].key;
      const d = defaultRange();
      const next = { report: rep, from: sp.get("from") ?? d.startDay, to: sp.get("to") ?? d.endDay };
      setDraft(next); setApplied(next); setRangeError("");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [permitted]);

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const check = parseRange(draft.from, draft.to);
    if (!check.ok) { setRangeError(check.message); return; }
    setRangeError("");
    window.history.pushState(null, "", `/admin/reports?${qs(draft)}`);
    setApplied(draft);
  }
  function reset() {
    const d = defaultRange();
    const next = { report: permitted[0].key, from: d.startDay, to: d.endDay };
    setDraft(next); setRangeError("");
    window.history.pushState(null, "", "/admin/reports");
    setApplied(next);
  }

  const rows = data?.rows ?? [];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const stale = data && (data.report !== applied.report || data.range.from !== applied.from || data.range.to !== applied.to);
  const cols = (data?.columns ?? []).filter((c) => c.key !== "unclassified" || (data?.summary.unclassified ?? 0) > 0);
  const n = (v: number) => v.toLocaleString("en-IN");

  return (
    <>
      <form className={r.form} onSubmit={apply} noValidate aria-label="Report filters">
        <div className={r.field}>
          <label htmlFor={`${uid}-rep`} className={r.lbl}>Report type</label>
          <Dropdown id={`${uid}-rep`} value={draft.report} onChange={(v) => setDraft({ ...draft, report: v as ReportKey })} options={permitted.map((p) => ({ value: p.key, label: p.label }))} />
        </div>
        <div className={r.field}>
          <label htmlFor={`${uid}-from`} className={r.lbl}>From</label>
          <input id={`${uid}-from`} type="date" className={r.date} value={draft.from} max={today} aria-invalid={rangeError ? true : undefined} aria-describedby={rangeError ? `${uid}-err` : undefined} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
        </div>
        <div className={r.field}>
          <label htmlFor={`${uid}-to`} className={r.lbl}>To</label>
          <input id={`${uid}-to`} type="date" className={r.date} value={draft.to} max={today} aria-invalid={rangeError ? true : undefined} aria-describedby={rangeError ? `${uid}-err` : undefined} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
        </div>
        <div className={r.actions}>
          <button type="submit" className={prof.btnGold}>Apply</button>
          <button type="button" className={prof.btnSecondary} onClick={reset}>Reset</button>
        </div>
        {rangeError && <p id={`${uid}-err`} className={r.err} role="alert" style={{ gridColumn: "1 / -1" }}>{rangeError} (Dates are calendar days in {REPORT_TIMEZONE}, at most {MAX_RANGE_DAYS} days, not in the future.)</p>}
      </form>

      {error && <p role="alert" className={r.err} style={{ marginBottom: "1rem" }}>{error} <button type="button" className={prof.btnSecondary} onClick={() => setTick((t) => t + 1)}>Retry</button></p>}
      <p className="visually-hidden" role="status" aria-live="polite">{busy ? "Loading report." : ""}</p>

      {!data ? (
        busy ? <div className={r.panel} aria-busy>Loading report…</div> : null
      ) : (
        <div aria-busy={busy}>
          <p className={r.range}>{dayLong(data.range.from)} – {dayLong(data.range.to)} • {data.range.timezone} • {data.label}, counted by {data.dateBasis}{stale || busy ? <span className={r.busyTag}> — {busy ? "updating…" : "earlier request"}</span> : null}</p>
          <p className={r.meta}>Generated {genAt(data.generatedAt)}. Counting unit: {data.unit}.</p>
          <dl className={r.stats} aria-label="Summary">
            <div className={r.stat}><dt>Total {data.label.toLowerCase()}</dt><dd>{n(data.summary.total)}</dd></div>
            {cols.length > 1 && cols.map((c) => <div key={c.key} className={r.stat}><dt>{c.label}</dt><dd>{n(data.summary[c.key])}</dd></div>)}
          </dl>
          {data.summary.total === 0 && <p className={r.note}>No activity was recorded in this period. This is a real count of zero, not a missing report.</p>}
          {data.warnings.map((w) => <p key={w} className={r.note} role="note">{w}</p>)}

          <section className={r.card} aria-labelledby={`${uid}-ch`}>
            <h2 id={`${uid}-ch`}>{data.label} by {data.range.bucket === "week" ? "week" : "day"}</h2>
            <Chart data={data} />
          </section>

          <section className={r.card} aria-labelledby={`${uid}-bd`}>
            <h2 id={`${uid}-bd`}>Daily breakdown</h2>
            <div className={r.tableWrap}>
              <table className={r.table}>
                <caption className="visually-hidden">{data.label}, one row per calendar day</caption>
                <thead><tr><th scope="col">Date</th>{cols.map((c) => <th key={c.key} scope="col">{c.label}</th>)}{cols.length > 1 && <th scope="col">Total</th>}</tr></thead>
                <tbody>{shown.map((row) => <tr key={row.date}><th scope="row">{dayLong(row.date)}</th>{cols.map((c) => <td key={c.key}>{n(row[c.key] as number)}</td>)}{cols.length > 1 && <td>{n(row.total)}</td>}</tr>)}</tbody>
              </table>
            </div>
            <ul className={r.cards} aria-label="Daily breakdown">{shown.map((row) => <li key={row.date}><strong>{dayLong(row.date)}</strong><span>{cols.map((c) => `${c.label} ${n(row[c.key] as number)}`).join(" · ")}{cols.length > 1 ? ` · Total ${n(row.total)}` : ""}</span></li>)}</ul>
            <div className={r.pager}>
              <span>Days {rows.length ? page * PAGE + 1 : 0}–{page * PAGE + shown.length} of {n(rows.length)}. The summary covers every day of the range.</span>
              <span className={r.actions}>
                <button type="button" className={prof.btnSecondary} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
                <button type="button" className={prof.btnSecondary} disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
              </span>
            </div>
          </section>

          <section className={r.card} aria-label="Definition and limits">
            <p className={r.note} style={{ marginTop: 0 }}><Info size={14} aria-hidden /> <strong>Definition.</strong> {data.definition}</p>
            <p className={r.note}><strong>Limits.</strong> {data.limitation} Counts are read from the stored records while writes continue, so they are approximate for the most recent minutes. Current status of records is not shown: it is not a historical status.</p>
          </section>
        </div>
      )}
    </>
  );
}
