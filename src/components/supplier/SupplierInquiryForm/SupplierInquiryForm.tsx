"use client";

import { FormEvent, useEffect, useState } from "react";
import { Send, MessageSquare } from "lucide-react";
import clsx from "clsx";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SignInPrompt } from "@/components/ui/SignInPrompt";
import {
  validateSupplierInquiryForm,
  type SupplierInquiryFormErrors,
  type SupplierInquiryFormValues,
} from "@/lib/validations/supplierInquiry";
import { postInquiry } from "@/lib/api/supplierInquiry";
import { validateQuantity } from "@/lib/catalog/quantity";
import type { ProductCardData } from "@/types";
import styles from "./SupplierInquiryForm.module.css";

const UNIT_OPTIONS = [
  { label: "Select Unit", value: "" },
  { label: "Pieces", value: "Pieces" },
  { label: "Meters", value: "Meters" },
  { label: "Kg", value: "Kg" },
  { label: "Sets", value: "Sets" },
  { label: "Boxes", value: "Boxes" },
  { label: "Rolls", value: "Rolls" },
];

const initialValues: SupplierInquiryFormValues = {
  product: "",
  quantity: "",
  unit: "",
  message: "",
};

type Mode = "quote" | "inquiry";

/**
 * Contact form on a supplier profile. "Get Best Quote" and "Send Inquiry" (the header buttons, or the #get-best-quote
 * and #send-inquiry links) choose the mode; both are stored in `inquiries` for this supplier, resolved on the server.
 * When a product is chosen its unit is fixed to the product's own unit and its MOQ is checked, as the server does.
 */
export function SupplierInquiryForm({
  supplierId,
  supplierName,
  products,
}: {
  supplierId: string;
  supplierName: string;
  products: ProductCardData[];
}) {
  const [values, setValues] = useState(initialValues);
  const [mode, setMode] = useState<Mode>("quote");
  const [errors, setErrors] = useState<SupplierInquiryFormErrors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);

  // Links such as /suppliers/<slug>#send-inquiry pick the mode and bring the form into view.
  useEffect(() => {
    const open = (hash: string) => {
      if (hash === "#send-inquiry") setMode("inquiry");
      else if (hash === "#get-best-quote" || hash === "#contact") setMode("quote");
      else return;
      requestAnimationFrame(() => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    open(window.location.hash);
    const onHash = () => open(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const chosen = products.find((product) => product.id === values.product);
  const productUnit = chosen ? (chosen.moqUnit ?? chosen.priceUnit) : undefined;

  const productOptions = [
    { label: "Choose product or service", value: "" },
    ...products.map((product) => ({ label: product.name, value: product.id })),
    { label: "Other / Custom Requirement", value: "other" },
  ];

  function updateField<K extends keyof SupplierInquiryFormValues>(field: K, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function chooseProduct(value: string) {
    const product = products.find((p) => p.id === value);
    setValues((prev) => ({
      ...prev,
      product: value,
      // A product is sold in one unit and has its own minimum order.
      unit: product ? (product.moqUnit ?? product.priceUnit) : prev.unit,
      quantity: product?.moq !== undefined && !prev.quantity ? String(product.moq) : prev.quantity,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;

    const validationErrors = validateSupplierInquiryForm(values);
    if (!validationErrors.quantity && chosen) {
      const checked = validateQuantity(values.quantity, values.unit, {
        moq: chosen.moq !== undefined && chosen.moqUnit ? { quantity: chosen.moq, unit: chosen.moqUnit } : undefined,
        unit: chosen.priceUnit,
      });
      if (!checked.ok) validationErrors.quantity = checked.message;
    }
    if (mode === "inquiry" && values.message.trim().length < 10) validationErrors.message = "Write your question in at least 10 characters.";
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setStatus("submitting");
    setNeedsSignIn(false);
    const productId = values.product && values.product !== "other" ? values.product : undefined;
    const result = await postInquiry({
      supplierId: productId ? undefined : supplierId,
      productId,
      quantity: values.quantity.trim(),
      unit: values.unit || undefined,
      message: values.message.trim() || undefined,
      type: mode,
    });

    if (result.status === "ok") {
      setStatus("ok");
      setStatusMessage(`${mode === "inquiry" ? "Your inquiry" : "Your quote request"} has been sent to ${supplierName}. Reference: ${result.id}.`);
      setValues(initialValues);
    } else {
      setStatus("error");
      setStatusMessage(result.message);
      setNeedsSignIn(Boolean(result.needsSignIn));
      if (result.fields) setErrors(result.fields);
    }
  }

  return (
    <section id="contact" className={styles.card} aria-labelledby="inquiry-heading">
      <h2 id="inquiry-heading" className={styles.heading}>
        <MessageSquare size={18} strokeWidth={2} aria-hidden />
        {mode === "inquiry" ? "Send an Inquiry" : "Get the Best Quote"}
      </h2>
      <p className={styles.subtitle}>{mode === "inquiry" ? `Ask ${supplierName} a question` : `Get best quotes directly from ${supplierName}`}</p>

      <div className={styles.modes} role="group" aria-label="Type of request">
        {(["quote", "inquiry"] as const).map((option) => (
          <button key={option} type="button" className={clsx(styles.mode, mode === option && styles.modeOn)} aria-pressed={mode === option} onClick={() => setMode(option)}>
            {option === "quote" ? "Get Best Quote" : "Send Inquiry"}
          </button>
        ))}
      </div>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <Select
          label="Select Product / Requirement"
          options={productOptions}
          value={values.product}
          onChange={(event) => chooseProduct(event.target.value)}
          aria-invalid={Boolean(errors.product)}
        />
        {errors.product && <span className={styles.error}>{errors.product}</span>}

        <div className={styles.row}>
          <Input
            label="Quantity"
            placeholder={chosen?.moq !== undefined ? `Minimum ${chosen.moq}` : "Enter quantity"}
            inputMode="numeric"
            value={values.quantity}
            onChange={(event) => updateField("quantity", event.target.value)}
            error={errors.quantity}
          />
          {productUnit ? (
            <Input label="Unit" value={productUnit} readOnly aria-readonly="true" />
          ) : (
            <Select label="Unit" options={UNIT_OPTIONS} value={values.unit} onChange={(event) => updateField("unit", event.target.value)} aria-invalid={Boolean(errors.unit)} />
          )}
        </div>
        {errors.unit && <span className={styles.error}>{errors.unit}</span>}

        <label className={styles.field}>
          <span className={styles.label}>{mode === "inquiry" ? "Your question" : "Message (Optional)"}</span>
          <textarea
            className={styles.textarea}
            placeholder={mode === "inquiry" ? "What would you like to ask?" : "Tell us your requirement..."}
            rows={4}
            maxLength={1000}
            value={values.message}
            onChange={(event) => updateField("message", event.target.value)}
            aria-invalid={Boolean(errors.message)}
          />
          {errors.message && <span className={styles.error}>{errors.message}</span>}
        </label>

        <Button type="submit" className={styles.submit} disabled={status === "submitting"}>
          <Send size={16} strokeWidth={2} aria-hidden />
          {status === "submitting" ? "Sending..." : mode === "inquiry" ? "Send Inquiry" : "Send Quote Request"}
        </Button>

        {statusMessage && (
          <p className={status === "ok" ? styles.statusOk : styles.statusError} role="status">
            {statusMessage}
          </p>
        )}
        {needsSignIn && <SignInPrompt className={styles.statusError} />}
      </form>
    </section>
  );
}
