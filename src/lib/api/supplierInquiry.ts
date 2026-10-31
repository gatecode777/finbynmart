import type { SupplierInquiryFormValues } from "@/lib/validations/supplierInquiry";

export type SubmitSupplierInquiryResult =
  | { status: "ok" }
  | { status: "error"; message: string };

/**
 * Not wired to a real backend yet. There is no confirmed inquiry/quotation
 * API for Finbyn Mart's B2B relaunch at this stage of the project, so this
 * deliberately does not report success — mirrors src/lib/api/requirements.ts.
 * Replace this implementation when the real endpoint is confirmed.
 */
export async function submitSupplierInquiry(
  supplierId: string,
  values: SupplierInquiryFormValues
): Promise<SubmitSupplierInquiryResult> {
  void supplierId;
  void values;

  return {
    status: "error",
    message:
      "Inquiry submission isn't connected to a backend yet. This form is UI-only until the real API is wired up.",
  };
}
