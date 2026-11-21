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

/**
 * The structured "Post Your Requirement" form (client instant feedback AND the server's authoritative check). A requirement names ONE catalogue product
 * (the reference that describes the need and drives matching), a quantity, a delivery city, an optional required-by date and optional free text that
 * supplements (never replaces) the product. Dates are plain yyyy-mm-dd compared as text, so no time zone can move them.
 */
export interface PostRequirementValues {
  productId: string;
  quantity: string;
  city: string;
  requiredBy: string;
  description: string;
}
export type PostRequirementErrors = Partial<Record<keyof PostRequirementValues, string>>;
export const REQUIREMENT_LIMITS = { cityMin: 2, cityMax: 80, descriptionMin: 10, descriptionMax: 1000, quantityMax: 1_000_000, maxDaysAhead: 730 } as const;

const addDays = (isoDate: string, days: number) => new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export function validatePostRequirement(v: PostRequirementValues, todayIso: string): PostRequirementErrors {
  const e: PostRequirementErrors = {};
  if (!v.productId.trim()) e.productId = "Select the product that best describes your requirement.";
  const q = v.quantity.trim();
  if (!/^\d{1,7}$/.test(q) || Number(q) < 1 || Number(q) > REQUIREMENT_LIMITS.quantityMax) e.quantity = "Enter a whole number between 1 and 1,000,000.";
  const city = v.city.trim();
  if (city.length < REQUIREMENT_LIMITS.cityMin || city.length > REQUIREMENT_LIMITS.cityMax) e.city = `Enter the delivery city (${REQUIREMENT_LIMITS.cityMin} to ${REQUIREMENT_LIMITS.cityMax} characters).`;
  if (v.requiredBy.trim()) {
    const d = v.requiredBy.trim();
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(Date.parse(`${d}T00:00:00Z`)).toISOString().slice(0, 10) === d;
    if (!valid) e.requiredBy = "Enter a valid date.";
    else if (d < todayIso) e.requiredBy = "The required-by date cannot be in the past.";
    else if (d > addDays(todayIso, REQUIREMENT_LIMITS.maxDaysAhead)) e.requiredBy = "Choose a date within the next two years.";
  }
  const desc = v.description.trim();
  if (desc && (desc.length < REQUIREMENT_LIMITS.descriptionMin || desc.length > REQUIREMENT_LIMITS.descriptionMax)) e.description = `Write ${REQUIREMENT_LIMITS.descriptionMin} to ${REQUIREMENT_LIMITS.descriptionMax} characters, or leave it empty.`;
  return e;
}
