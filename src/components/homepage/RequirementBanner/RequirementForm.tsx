"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  validateRequirementForm,
  type RequirementFormErrors,
  type RequirementFormValues,
} from "@/lib/validations/requirement";
import styles from "./RequirementForm.module.css";

const initialValues: RequirementFormValues = {
  product: "",
  quantity: "",
  city: "",
};

interface RequirementFormProps {
  /** Prefills the product/service field (for example from a category page). */
  defaultProduct?: string;
  category?: string;
  subcategory?: string;
  /** Prefills the quantity (for example from a product page). */
  defaultQuantity?: string;
  /** Unit of the prefilled quantity, stored with the requirement. */
  unit?: string;
  supplierId?: string;
  /** Set from a supplier profile link: a requirement is never addressed to one company (use Send Inquiry for that). */
  supplierName?: string;
}

export function RequirementForm({ defaultProduct = "", defaultQuantity = "", supplierName }: RequirementFormProps) {
  const router = useRouter();
  const [values, setValues] = useState({ ...initialValues, product: defaultProduct, quantity: defaultQuantity });
  const [errors, setErrors] = useState<RequirementFormErrors>({});
  function updateField(field: keyof RequirementFormValues, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationErrors = validateRequirementForm(values);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    // the homepage strip only starts a requirement: the product must be chosen from the catalogue on the full form, which makes the real submission
    const params = new URLSearchParams({ product: values.product.trim(), quantity: values.quantity.trim(), city: values.city.trim() });
    router.push(`/post-requirement?${params}`);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {supplierName && (
        <p className={styles.supplierNote}>
          A requirement is shared with eligible matching suppliers, not one company. To contact <strong>{supplierName}</strong> directly, use Send Inquiry on its page.
        </p>
      )}
      <Input
        label="Product / service name"
        hideLabel
        placeholder="Enter product / service name..."
        value={values.product}
        onChange={(event) => updateField("product", event.target.value)}
        error={errors.product}
      />
      <Input
        label="Quantity"
        hideLabel
        placeholder="Quantity"
        inputMode="numeric"
        value={values.quantity}
        onChange={(event) => updateField("quantity", event.target.value)}
        error={errors.quantity}
      />
      <Input
        label="City"
        hideLabel
        placeholder="Enter your city"
        value={values.city}
        onChange={(event) => updateField("city", event.target.value)}
        error={errors.city}
      />
      <Button type="submit" className={styles.submit}>
        <Send size={16} strokeWidth={2} aria-hidden />
        Continue
      </Button>

    </form>
  );
}
