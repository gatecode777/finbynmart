import { Star, ThumbsUp, Package } from "lucide-react";
import { RatingStars } from "@/components/ui/RatingStars";
import type { ReviewMetrics, ReviewSummary as Summary } from "@/lib/reviews/engine";
import { formatCount } from "@/lib/utils/format";
import styles from "./ReviewSummary.module.css";

/**
 * Average, distribution and the metrics that have a real source. Everything is computed from the supplier's published
 * reviews; with none there is no average at all (never "0.0"), only a plain statement. A metric card appears only when
 * buyers actually answered that question (there is no response-time metric: no inquiry response records exist).
 */
export function ReviewSummary({ summary, metrics }: { summary: Summary; metrics: ReviewMetrics }) {
  if (summary.total === 0) {
    return (
      <section className={styles.empty} aria-label="Rating summary">
        <span className={styles.emptyIcon} aria-hidden>
          <Star size={32} strokeWidth={1.5} />
        </span>
        <div>
          <p className={styles.emptyTitle}>No ratings yet</p>
          <p className={styles.emptyText}>This supplier has no published reviews, so there is no average rating to show.</p>
        </div>
      </section>
    );
  }

  const cards = [
    metrics.wouldRecommend && {
      key: "recommend",
      icon: ThumbsUp,
      value: `${metrics.wouldRecommend.percent}%`,
      label: "Would Recommend",
      note: `${formatCount(metrics.wouldRecommend.yes)} of ${formatCount(metrics.wouldRecommend.answered)} who answered`,
    },
    metrics.productQuality && {
      key: "quality",
      icon: Package,
      value: `${metrics.productQuality.average.toFixed(1)}/5`,
      label: "Product Quality",
      note: `${formatCount(metrics.productQuality.count)} ${metrics.productQuality.count === 1 ? "rating" : "ratings"}`,
    },
  ].filter((card): card is NonNullable<typeof card> => Boolean(card));

  return (
    <section className={styles.summary} aria-label="Rating summary">
      <div className={styles.overall}>
        <p className={styles.average}>
          <span className={styles.averageValue}>{summary.average?.toFixed(1)}</span>
          <span className={styles.outOf}> / 5</span>
        </p>
        <RatingStars value={summary.average ?? 0} size={22} label={`Average rating ${summary.average?.toFixed(1)} out of 5`} />
        <p className={styles.based}>
          Based on {formatCount(summary.total)} published {summary.total === 1 ? "review" : "reviews"}
        </p>
      </div>

      <div className={styles.breakdown}>
        <h3 className={styles.breakdownTitle}>Rating Breakdown</h3>
        <ul className={styles.rows}>
          {summary.distribution.map((row) => (
            <li key={row.rating} className={styles.row}>
              <span className={styles.rowLabel}>
                {row.rating}
                <Star size={14} strokeWidth={1.75} fill="currentColor" className={styles.rowStar} aria-hidden />
                <span className="visually-hidden"> star</span>
              </span>
              <span className={styles.bar} aria-hidden>
                <span className={styles.barFill} style={{ width: `${row.percent}%` }} />
              </span>
              <span className={styles.rowValue}>
                {row.percent}% ({formatCount(row.count)})
              </span>
            </li>
          ))}
        </ul>
      </div>

      {cards.length > 0 && (
        <ul className={styles.metrics} aria-label="Buyer feedback highlights">
          {cards.map(({ key, icon: Icon, value, label, note }) => (
            <li key={key} className={styles.metric}>
              <span className={styles.metricIcon} aria-hidden>
                <Icon size={30} strokeWidth={1.5} />
              </span>
              <span className={styles.metricValue}>{value}</span>
              <span className={styles.metricLabel}>{label}</span>
              <span className={styles.metricNote}>{note}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
