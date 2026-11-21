"use client";

import { useCallback, useEffect, useState } from "react";
import auth from "@/components/auth/Auth.module.css";
import prof from "@/components/supplier/profile/SupplierProfile.module.css";
import { Dropdown } from "@/components/ui/Dropdown";
import { flashToast } from "@/components/ui/Toast";
import { REJECTION_REASONS } from "@/lib/supplier/productDraftRules";
import type { PendingRow, ReviewDetail } from "@/lib/admin/productReview";
import s from "./AdminInquiries.module.css";

const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

export function ProductReviewWorkspace() {
  const [items, setItems] = useState<PendingRow[] | null>(null);
  const [sel, setSel] = useState<ReviewDetail | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/product-review", { cache: "no-store" }).catch(() => null);
    const json = res?.ok ? await res.json().catch(() => null) : null;
    if (json?.ok) { setItems(json.data.items); setError(""); } else setError("Could not load the review queue.");
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function open(ref: string) {
    const res = await fetch(`/api/admin/product-review/${ref}`, { cache: "no-store" }).catch(() => null);
    const json = res?.ok ? await res.json().catch(() => null) : null;
    if (json?.ok) { setSel(json.data); setReason(""); setNote(""); setError(""); } else { setSel(null); flashToast("error", "Could not open this submission."); }
  }

  async function decide(decision: "APPROVE" | "REJECT") {
    if (!sel || busy) return;
    if (decision === "REJECT" && !reason) { setError("Choose a rejection reason the supplier will see."); return; }
    setBusy(true);
    const res = await fetch(`/api/admin/product-review/${sel.reference}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, expectedRevision: sel.revision, reasonCode: reason, internalNote: note }) }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (res?.ok && json.ok) { flashToast("success", json.message); setSel(null); void load(); return; }
    const msg = res ? (json.message ?? "Could not record the decision.") : "Network error. Nothing was recorded.";
    setError(msg);
    flashToast("error", "Not recorded. " + msg);
  }

  const reasonOptions = [{ value: "", label: "Select a reason" }, ...REJECTION_REASONS.map((r) => ({ value: r.code, label: r.text.split(".")[0] }))];
  return (
    <>
      {error && <p role="alert" className={s.err}>{error}</p>}
      <section className={s.panel} aria-label="Pending product reviews">
        {items === null ? <p className={s.empty}>Loading…</p> : items.length === 0 ? <p className={s.empty}>No product is waiting for review.</p> : (
          <ul className={s.cards} style={{ display: "grid" }}>
            {items.map((r) => (
              <li key={r.reference} className={s.card}>
                <div className={s.cardHead}><strong>{r.name}</strong><span className={s.badge}>Revision {r.revision}</span></div>
                <p style={{ margin: 0 }}>{r.company} · {r.category} · submitted {fmt(r.submittedAt)}</p>
                <button type="button" className={prof.btnSecondary} onClick={() => void open(r.reference)}>Review</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sel && (
        <section className={s.review} aria-labelledby="pr-title" tabIndex={-1}>
          <h2 id="pr-title">Reviewing: {sel.snapshot.name}</h2>
          <p className={s.hint}>This is the exact revision the supplier submitted ({sel.revision}), not their working copy.</p>
          <div className={s.reviewGrid}>
            <div>
              <h3>Description</h3><p className={s.box}>{sel.snapshot.description}</p>
              <h3>Category</h3><p>{sel.snapshot.categoryName}</p>
              <h3>SKU</h3><p>{sel.snapshot.sku || "None"}</p>
            </div>
            <div>
              <h3>Pricing</h3><p>{sel.snapshot.pricingMode === "ON_REQUEST" ? "Price on request" : `${sel.snapshot.currency} ${((sel.snapshot.unitPricePaise ?? 0) / 100).toFixed(2)} per ${sel.snapshot.priceUnit}`}</p>
              <h3>Specifications</h3>{sel.snapshot.specifications.length ? <ul>{sel.snapshot.specifications.map((x) => <li key={x.label}>{x.label}: {x.value}</li>)}</ul> : <p>None given (or this category has no specification fields).</p>}
              <h3>Minimum order</h3><p>{sel.snapshot.moq} {sel.snapshot.quantityUnit}</p>
              <h3>Images ({sel.snapshot.images.length})</h3>
              <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
                {sel.snapshot.images.map((i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i.url} src={i.url} alt={i.name} width={96} height={96} style={{ objectFit: "cover", borderRadius: 8 }} />
                ))}
              </div>
            </div>
            <div className={s.fullRow}>
              <div className={auth.field} style={{ maxWidth: 520 }}>
                <label htmlFor="pr-reason" className={auth.label}>Rejection reason (shown to the supplier)</label>
                <Dropdown id="pr-reason" value={reason} onChange={setReason} options={reasonOptions} />
              </div>
              <div className={auth.field} style={{ maxWidth: 520, marginTop: ".75rem" }}>
                <label htmlFor="pr-note" className={auth.label}>Internal note (never shown to the supplier)</label>
                <textarea id="pr-note" className={auth.control} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: ".75rem", marginTop: "1rem", flexWrap: "wrap" }}>
                <button type="button" className={prof.btnGold} disabled={busy} onClick={() => void decide("APPROVE")}>Approve revision {sel.revision}</button>
                <button type="button" className={prof.btnSecondary} disabled={busy} onClick={() => void decide("REJECT")}>Reject</button>
              </div>
              <p className={s.hint} style={{ marginTop: ".5rem" }}>Approving makes this revision eligible for public discovery. It does not verify the supplier.</p>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
