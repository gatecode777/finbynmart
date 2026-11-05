import { ArrowDownRight, ArrowUpRight, FileText, IndianRupee, MessageSquareText, Package, type LucideIcon } from "lucide-react";
import type { Section, Statistics } from "@/lib/buyer/dashboard";
import { formatCount } from "./format";
import { SectionError } from "./SectionError";
import styles from "./Dashboard.module.css";

function Comparison({ value, previous, change, days }: { value: number; previous: number; change: number | null; days: number }) {
  if (change !== null) {
    const up = change >= 0;
    const Icon = up ? ArrowUpRight : ArrowDownRight;
    return (
      <p className={styles.kpiNote}>
        <Icon size={16} aria-hidden className={up ? styles.up : styles.down} />
        <span>
          {up ? "+" : ""}
          {change}% vs the previous {days} days <span className="visually-hidden">({previous} before)</span>
        </span>
      </p>
    );
  }
  if (value === 0 && previous === 0) return <p className={styles.kpiNote}>No inquiries in this period or the one before it.</p>;
  return <p className={styles.kpiNote}>No inquiries in the previous {days} days to compare with.</p>;
}

function Card({ icon: Icon, label, tone, children }: { icon: LucideIcon; label: string; tone: string; children: React.ReactNode }) {
  return (
    <li className={`${styles.kpiCard} ${styles[tone]}`}>
      <span className={styles.kpiIcon}>
        <Icon size={24} aria-hidden />
      </span>
      <div className={styles.kpiBody}>
        <h3 className={styles.kpiLabel}>{label}</h3>
        {children}
      </div>
    </li>
  );
}

const NotYet = ({ reason }: { reason: string }) => (
  <>
    <p className={styles.kpiUnavailable}>Not available yet</p>
    <p className={styles.kpiNote}>{reason}</p>
  </>
);

export function BuyerStatsGrid({ section, days }: { section: Section<Statistics>; days: number }) {
  if (section.status === "error") return <SectionError name="The key figures" />;
  const s = section.data;
  return (
    <ul className={styles.kpiGrid} aria-label="Key figures">
      <Card icon={MessageSquareText} label="Total Inquiries" tone="toneMint">
        <p className={styles.kpiValue}>{formatCount(s.totalInquiries.value)}</p>
        <Comparison value={s.totalInquiries.value} previous={s.totalInquiries.previous} change={s.totalInquiries.changePercent} days={days} />
      </Card>
      <Card icon={FileText} label="Quotations Received" tone="toneCream">
        <NotYet reason={s.quotationsReceived.reason} />
      </Card>
      <Card icon={Package} label="Orders Placed" tone="toneBlue">
        <NotYet reason={s.ordersPlaced.reason} />
      </Card>
      <Card icon={IndianRupee} label="Total Order Value" tone="tonePurple">
        <NotYet reason={s.totalOrderValue.reason} />
      </Card>
    </ul>
  );
}
