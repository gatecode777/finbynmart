import type { Section, Trend } from "@/lib/buyer/dashboard";
import { formatDate, formatShortDate } from "./format";
import { SectionError } from "./SectionError";
import styles from "./Dashboard.module.css";

const W = 600;
const H = 230;
const PAD = { top: 16, right: 16, bottom: 30, left: 36 };

/** The y axis top: the next "nice" number above the largest bucket (at least 4, so a quiet period does not look busy). */
function niceMax(max: number): number {
  if (max <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= max) return m * step;
  return max;
}

export function InquiryOrderTrend({ section }: { section: Section<Trend> }) {
  return (
    <section className={styles.card} aria-labelledby="trend-title">
      <h2 id="trend-title" className={styles.cardTitle}>
        Inquiry &amp; Order Trend
      </h2>
      {section.status === "error" ? <SectionError name="The trend chart" /> : <TrendBody trend={section.data} />}
    </section>
  );
}

function TrendBody({ trend }: { trend: Trend }) {
  const points = trend.inquiries;
  const total = points.reduce((sum, p) => sum + p.count, 0);
  if (points.length === 0 || total === 0) {
    return (
      <>
        <p className={styles.emptyNote}>No inquiries in this period yet.</p>
        <p className={styles.legendNote}>Orders: {trend.orders.reason}</p>
      </>
    );
  }
  const max = niceMax(Math.max(...points.map((p) => p.count)));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (n: number) => PAD.top + innerH - (n / max) * innerH;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.count).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${PAD.top + innerH} L${x(0).toFixed(1)} ${PAD.top + innerH} Z`;
  const ticks = [0, 1, 2, 3, 4].map((i) => Math.round((max / 4) * i * 10) / 10);
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  const unit = trend.bucket === "day" ? "day" : trend.bucket === "week" ? "week" : "month";
  const summary = `Inquiries per ${unit}, ${formatDate(points[0].start)} to ${formatDate(points[points.length - 1].start)}: ${total} in total, highest ${Math.max(...points.map((p) => p.count))}.`;
  return (
    <>
      <ul className={styles.legend} aria-label="Legend">
        <li>
          <span className={`${styles.swatch} ${styles.swatchInquiries}`} aria-hidden /> Inquiries
        </li>
        <li className={styles.legendMuted}>
          <span className={`${styles.swatch} ${styles.swatchOrders}`} aria-hidden /> Orders (not available yet)
        </li>
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} role="img" aria-label={summary}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className={styles.gridLine} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className={styles.axisText}>
              {t}
            </text>
          </g>
        ))}
        <path d={area} className={styles.areaFill} />
        <path d={line} className={styles.lineStroke} fill="none" />
        {points.map((p, i) => (
          <circle key={p.start} cx={x(i)} cy={y(p.count)} r={points.length > 45 ? 0 : 3.5} className={styles.dot} />
        ))}
        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text key={`l-${p.start}`} x={x(i)} y={H - 8} textAnchor="middle" className={styles.axisText}>
              {formatShortDate(p.start)}
            </text>
          ) : null,
        )}
      </svg>
      <p className={styles.legendNote}>Each point is one {unit} (India time). Orders are not shown: order tracking is not available yet.</p>
      <table className="visually-hidden">
        <caption>Inquiries per {unit}</caption>
        <thead>
          <tr>
            <th scope="col">Starting</th>
            <th scope="col">Inquiries</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.start}>
              <th scope="row">{formatDate(p.start)}</th>
              <td>{p.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
