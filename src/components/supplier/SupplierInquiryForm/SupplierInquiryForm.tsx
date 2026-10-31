"use client";

import { FormEvent, useState } from "react";
import { Send, MessageSquare } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  validateSupplierInquiryForm,
  type SupplierInquiryFormErrors,
  type SupplierInquiryFormValues,
} from "@/lib/validations/supplierInquiry";
import { submitSupplierInquiry } from "@/lib/api/supplierInquiry";
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
  const [errors, setErrors] = useState<SupplierInquiryFormErrors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");

  const productOptions = [
    { label: "Choose product or service", value: "" },
    ...products.map((product) => ({ label: product.name, value: product.id })),
    { label: "Other / Custom Requirement", value: "other" },
  ];

  function updateField<K extends keyof SupplierInquiryFormValues>(field: K, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (status === "submitting") {
      return;
    }

    const validationErrors = validateSupplierInquiryForm(values);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setStatus("submitting");
    const result = await submitSupplierInquiry(supplierId, values);

    if (result.status === "ok") {
      setStatus("ok");
      setStatusMessage("Your inquiry has been sent.");
      setValues(initialValues);
    } else {
      setStatus("error");
      setStatusMessage(result.message);
    }
  }

  return (
    <section id="contact" className={styles.card} aria-labelledby="inquiry-heading">
      <h2 id="inquiry-heading" className={styles.heading}>
        <MessageSquare size={18} strokeWidth={2} aria-hidden />
        Send Business Inquiry
      </h2>
      <p className={styles.subtitle}>Get best quotes directly from {supplierName}</p>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <Select
          label="Select Product / Requirement"
          options={productOptions}
          value={values.product}
          onChange={(event) => updateField("product", event.target.value)}
          aria-invalid={Boolean(errors.product)}
        />
        {errors.product && <span className={styles.error}>{errors.product}</span>}

        <div className={styles.row}>
          <Input
            label="Quantity"
            placeholder="Enter quantity"
            inputMode="numeric"
            value={values.quantity}
            onChange={(event) => updateField("quantity", event.target.value)}
            error={errors.quantity}
          />
          <Select
            label="Unit"
            options={UNIT_OPTIONS}
            value={values.unit}
            onChange={(event) => updateField("unit", event.target.value)}
            aria-invalid={Boolean(errors.unit)}
          />
        </div>
        {errors.unit && <span className={styles.error}>{errors.unit}</span>}

        <label className={styles.field}>
          <span className={styles.label}>Message (Optional)</span>
          <textarea
            className={styles.textarea}
            placeholder="Tell us your requirement..."
            rows={4}
            value={values.message}
            onChange={(event) => updateField("message", event.target.value)}
          />
        </label>

        <Button type="submit" className={styles.submit} disabled={status === "submitting"}>
          <Send size={16} strokeWidth={2} aria-hidden />
          {status === "submitting" ? "Sending..." : "Send Inquiry"}
        </Button>

        {statusMessage && (
          <p
            className={status === "ok" ? styles.statusOk : styles.statusError}
            role="status"
          >
            {statusMessage}
          </p>
        )}
      </form>
    </section>
  );
}
