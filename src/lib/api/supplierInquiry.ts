export type SubmitSupplierInquiryResult =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; needsSignIn?: boolean; fields?: Record<string, string> };

export interface InquiryPayload {
  /** Product key (catalog id or sample slug). Omit for a general inquiry to the supplier. */
  productId?: string;
  supplierId?: string;
  quantity: string;
  unit?: string;
  message?: string;
  /** "quote" (Get Best Quote, the default) or "inquiry" (Send Inquiry, which needs a message). */
  type?: "quote" | "inquiry";
}

/** Posts an inquiry to /api/inquiries. Success is reported only when the server stored it. */
export async function postInquiry(payload: InquiryPayload): Promise<SubmitSupplierInquiryResult> {
  try {
    const response = await fetch("/api/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
