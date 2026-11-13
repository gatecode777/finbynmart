"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { flashToast } from "@/components/ui/Toast";
import inq from "@/components/buyer/inquiries/Inquiries.module.css";
import d from "./Quotations.module.css";

/**
 * Shown only for an ACCEPTED quotation of this buyer. Accepting recorded a decision; this is the separate, explicit step that places the order
 * (no payment is taken). It asks the server first and offers the button only when the server says it is allowed; success is shown after the server answered.
 */
export function ConfirmOrderPanel({ reference }: { reference: string }) {
  const [state, setState] = useState<{ eligible: boolean; order: { reference: string } | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef("");

  useEffect(() => {
    key.current = crypto.randomUUID();
    void (async () => {
      const res = await fetch(`/api/buyer/quotations/${encodeURIComponent(reference)}/confirm-order`, { cache: "no-store" }).catch(() => null);
      const json = res?.ok ? await res.json().catch(() => null) : null;
      if (json?.ok) setState(json.data);
    })();
  }, [reference]);

  if (!state || (!state.eligible && !state.order)) return null;

  async function confirm() {
    if (busy) return;
    if (!window.confirm("Place this order from the accepted quotation? No payment is taken now.")) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/buyer/quotations/${encodeURIComponent(reference)}/confirm-order`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: key.current }) }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (res?.ok && json.ok) {
      flashToast("success", json.message ?? "Order confirmed.");
      setState({ eligible: false, order: { reference: json.data.reference } });
      return;
    }
    const msg = res ? (json.message ?? "The order could not be confirmed.") : "Could not reach the server. Nothing was created.";
    setError(msg);
    flashToast("error", "Order not confirmed. " + msg);
  }

  return (
    <section className={`${d.noPrint}`} aria-label="Order confirmation" style={{ margin: "1rem 0", padding: "1rem 1.25rem", border: "1px solid var(--border)", borderRadius: 12, background: "#fff" }}>
      {state.order ? (
        <p style={{ margin: 0, display: "flex", gap: ".5rem", alignItems: "center" }}>
          <CheckCircle2 size={18} aria-hidden /> Order <strong>{state.order.reference}</strong> was confirmed from this quotation. <Link href={`/buyer/orders/${state.order.reference}`}>View order</Link>
        </p>
      ) : (
        <>
          <p style={{ margin: "0 0 .5rem" }}><strong>Confirm the order.</strong> You accepted this quotation. Confirming places one order at the accepted price and terms. No payment is taken.</p>
          {error && <p role="alert" style={{ color: "#b42318", margin: "0 0 .5rem" }}>{error}</p>}
          <button type="button" className={`${d.btn} ${inq.btnPrimary}`} onClick={() => void confirm()} disabled={busy}>{busy ? "Confirming…" : "Confirm order"}</button>
        </>
      )}
    </section>
  );
}
