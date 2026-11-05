import { Star } from "lucide-react";
import styles from "./RatingStars.module.css";

/**
 * Five stars filled to `value` (to the nearest tenth, so 4.8 shows a nearly full fifth star). One text label for
 * assistive technology; the icons are decorative. Used for review ratings and the supplier average.
 */
export function RatingStars({ value, size = 18, label }: { value: number; size?: number; label?: string }) {
  const clamped = Math.min(5, Math.max(0, value));
  return (
    <span className={styles.stars} role="img" aria-label={label ?? `Rated ${clamped} out of 5`}>
      {[0, 1, 2, 3, 4].map((index) => {
        const fill = Math.round(Math.min(1, Math.max(0, clamped - index)) * 100);
        return (
          <span key={index} className={styles.star} style={{ width: size, height: size }} aria-hidden>
            <Star size={size} strokeWidth={1.75} className={styles.empty} />
            <span className={styles.fill} style={{ width: `${fill}%` }}>
              <Star size={size} strokeWidth={1.75} fill="currentColor" className={styles.full} />
            </span>
          </span>
        );
      })}
    </span>
  );
}
