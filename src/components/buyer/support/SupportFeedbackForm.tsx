"use client";

import { FormEvent, useId, useState } from "react";
import { Send, Star } from "lucide-react";
import { FEEDBACK_MAX } from "@/lib/support/conversationRules";
import inq from "../inquiries/Inquiries.module.css";
import styles from "./Support.module.css";
import t from "./TicketDetails.module.css";

/** One rating of 1 to 5 and an optional comment. Saved once per ticket; success is shown only after the server saved it. */
export function SupportFeedbackForm({ reference, onSaved }: { reference: string; onSaved: (rating: number, submittedLabel: string) => void }) {
  const id = useId();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (rating < 1) {
      setError("Choose a rating from 1 to 5.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(`/api/buyer/support/tickets/${reference}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating, ...(text.trim() ? { feedbackText: text.trim() } : {}) }) });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ok) {
        onSaved(body.data.rating, body.data.submittedLabel);
        return;
      }
      if (response.status === 409 && body?.code === "ALREADY_SUBMITTED") {
        onSaved(rating, "");
        return;
      }
      setError(body?.fields?.rating ?? body?.fields?.feedbackText ?? body?.message ?? "Your feedback could not be saved.");
    } catch {
      setError("Could not reach the server. Your feedback was not saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-busy={busy}>
      <fieldset className={t.stars} aria-describedby={error ? `${id}-err` : undefined}>
        <legend className="visually-hidden">Rating from 1 to 5</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" className={`${t.starBtn} ${n <= rating ? t.starOn : ""}`} aria-pressed={rating === n} aria-label={`${n} ${n === 1 ? "star" : "stars"}`} onClick={() => setRating(n)} disabled={busy}>
            <Star size={26} aria-hidden />
          </button>
        ))}
      </fieldset>
      <label htmlFor={`${id}-text`} className="visually-hidden">Tell us about your support experience (optional)</label>
      <textarea id={`${id}-text`} className={styles.textarea} value={text} maxLength={FEEDBACK_MAX} onChange={(e) => setText(e.target.value)} placeholder="Tell us about your support experience (Optional)..." disabled={busy} />
      <p className={styles.counter}>{text.length} / {FEEDBACK_MAX}</p>
      {error && <p className={styles.error} id={`${id}-err`} role="alert">{error}</p>}
      <button type="submit" className={`${inq.btn} ${inq.btnPrimary}`} disabled={busy || rating < 1}><Send size={16} aria-hidden /> {busy ? "Saving..." : "Submit Feedback"}</button>
    </form>
  );
}
