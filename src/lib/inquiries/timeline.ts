/**
 * What an inquiry's status and history say, in words a buyer can read. Pure (no runtime imports), so the server builds
 * the confirmation page from it and node can unit-test it directly.
 *
 * Rules (also in the page spec):
 *  - A step is shown as done only when the history holds the event that makes it so. Nothing is inferred from a later
 *    status and no future step is ever shown as done.
 *  - No response deadline is invented: there is no supplier SLA in the platform, so the wording is "timing depends on
 *    the supplier".
 *  - There is no messaging, so there is no "further discussion" step.
 *  - The notification line says exactly what the record says. With no notification service, the state is
 *    "not_configured" and the page never says the supplier was told.
 */

export type StepState = "done" | "current" | "upcoming" | "stopped";

export interface TimelineStep {
  key: "submitted" | "review" | "response" | "outcome";
  title: string;
  text: string;
  state: StepState;
  /** ISO timestamp of the event, only when it really happened. */
  at: string | null;
}

export interface HistoryEntry {
  from: string | null;
  to: string;
  /** ISO timestamp. */
  at: string;
  reason?: string;
}

const KNOWN = ["NEW", "NOTIFIED", "IN_PROGRESS", "REPLIED", "QUOTED", "CLOSED", "CANCELLED", "REJECTED"] as const;
const TERMINAL = ["CLOSED", "CANCELLED", "REJECTED"];

export const STATUS_INFO: Record<string, { label: string; text: string }> = {
  NEW: { label: "New", text: "Your inquiry is saved and waiting to be processed." },
  NOTIFIED: { label: "Supplier notified", text: "The supplier was notified according to the notification settings." },
  IN_PROGRESS: { label: "In progress", text: "The supplier, or an authorised team, is handling your inquiry." },
  REPLIED: { label: "Replied", text: "The supplier has replied to your inquiry." },
  QUOTED: { label: "Quoted", text: "A quotation is linked to your inquiry." },
  CLOSED: { label: "Closed", text: "This inquiry is closed." },
  CANCELLED: { label: "Cancelled", text: "This inquiry was cancelled." },
  REJECTED: { label: "Rejected", text: "This inquiry was rejected." },
};

/** A stored status as one of the known ones; older records say "new". */
export function normalise(status: string | undefined): string {
  const upper = (status ?? "NEW").toUpperCase();
  return (KNOWN as readonly string[]).includes(upper) ? upper : "NEW";
}

export const statusInfo = (status: string | undefined) => STATUS_INFO[normalise(status)];

export type NotificationState = "not_configured" | "pending" | "processing" | "sent" | "failed" | "retry";

/**
 * The buyer-facing meaning of the stored notification record. "Sent" means accepted by a provider, which is not the same
 * as delivered or read, so the words never say the supplier "received" anything.
 */
export function notificationInfo(stored: string | undefined): { state: NotificationState; label: string } {
  switch ((stored ?? "").toUpperCase()) {
    case "PENDING":
      return { state: "pending", label: "Supplier notification is waiting to be processed." };
    case "PROCESSING":
      return { state: "processing", label: "Supplier notification is being processed." };
    case "SENT":
      return { state: "sent", label: "A notification was handed to the delivery provider. This does not confirm that the supplier has read it." };
    case "FAILED":
      return { state: "failed", label: "The supplier notification could not be sent. Your inquiry is saved." };
    case "RETRY":
      return { state: "retry", label: "The supplier notification failed once and will be tried again. Your inquiry is saved." };
    default:
      return { state: "not_configured", label: "Supplier notification is not set up yet, so the supplier is not told automatically. Your inquiry is saved." };
  }
}

const firstAt = (history: HistoryEntry[], statuses: string[]): string | null => history.find((entry) => statuses.includes(entry.to.toUpperCase()))?.at ?? null;

/** The steps of "What happens next", from the real history. */
export function buildTimeline(status: string | undefined, history: HistoryEntry[], createdAt: string): TimelineStep[] {
  const current = normalise(status);
  const stopped = TERMINAL.includes(current);

  const notifiedAt = firstAt(history, ["NOTIFIED"]);
  const reviewAt = firstAt(history, ["IN_PROGRESS", "REPLIED", "QUOTED"]);
  const repliedAt = firstAt(history, ["REPLIED", "QUOTED"]);
  const quotedAt = firstAt(history, ["QUOTED"]);
  const endAt = stopped ? ([...history].reverse().find((entry) => entry.to.toUpperCase() === current)?.at ?? null) : null;

  const steps: TimelineStep[] = [
    { key: "submitted", title: "Inquiry Submitted", text: "Your inquiry has been received and saved.", state: "done", at: createdAt },
  ];

  steps.push(
    reviewAt
      ? { key: "review", title: "Supplier Review", text: "The supplier has started handling your inquiry.", state: "done", at: reviewAt }
      : {
          key: "review",
          title: "Supplier Review",
          text: stopped ? "No supplier review was recorded before this inquiry ended." : notifiedAt ? "The supplier was notified. Waiting for them to review your requirement." : "Waiting for the supplier to review your requirement.",
          state: stopped ? "stopped" : "current",
          at: null,
        },
  );

  if (repliedAt) {
    steps.push({
      key: "response",
      title: quotedAt ? "Quotation Received" : "Supplier Response",
      text: quotedAt ? "A quotation is linked to your inquiry." : "The supplier has replied to your inquiry.",
      state: "done",
      at: quotedAt ?? repliedAt,
    });
  } else {
    steps.push({
      key: "response",
      title: "Supplier Response / Quotation",
      text: stopped ? "No supplier response or quotation was recorded." : "You will see the supplier's response or quotation here. Response timing depends on the supplier.",
      state: stopped ? "stopped" : reviewAt ? "current" : "upcoming",
      at: null,
    });
  }

  if (stopped) {
    const label = STATUS_INFO[current].label;
    steps.push({ key: "outcome", title: `Inquiry ${label}`, text: STATUS_INFO[current].text, state: "done", at: endAt });
  }
  return steps;
}
