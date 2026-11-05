"use client";

import { FormEvent, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SignInPrompt } from "@/components/ui/SignInPrompt";
import { postInquiry } from "@/lib/api/supplierInquiry";
import styles from "./ProductQuoteForm.module.css";

interface ProductQuoteFormProps {
  productId: string;
  productName: string;
  /** "quote" = Get Best Quote (message optional); "inquiry" = Send Inquiry (message required). */
  mode: "quote" | "inquiry";
  /** The quantity chosen above, as typed. Validated by the parent before anything is sent. */
  quantity: string;
  /** The unit the product is sold in, when known; the server checks it again. */
  unit?: string;
  /** Returns an error message when the quantity is not acceptable, or null. */
  checkQuantity: () => string | null;
  onSent?: () => void;
}

/**
 * Sends a quote request or an inquiry for one product. The supplier is resolved on the server from the
 * product, and the server validates the quantity against the product's MOQ and unit again. Success is
 * shown only after the server has stored the request.
 */
export function ProductQuoteForm({ productId, productName, mode, quantity, unit, checkQuantity, onSent }: ProductQuoteFormProps) {
  const [message, setMessage] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;

    const quantityError = checkQuantity();
    if (quantityError) {
      setStatus("error");
      setStatusMessage(quantityError);
      return;
    }
    if (mode === "inquiry" && message.trim().length < 10) {
      setFieldError("Write your question in at least 10 characters.");
      return;
    }
    setFieldError("");
    setStatus("submitting");
    setNeedsSignIn(false);

    const result = await postInquiry({ productId, quantity: quantity.trim(), unit, message: message.trim() || undefined, type: mode });
    if (result.status === "ok") {
      setStatus("ok");
      setStatusMessage(
        mode === "inquiry"
          ? `Your inquiry about ${productName} has been sent to the supplier. Reference: ${result.id}.`
          : `Your quote request for ${productName} has been sent to the supplier. Reference: ${result.id}.`,
      );
      setMessage("");
      onSent?.();
    } else {
      setStatus("error");
      setStatusMessage(result.fields?.quantity ?? result.message);
      setFieldError(result.fields?.message ?? "");
      setNeedsSignIn(Boolean(result.needsSignIn));
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <p className={styles.summary}>
        Quantity: <strong>{quantity.trim() || "not set"}</strong>
        {unit ? ` ${unit.toLowerCase()}` : ""} <span className={styles.hint}>(change it with the quantity selector above)</span>
      </p>
      <label className={styles.field}>
        <span className={styles.label}>{mode === "inquiry" ? "Your question" : "Message (optional)"}</span>
        <textarea
          className={styles.textarea}
          rows={3}
          maxLength={1000}
          placeholder={mode === "inquiry" ? "What would you like to ask the supplier?" : "Specifications, delivery location, timeline..."}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          aria-invalid={Boolean(fieldError)}
        />
        {fieldError && <span className={styles.fieldError}>{fieldError}</span>}
      </label>
      <Button type="submit" disabled={status === "submitting"}>
        <Send size={16} strokeWidth={2} aria-hidden />
        {status === "submitting" ? "Sending..." : mode === "inquiry" ? "Send Inquiry" : "Send Quote Request"}
      </Button>
      {statusMessage && (
        <p className={status === "ok" ? styles.ok : styles.error} role="status">
          {statusMessage}
        </p>
      )}
      {needsSignIn && <SignInPrompt className={styles.error} />}
    </form>
  );
}
