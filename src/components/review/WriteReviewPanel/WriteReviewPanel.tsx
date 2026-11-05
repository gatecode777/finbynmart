"use client";

import { FormEvent, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Star, SquarePen } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { REVIEW_CATEGORIES, REVIEW_LIMITS, validateReviewInput } from "@/lib/reviews/rules";
import type { OwnReview } from "@/lib/reviews/types";
import styles from "./WriteReviewPanel.module.css";

interface WriteReviewPanelProps {
  supplierSlug: string;
  supplierName: string;
  /** What the server knows about the visitor: nobody, a supplier account, or a buyer. */
  viewer: "guest" | "supplier" | "buyer";
  /** The buyer's own live review of this supplier, if there is one. */
  existing: OwnReview | null;
}

interface Values {
  rating: number;
  title: string;
  text: string;
  categories: Record<string, string>;
  recommend: "" | "yes" | "no";
}

const EMPTY: Values = { rating: 0, title: "", text: "", categories: {}, recommend: "" };

const STATUS_TEXT: Record<string, string> = {
  PENDING: "Waiting for moderation. It is not public yet.",
  APPROVED: "Published.",
  REJECTED: "Not published.",
  HIDDEN: "Hidden by a moderator.",
};

/**
 * "Write a Review" panel. A visitor who is signed out is sent to sign in; a supplier account is told it cannot review;
 * a buyer gets the form, or the status of the review already written (with edit and delete while allowed). The same
 * rules as the server run before sending, but the server decides: success is shown only when it saved the review, and
 * it says the review is waiting for moderation, never that it is published.
 */
