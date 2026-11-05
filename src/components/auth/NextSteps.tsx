import { Check, Circle, Info } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import styles from "./Auth.module.css";

export interface NextStep {
  text: string;
  /** "done": it has happened and the server confirmed it. "todo": still to do. "info": advice, not a step. */
  status: "done" | "todo" | "info";
}

/** The "What happens next?" panel. A step shows a tick only when it is actually complete; later steps stay open. */
export function NextSteps({ steps, supportHref }: { steps: NextStep[]; supportHref: string }) {
  return (
    <section className={styles.nextSteps} aria-labelledby="next-steps-title">
      <h2 id="next-steps-title" className={styles.nextStepsTitle}>
        <Info size={20} aria-hidden /> What happens next?
      </h2>
      <ul className={styles.nextStepsList}>
        {steps.map((step) => (
          <li key={step.text} className={clsx(styles.nextStep, step.status === "done" && styles.nextStepDone)}>
            {step.status === "done" ? <Check size={18} aria-hidden /> : step.status === "todo" ? <Circle size={18} aria-hidden /> : <Info size={18} aria-hidden />}
            <span>
              {step.text}
              <span className="visually-hidden">{step.status === "done" ? " (done)" : step.status === "todo" ? " (still to do)" : ""}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className={styles.nextStepsHelp}>
        If you did not make this change, please{" "}
        <Link className={styles.link} href={supportHref}>
          contact support
        </Link>{" "}
        immediately.
      </p>
    </section>
  );
}
