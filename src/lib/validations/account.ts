const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s-]{8,15}$/;

export function checkPassword(password: string): string | undefined {
  if (password.length < 8) return "Use at least 8 characters.";
  if (password.length > 128) return "Use 128 characters or fewer.";
  return undefined;
}

export interface SignInValues {
  email: string;
  password: string;
}
export type SignInErrors = Partial<Record<keyof SignInValues, string>>;

export function validateSignIn(values: SignInValues): SignInErrors {
  const errors: SignInErrors = {};
  if (!values.email.trim()) errors.email = "Enter your email address.";
  else if (!EMAIL.test(values.email.trim())) errors.email = "Enter a valid email address.";
  if (!values.password) errors.password = "Enter your password.";
  return errors;
}

export interface SignUpValues {
  name: string;
  email: string;
  password: string;
}
export type SignUpErrors = Partial<Record<keyof SignUpValues, string>>;

export function validateSignUp(values: SignUpValues): SignUpErrors {
  const errors: SignUpErrors = {};
  if (!values.name.trim()) errors.name = "Enter your name.";
  if (!values.email.trim()) errors.email = "Enter your email address.";
  else if (!EMAIL.test(values.email.trim())) errors.email = "Enter a valid email address.";
  const passwordError = checkPassword(values.password);
  if (passwordError) errors.password = passwordError;
  return errors;
}

export interface SupplierRegistrationValues {
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  offering: string;
  password: string;
}
export type SupplierRegistrationErrors = Partial<Record<keyof SupplierRegistrationValues, string>>;

export function validateSupplierRegistration(values: SupplierRegistrationValues): SupplierRegistrationErrors {
  const errors: SupplierRegistrationErrors = {};
  if (!values.businessName.trim()) errors.businessName = "Enter your business name.";
  if (!values.contactName.trim()) errors.contactName = "Enter a contact person's name.";
  if (!values.email.trim()) errors.email = "Enter your email address.";
  else if (!EMAIL.test(values.email.trim())) errors.email = "Enter a valid email address.";
  if (!values.phone.trim()) errors.phone = "Enter a phone number.";
  else if (!PHONE.test(values.phone.trim())) errors.phone = "Enter a valid phone number.";
  if (!values.city.trim()) errors.city = "Enter your city.";
  if (!values.offering.trim()) errors.offering = "Tell us what you supply.";
  const passwordError = checkPassword(values.password);
  if (passwordError) errors.password = passwordError;
  return errors;
}
