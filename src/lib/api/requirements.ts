import type { RequirementFormValues } from "@/lib/validations/requirement";

export type SubmitRequirementResult =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; needsSignIn?: boolean; fields?: Record<string, string> };

export interface RequirementContext {
  category?: string;
  subcategory?: string;
  unit?: string;
  /** Supplier slug or id the requirement is addressed to; the server resolves it. */
  supplierId?: string;
}

/** Posts the requirement to /api/requirements. Success is reported only when the server stored it. */
export async function submitRequirement(
  values: RequirementFormValues,
  context: RequirementContext = {},
): Promise<SubmitRequirementResult> {
  try {
    const response = await fetch("/api/requirements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, ...context }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.ok) return { status: "ok", id: data.id };
    return {
      status: "error",
      message: data.message ?? "Something went wrong. Please try again.",
      needsSignIn: response.status === 401,
      fields: data.fields,
    };
  } catch {
    return { status: "error", message: "Couldn't reach the server. Check your connection and try again." };
  }
}
