import type { CategoryShare, Section } from "@/lib/buyer/dashboard";
import { SectionError } from "./SectionError";
import styles from "./Dashboard.module.css";

const R = 54;
const C = 2 * Math.PI * R;

export function TopInquiryCategories({ section }: { section: Section<{ total: number; items: CategoryShare[] }> }) {
  return (
    <section className={styles.card} aria-labelledby="cat-title">
      <h2 id="cat-title" className={styles.cardTitle}>
        Top Categories by Inquiry
      </h2>
      {section.status === "error" ? <SectionError name="The category breakdown" /> : <Body total={section.data.total} items={section.data.items} />}
    </section>
  );
}

function Body({ total, items }: { total: number; items: CategoryShare[] }) {
  if (total === 0 || items.length === 0) return <p className={styles.emptyNote}>No inquiries in this period, so there is no category breakdown yet.</p>;
  let offset = 0;
  return (
    <div className={styles.donutWrap}>
      <svg viewBox="0 0 140 140" className={styles.donut} role="img" aria-label={`${total} inquiries by category: ${items.map((i) => `${i.name} ${i.percent}%`).join(", ")}`}>
        <circle cx="70" cy="70" r={R} className={styles.donutTrack} fill="none" />
        {items.map((item, index) => {
          const length = (item.count / total) * C;
          const el = <circle key={item.name} cx="70" cy="70" r={R} fill="none" className={`${styles.donutSegment} ${styles[`seg${index % 5}`]}`} strokeDasharray={`${length} ${C - length}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)" />;
          offset += length;
          return el;
        })}
        <text x="70" y="68" textAnchor="middle" className={styles.donutTotal}>
          {total}
        </text>
        <text x="70" y="86" textAnchor="middle" className={styles.axisText}>
          {total === 1 ? "Inquiry" : "Inquiries"}
        </text>
      </svg>
      <ul className={styles.donutLegend}>
        {items.map((item, index) => (
          <li key={item.name}>
            <span className={`${styles.swatch} ${styles[`swatchSeg${index % 5}`]}`} aria-hidden />
            <span className={styles.donutName}>{item.name}</span>
            <span className={styles.donutPercent}>
              {item.percent}% <span className="visually-hidden">({item.count} inquiries)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
