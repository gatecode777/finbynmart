import type { PostRequirementValues } from "@/lib/validations/requirement";

export type SubmitRequirementResult =
  | { status: "ok"; id: string; reference: string; href: string; replay: boolean; distribution: { state: string; label: string } | null }
  | { status: "error"; message: string; needsSignIn?: boolean; fields?: Record<string, string> };

/**
 * Posts a structured requirement to /api/requirements. Success is reported only when the server stored it (with its real reference and distribution state).
 * `idempotencyKey` is made once per form, so a double click or a retry after a lost response is the same requirement.
 */
export async function submitRequirement(values: PostRequirementValues, unit: string, idempotencyKey: string, attributes?: Record<string, { value: string; unit: string }>): Promise<SubmitRequirementResult> {
  try {
    const response = await fetch("/api/requirements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, unit, idempotencyKey, ...(attributes ? { attributes } : {}) }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.ok) return { status: "ok", id: data.id, reference: data.reference, href: data.href, replay: Boolean(data.replay), distribution: data.distribution ?? null };
    return { status: "error", message: data.message ?? "Something went wrong. Please try again.", needsSignIn: response.status === 401, fields: data.fields };
  } catch {
    return { status: "error", message: "Couldn't reach the server. Check your connection and try again." };
  }
}
