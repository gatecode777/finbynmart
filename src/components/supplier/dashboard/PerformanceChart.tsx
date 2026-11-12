"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart3 } from "lucide-react";
import type { Performance } from "@/lib/supplier/dashboardService";
import s from "./SupplierDashboard.module.css";

interface Props {
  /** The address query for the period (range=...&startDate=...), so the chart follows the selected range. */
  query: string;
}

const SERIES = [
  { key: "inquiries", label: "Inquiries received", color: "var(--primary)", dashed: false },
  { key: "quotations", label: "Quotations submitted", color: "var(--accent)", dashed: false },
  { key: "orders", label: "Confirmed orders", color: "var(--text-secondary)", dashed: true },
] as const;

const WIDTH = 640;
const HEIGHT = 240;
const PAD = { left: 40, right: 12, top: 12, bottom: 30 };

function label(iso: string, bucket: Performance["bucket"]) {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = bucket === "month" ? { month: "short", year: "numeric" } : { day: "numeric", month: "short" };
  const text = new Intl.DateTimeFormat("en-IN", { ...opts, timeZone: "Asia/Kolkata" }).format(d);
  return bucket === "week" ? `Week of ${text}` : text;
}

/**
 * Three real series from the server: inquiries by the day they arrived, quotations by the day their first version was sent, orders by the day they
 * were placed. Drawn as SVG (the project has no chart library and adds none); a data table and a text summary carry the same numbers for screen readers
 * and anyone who cannot read the lines. Loads from its own route, so a slow or failing chart never delays or blanks the rest of the dashboard.
 */
export function PerformanceChart({ query }: Props) {
  const [data, setData] = useState<Performance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const counter = useRef(0);

  async function load() {
    const mine = ++counter.current;
    setData(null);
    setError(null);
    try {
      const res = await fetch(`/api/supplier/dashboard/performance?${query}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (mine !== counter.current) return;
      if (!res.ok || !body?.ok) throw new Error(body?.message ?? "The performance chart could not be loaded.");
      setData(body.data as Performance);
    } catch (e) {
      if (mine === counter.current) setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the period changes
  }, [query]);

  return (
    <section className={s.card} aria-labelledby="perf-title">
      <h2 id="perf-title" className={s.cardTitle}><BarChart3 size={20} aria-hidden /> Business Performance</h2>
      {error ? (
        <div role="alert">
          <p className={s.errorBox}>{error}</p>
          <p><button type="button" className={s.btn} onClick={() => void load()}>Try again</button></p>
        </div>
      ) : !data ? (
        <div className={s.skeleton} aria-busy="true" aria-label="Loading the performance chart" />
      ) : data.totals.inquiries + data.totals.quotations + data.totals.orders === 0 ? (
        <p className={s.note}>No inquiries, quotations or confirmed orders were recorded for this company in the selected period.</p>
      ) : (
        <Chart data={data} />
      )}
    </section>
  );
}

function Chart({ data }: { data: Performance }) {
  const n = data.points.length;
  const max = Math.max(1, ...data.points.flatMap((p) => [p.inquiries, p.quotations, p.orders]));
  const top = Math.max(4, Math.ceil(max / 4) * 4);
  const x = (i: number) => PAD.left + (n === 1 ? (WIDTH - PAD.left - PAD.right) / 2 : (i * (WIDTH - PAD.left - PAD.right)) / (n - 1));
  const y = (v: number) => PAD.top + (1 - v / top) * (HEIGHT - PAD.top - PAD.bottom);
  const unit = data.bucket === "day" ? "day" : data.bucket === "week" ? "week" : "month";
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const summary = `Per ${unit}: ${plural(data.totals.inquiries, "inquiry", "inquiries")} received, ${plural(data.totals.quotations, "quotation", "quotations")} submitted and ${plural(data.totals.orders, "order", "orders")} confirmed in total.`;
  const ticks = [0, top / 4, top / 2, (3 * top) / 4, top];
  const labelIdx = n <= 6 ? data.points.map((_, i) => i) : [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1];
  return (
    <>
      <p className={s.muted}>{summary}</p>
      <div className={s.chartWrap}>
        <svg className={s.chart} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Business performance chart. ${summary}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
              <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-secondary)">{Number.isInteger(t) ? t : t.toFixed(1)}</text>
            </g>
          ))}
          {labelIdx.map((i) => (
            <text key={i} x={x(i)} y={HEIGHT - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="11" fill="var(--text-secondary)">{label(data.points[i].start, data.bucket)}</text>
          ))}
          {SERIES.map((series) => (
            <g key={series.key} color={series.color}>
              <polyline fill="none" stroke={series.color} strokeWidth="2.5" strokeDasharray={series.dashed ? "6 4" : undefined} strokeLinejoin="round" points={data.points.map((p, i) => `${x(i)},${y(p[series.key])}`).join(" ")} />
              {data.points.map((p, i) => (
                <circle key={i} cx={x(i)} cy={y(p[series.key])} r={n > 40 ? 0 : 3.5} fill="#fff" stroke={series.color} strokeWidth="2">
                  <title>{`${series.label}: ${p[series.key]} (${label(p.start, data.bucket)})`}</title>
                </circle>
              ))}
            </g>
          ))}
        </svg>
      </div>
      <ul className={s.legend} aria-label="Chart legend">
        {SERIES.map((series) => (
          <li key={series.key} className={s.legendItem} style={{ color: series.color }}>
            <span className={`${s.swatch} ${series.dashed ? s.swatchDashed : ""}`} aria-hidden />
            <span style={{ color: "var(--text-primary)" }}>{series.label}</span>
          </li>
        ))}
      </ul>
      <details>
        <summary className={s.muted} style={{ cursor: "pointer" }}>Show the numbers as a table</summary>
        <table className={s.srTable}>
          <caption className="visually-hidden">Business performance by {unit}</caption>
          <thead>
            <tr><th scope="col">{unit === "day" ? "Day" : unit === "week" ? "Week" : "Month"}</th><th scope="col">Inquiries</th><th scope="col">Quotations</th><th scope="col">Orders</th></tr>
          </thead>
          <tbody>
            {data.points.map((p) => (
              <tr key={p.start}><th scope="row">{label(p.start, data.bucket)}</th><td>{p.inquiries}</td><td>{p.quotations}</td><td>{p.orders}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
