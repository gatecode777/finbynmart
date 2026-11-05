import { BadgeCheck } from "lucide-react";
import { formatDate, todayInIndia } from "@/lib/certifications/expiry";
import type { PublicReview } from "@/lib/reviews/types";
import { RatingStars } from "@/components/ui/RatingStars";
import styles from "./ReviewCard.module.css";

/**
 * One published review. Only the public name (first name and last initial) is shown, with initials in place of a
 * photo; the text is rendered as plain text (React escapes it), so submitted markup can never run. The Verified
 * Buyer badge appears only for a review that carries order evidence, which the platform does not have yet.
 */
export function ReviewCard({ review }: { review: PublicReview }) {
  const date = todayInIndia(new Date(review.publishedAt));
  const headingId = `review-${review.id}`;

  return (
    <article className={styles.card} aria-labelledby={headingId}>
      <div className={styles.top}>
        <span className={styles.avatar} aria-hidden>
          {review.initials}
        </span>
        <div className={styles.who}>
          <p className={styles.name}>
            {review.displayName}
            {review.verified && (
              <span className={styles.verified}>
                <BadgeCheck size={13} strokeWidth={2.25} aria-hidden />
                Verified Buyer
              </span>
            )}
          </p>
          <p className={styles.date}>
            <time dateTime={date}>{formatDate(date)}</time>
          </p>
        </div>
        <p className={styles.rating}>
          <RatingStars value={review.rating} size={16} label={`Rated ${review.rating} out of 5`} />
          <span className={styles.score}>{review.rating.toFixed(1)}</span>
        </p>
      </div>

      <h3 id={headingId} className={styles.title}>
        {review.title}
      </h3>
      <p className={styles.text}>{review.text}</p>

      {(review.categories.length > 0 || review.wouldRecommend !== null) && (
        <ul className={styles.tags} aria-label="Ratings by topic">
          {review.categories.map((category) => (
            <li key={category.value} className={styles.tag}>
              {category.label}: {category.rating}/5
            </li>
          ))}
          {review.wouldRecommend !== null && <li className={styles.tag}>{review.wouldRecommend ? "Would recommend" : "Would not recommend"}</li>}
        </ul>
      )}
    </article>
  );
}
