import type { RequirementFormValues } from "@/lib/validations/requirement";

export type SubmitRequirementResult =
  | { status: "ok" }
  | { status: "error"; message: string };

/**
 * Not wired to a real backend yet. There is no confirmed requirement/inquiry
 * API for Finbyn Mart's B2B relaunch at this stage of the project, so this
 * deliberately does not report success — see docs/EXISTING_WEBSITE_AUDIT.md
 * and docs/API_INTEGRATION.md once those exist. Replace this implementation
 * when the real endpoint is confirmed.
 */
export async function submitRequirement(
  values: RequirementFormValues
): Promise<SubmitRequirementResult> {
  void values;

  return {
    status: "error",
    message:
      "Requirement submission isn't connected to a backend yet. This form is UI-only until the real API is wired up.",
  };
}
