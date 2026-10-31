import type { SignInValues, SignUpValues, SupplierRegistrationValues } from "@/lib/validations/account";

export type AccountResult =
  | { status: "ok"; user: { id: string; name: string; email: string; role: "buyer" | "supplier" } }
  | { status: "error"; message: string; fields?: Record<string, string> };

async function post(url: string, body: unknown): Promise<AccountResult> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (response.ok && data.ok) return { status: "ok", user: data.user };
    return { status: "error", message: data.message ?? "Something went wrong.", fields: data.fields };
  } catch {
    return { status: "error", message: "Couldn't reach the server. Check your connection and try again." };
  }
}

export const signIn = (values: SignInValues) => post("/api/auth/login", values);
export const signUp = (values: SignUpValues) => post("/api/auth/register", { ...values, role: "buyer" });
export const registerSupplier = (values: SupplierRegistrationValues) =>
  post("/api/auth/register", { ...values, role: "supplier" });
export const signOut = () => fetch("/api/auth/logout", { method: "POST" });
