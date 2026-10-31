import { formatCount } from "@/lib/utils/format";
import styles from "./ResultSummary.module.css";

interface ResultSummaryProps {
  page: number;
  pageSize: number;
  total: number;
  noun: string;
}

export function ResultSummary({ page, pageSize, total, noun }: ResultSummaryProps) {
  if (total === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <p className={styles.summary} role="status">
      Showing {formatCount(start)}–{formatCount(end)} of {formatCount(total)} {noun}
    </p>
  );
}
