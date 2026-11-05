import { Check, Minus } from "lucide-react";
import clsx from "clsx";
import { formatSubmitted } from "@/lib/inquiries/confirmation";
import type { TimelineStep } from "@/lib/inquiries/timeline";
import styles from "./InquiryTimeline.module.css";

const STATE_LABEL: Record<TimelineStep["state"], string> = { done: "Completed", current: "Current step", upcoming: "Not reached yet", stopped: "Not applicable" };

/**
 * The steps of "What happens next", from the inquiry's real history: a step is marked completed only when its event
 * is recorded, and each state is also written out for assistive technology (colour and shape are not the only signal).
 */
export function InquiryTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className={styles.list} aria-label="Inquiry progress">
      {steps.map((step) => (
        <li key={step.key} className={clsx(styles.step, styles[step.state])} aria-current={step.state === "current" ? "step" : undefined}>
          <span className={styles.marker} aria-hidden>
            {step.state === "done" ? <Check size={18} strokeWidth={3} /> : step.state === "stopped" ? <Minus size={16} strokeWidth={3} /> : null}
          </span>
          <div className={styles.body}>
            <h3 className={styles.title}>
              {step.title}
              <span className="visually-hidden"> ({STATE_LABEL[step.state]})</span>
            </h3>
            <p className={styles.text}>{step.text}</p>
          </div>
          {step.at && (
            <time className={styles.when} dateTime={step.at}>
              {formatSubmitted(step.at)}
            </time>
          )}
        </li>
      ))}
    </ol>
  );
}
