export interface SupplierInquiryFormValues {
  product: string;
  quantity: string;
  unit: string;
  message: string;
}

export type SupplierInquiryFormErrors = Partial<Record<keyof SupplierInquiryFormValues, string>>;

export function validateSupplierInquiryForm(
  values: SupplierInquiryFormValues
): SupplierInquiryFormErrors {
  const errors: SupplierInquiryFormErrors = {};

  if (!values.product.trim()) {
    errors.product = "Select a product or requirement.";
  }

  if (!values.quantity.trim()) {
    errors.quantity = "Enter a quantity.";
  } else if (!/^\d+$/.test(values.quantity.trim())) {
    errors.quantity = "Quantity must be a number.";
  }

  if (!values.unit.trim()) {
    errors.unit = "Select a unit.";
  }

  return errors;
}