export function WriteReviewPanel({ supplierSlug, supplierName, viewer, existing }: WriteReviewPanelProps) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((previous) => ({ ...previous, [key]: value }));

  function payload() {
    const categoryRatings = Object.fromEntries(Object.entries(values.categories).filter(([, score]) => score !== "").map(([key, score]) => [key, Number(score)]));
    return {
      rating: values.rating || undefined,
      title: values.title,
      text: values.text,
      categoryRatings,
      wouldRecommend: values.recommend === "" ? null : values.recommend === "yes",
    };
  }

  function startEdit() {
    if (!existing) return;
    setValues({
      rating: existing.rating,
      title: existing.title,
      text: existing.text,
      categories: Object.fromEntries(Object.entries(existing.categoryRatings).map(([key, score]) => [key, String(score)])),
      recommend: existing.wouldRecommend === null ? "" : existing.wouldRecommend ? "yes" : "no",
    });
    setErrors({});
    setStatus("idle");
    setMessage("");
    setEditing(true);
    setOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    const checked = validateReviewInput(payload());
    if (!checked.ok) {
      setErrors(checked.fields);
      setStatus("error");
      setMessage("Check the highlighted fields.");
      return;
    }
    setErrors({});
    setStatus("submitting");
    setMessage("");
    try {
      const response = await fetch(editing && existing ? `/api/buyer/reviews/${existing.id}` : "/api/buyer/reviews", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload(), supplierId: supplierSlug }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok) {
        setStatus("ok");
        setMessage(data.message ?? "Your review was saved and is waiting for moderation.");
        setOpen(false);
        setEditing(false);
        setValues(EMPTY);
        router.refresh();
      } else {
        setStatus("error");
        setMessage(response.status === 401 ? "Your session has ended. Sign in again to continue." : (data.message ?? "Something went wrong. Please try again."));
        if (data.fields) setErrors(data.fields);
      }
    } catch {
      setStatus("error");
      setMessage("Couldn't reach the server. Check your connection and try again.");
    }
  }

  async function remove() {
    if (!existing) return;
    setStatus("submitting");
    try {
      const response = await fetch(`/api/buyer/reviews/${existing.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok) {
        setStatus("ok");
        setMessage(data.message ?? "Your review was deleted.");
        setConfirmDelete(false);
        router.refresh();
      } else {
        setStatus("error");
        setMessage(data.message ?? "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Couldn't reach the server. Check your connection and try again.");
    }
  }

  const live = message && (
    <p className={clsx(styles.notice, status === "error" ? styles.noticeError : styles.noticeOk)} role={status === "error" ? "alert" : "status"}>
      {message}
    </p>
  );

  return (
    <section className={styles.panel} aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className={styles.heading}>
        <SquarePen size={22} strokeWidth={1.75} aria-hidden />
        Write a Review
      </h2>

      {viewer === "guest" && (
        <>
          <p className={styles.text}>Have you worked with {supplierName}? Sign in with your buyer account to share your experience.</p>
          <Link href="/sign-in" className={styles.cta}>
            Sign in to Write a Review
            <ArrowRight size={18} strokeWidth={2.25} aria-hidden />
          </Link>
          <p className={styles.small}>
            New here? <Link href="/sign-up">Create a free buyer account</Link>.
          </p>
        </>
      )}

      {viewer === "supplier" && <p className={styles.text}>Supplier accounts cannot review suppliers. Sign in with a buyer account to write a review.</p>}

      {viewer === "buyer" && (
        <>
          {existing && !editing ? (
            <div className={styles.mine}>
              <p className={styles.text}>You have reviewed {supplierName}.</p>
              <p className={styles.mineTitle}>
                {existing.title} <span className={styles.mineRating}>({existing.rating}/5)</span>
              </p>
              <p className={clsx(styles.statusLine, existing.status === "APPROVED" && styles.statusOk)}>
                {STATUS_TEXT[existing.status] ?? existing.status}
                {existing.status === "REJECTED" && existing.moderationReason ? ` Reason: ${existing.moderationReason}` : ""}
              </p>
              <div className={styles.actions}>
                {existing.canEdit && (
                  <Button type="button" variant="secondary" onClick={startEdit}>
                    Edit review
                  </Button>
                )}
                {!confirmDelete ? (
                  <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}>
                    Delete review
                  </Button>
                ) : (
                  <span className={styles.confirm} role="group" aria-label="Confirm deleting your review">
                    <span>Delete this review?</span>
                    <Button type="button" onClick={remove} disabled={status === "submitting"}>
                      Yes, delete
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </Button>
                  </span>
                )}
              </div>
            </div>
          ) : !open ? (
            <>
              <p className={styles.text}>Have you worked with {supplierName}? Share your experience to help other buyers.</p>
              <button
                type="button"
                className={styles.cta}
                onClick={() => {
                  setOpen(true);
                  setStatus("idle");
                  setMessage("");
                }}
                aria-expanded={false}
              >
                Write a Review
                <ArrowRight size={18} strokeWidth={2.25} aria-hidden />
              </button>
            </>
          ) : null}

          {open && (
            <form className={styles.form} onSubmit={submit} noValidate aria-label={editing ? "Edit your review" : "Write a review"}>
              <fieldset className={styles.fieldset}>
                <legend className={styles.label}>Overall rating</legend>
                <div className={styles.stars} role="radiogroup" aria-label="Overall rating" aria-invalid={Boolean(errors.rating)}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <label key={n} className={styles.starLabel}>
                      <input type="radio" name={`${id}-rating`} value={n} checked={values.rating === n} onChange={() => set("rating", n)} className={styles.starInput} />
                      <Star size={30} strokeWidth={1.75} fill={values.rating >= n ? "currentColor" : "none"} className={clsx(styles.starIcon, values.rating >= n && styles.starOn)} aria-hidden />
                      <span className="visually-hidden">
                        {n} {n === 1 ? "star" : "stars"}
                      </span>
                    </label>
                  ))}
                </div>
                {errors.rating && <p className={styles.error}>{errors.rating}</p>}
              </fieldset>

              <div className={styles.field}>
                <label htmlFor={`${id}-title`} className={styles.label}>
                  Review title
                </label>
                <input
                  id={`${id}-title`}
                  className={clsx(styles.input, errors.title && styles.invalid)}
                  value={values.title}
                  onChange={(event) => set("title", event.target.value)}
                  maxLength={REVIEW_LIMITS.titleMax + 40}
                  placeholder="Sum up your experience"
                  aria-invalid={Boolean(errors.title)}
                  aria-describedby={errors.title ? `${id}-title-error` : undefined}
                  autoComplete="off"
                />
                {errors.title && (
                  <p id={`${id}-title-error`} className={styles.error}>
                    {errors.title}
                  </p>
                )}
              </div>

              <div className={styles.field}>
                <label htmlFor={`${id}-text`} className={styles.label}>
                  Your review
                </label>
                <textarea
                  id={`${id}-text`}
                  className={clsx(styles.textarea, errors.text && styles.invalid)}
                  value={values.text}
                  onChange={(event) => set("text", event.target.value)}
                  rows={5}
                  placeholder="What did you buy or discuss, and how was the quality, delivery and support?"
                  aria-invalid={Boolean(errors.text)}
                  aria-describedby={`${id}-text-hint${errors.text ? ` ${id}-text-error` : ""}`}
                />
                <p id={`${id}-text-hint`} className={styles.hint}>
                  {values.text.trim().length.toLocaleString("en-IN")} / {REVIEW_LIMITS.textMax.toLocaleString("en-IN")} characters (at least {REVIEW_LIMITS.textMin})
                </p>
                {errors.text && (
                  <p id={`${id}-text-error`} className={styles.error}>
                    {errors.text}
                  </p>
                )}
              </div>

              <fieldset className={styles.fieldset}>
                <legend className={styles.label}>Rate by topic (optional)</legend>
                <div className={styles.topics}>
                  {REVIEW_CATEGORIES.map((category) => (
                    <div key={category.value} className={styles.topic}>
                      <label htmlFor={`${id}-${category.value}`}>{category.label}</label>
                      <select
                        id={`${id}-${category.value}`}
                        className={styles.select}
                        value={values.categories[category.value] ?? ""}
                        onChange={(event) => set("categories", { ...values.categories, [category.value]: event.target.value })}
                      >
                        <option value="">Not rated</option>
                        {[5, 4, 3, 2, 1].map((n) => (
                          <option key={n} value={n}>
                            {n} {n === 1 ? "star" : "stars"}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                {errors.categoryRatings && <p className={styles.error}>{errors.categoryRatings}</p>}
              </fieldset>

              <fieldset className={styles.fieldset}>
                <legend className={styles.label}>Would you recommend this supplier? (optional)</legend>
                <div className={styles.radios}>
                  {(
                    [
                      ["yes", "Yes"],
                      ["no", "No"],
                      ["", "Skip"],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={label} className={styles.radio}>
                      <input type="radio" name={`${id}-recommend`} value={value} checked={values.recommend === value} onChange={() => set("recommend", value)} />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <p className={styles.hint}>Your review is checked by a moderator before it appears. It shows your first name and last initial, never your email.</p>
              <div className={styles.actions}>
                <Button type="submit" variant="accent" disabled={status === "submitting"}>
                  {status === "submitting" ? "Saving..." : editing ? "Save changes" : "Submit review"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setOpen(false);
                    setEditing(false);
                    setErrors({});
                    setStatus("idle");
                    setMessage("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </>
      )}

      {live}
    </section>
  );
}
