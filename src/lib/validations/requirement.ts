export interface RequirementFormValues {
  product: string;
  quantity: string;
  city: string;
}

export type RequirementFormErrors = Partial<Record<keyof RequirementFormValues, string>>;

export function validateRequirementForm(
  values: RequirementFormValues
): RequirementFormErrors {
  const errors: RequirementFormErrors = {};

  if (!values.product.trim()) {
    errors.product = "Enter a product or service name.";
  }

  if (!values.quantity.trim()) {
    errors.quantity = "Enter a quantity.";
  } else if (!/^\d+$/.test(values.quantity.trim())) {
    errors.quantity = "Quantity must be a number.";
  }

  if (!values.city.trim()) {
    errors.city = "Enter your city.";
  }

  return errors;
}
