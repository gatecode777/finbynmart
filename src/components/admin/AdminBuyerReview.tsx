"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { MessageSquareText, X } from "lucide-react";
import auth from "@/components/auth/Auth.module.css";
import prof from "@/components/supplier/profile/SupplierProfile.module.css";
import { flashToast } from "@/components/ui/Toast";
import { REACTIVATE_EFFECTS, SUSPEND_EFFECTS, cleanReason, validateReason, type BuyerAction } from "@/lib/admin/buyerRules";
import { REASON_MAX } from "@/lib/admin/inquiryRules";
import type { BuyerDetail } from "@/lib/admin/buyerManagement";
import s from "./AdminInquiries.module.css";
import m from "./AdminInquiryManagement.module.css";

const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
type Load = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string; status: number } | { kind: "ok"; data: BuyerDetail };

/** Buyer detail drawer plus the status confirmation. Nothing changes on screen until the server confirmed it; the request key is stable across retries of the same request. */
export function AdminBuyerReview({ id, canManage, onClose, onChanged }: { id: string | null; canManage: boolean; onClose: () => void; onChanged: () => void }) {
  const uid = useId();
  const drawer = useRef<HTMLDialogElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<Load>({ kind: "idle" });
  const [tick, setTick] = useState(0);
  const [action, setAction] = useState<BuyerAction | null>(null);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const keyRef = useRef<{ sig: string; key: string } | null>(null);
  const submitting = useRef(false);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!id) { if (drawer.current?.open) drawer.current.close(); return; }
    if (!drawer.current?.open) drawer.current?.showModal();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const ctl = new AbortController();
    setDetail((d) => (d.kind === "ok" && d.data.id === id ? d : { kind: "loading" }));
    void (async () => {
      const res = await fetch(`/api/admin/buyers/${id}`, { cache: "no-store", signal: ctl.signal }).catch(() => null);
      if (ctl.signal.aborted) return;
      const json = res ? await res.json().catch(() => null) : null;
      setDetail(res?.ok && json?.ok ? { kind: "ok", data: json.data } : { kind: "error", status: res?.status ?? 0, message: res?.status === 403 ? "You do not have permission to view buyer accounts." : json?.message ?? (res ? "Could not load this buyer." : "Network error. Check your connection and retry.") });
    })();
    return () => ctl.abort();
  }, [id, tick]);

  const d = detail.kind === "ok" ? detail.data : null;
  const keyFor = (sig: string) => { if (!keyRef.current || keyRef.current.sig !== sig) keyRef.current = { sig, key: crypto.randomUUID() }; return keyRef.current.key; };
  const reasonError = (touched ? validateReason(cleanReason(reason)) : null) ?? fieldErrors.reason ?? null;

  function openAction(a: BuyerAction) {
    setAction(a); setReason(""); setTouched(false); setServerError(""); setFieldErrors({}); keyRef.current = null;
    dialog.current?.showModal();
  }

  async function submit() {
    if (!action || !id || !d || submitting.current) return;
    setTouched(true);
    const text = cleanReason(reason);
    if (validateReason(text)) return;
    submitting.current = true; setBusy(true); setServerError(""); setFieldErrors({});
    const sig = JSON.stringify([action, text, d.revision]);
    const res = await fetch(`/api/admin/buyers/${id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason: text, expectedRev: d.revision, idempotencyKey: keyFor(sig) }) }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    submitting.current = false; setBusy(false);
    if (res?.ok && json?.ok) { flashToast("success", String(json.message ?? "Saved.")); dialog.current?.close(); reload(); onChanged(); return; }
    setFieldErrors(json?.fields ?? {});
    setServerError(json?.message ?? (res ? "The change could not be saved." : "Network error. Nothing was saved. Check your connection and try again."));
    flashToast("error", "Not saved. The account is unchanged.");
    if (res?.status === 409) reload();
  }
  const closeOnBackdrop = (ref: React.RefObject<HTMLDialogElement | null>) => (e: React.MouseEvent<HTMLDialogElement>) => { if (e.target === ref.current) ref.current?.close(); };
  const tone = (st: string) => (st === "ACTIVE" ? m.tone_ok : st === "SUSPENDED" ? m.tone_bad : m.tone_muted);

  return (
    <>
      <dialog ref={drawer} className={m.drawer} aria-labelledby={`${uid}-title`} onClick={closeOnBackdrop(drawer)} onClose={() => { if (id) onClose(); }}>
        <div className={m.drawerBody}>
          <header className={m.drawerHead}>
            <h2 id={`${uid}-title`} className={m.drawerTitle}>{d ? d.name : "Buyer account"}{d && <span className={s.badge} style={{ marginLeft: ".6rem" }}>{d.code}</span>}</h2>
            <button type="button" className={m.iconBtn} onClick={() => drawer.current?.close()} aria-label="Close buyer details"><X size={20} aria-hidden /></button>
          </header>
          {detail.kind === "loading" && <p role="status">Loading buyer…</p>}
          {detail.kind === "error" && <p role="alert" className={m.err}>{detail.message} {detail.status !== 403 && <button type="button" className={prof.btnSecondary} onClick={reload}>Retry</button>}</p>}
          {d && (
            <div className={m.panelBody}>
              <h3 className={m.sub}>Account overview</h3>
              <dl className={m.defs}>
                <div><dt>Role</dt><dd>{d.role}</dd></div>
                <div><dt>Status</dt><dd><span className={`${s.badge} ${tone(d.status)}`}>{d.statusLabel}</span></dd></div>
                <div><dt>Joined</dt><dd>{d.joinedAt ? day(d.joinedAt) : "Not provided"}</dd></div>
                <div><dt>Account reference</dt><dd>{d.code} <span className={m.muted}>({d.id})</span></dd></div>
                <div><dt>Last sign-in</dt><dd>{d.lastSignInAt ? fmt(d.lastSignInAt) : "Not provided"}</dd></div>
                {d.suspension && <div><dt>Suspended</dt><dd>{fmt(d.suspension.at)} · internal reason: {d.suspension.reason}</dd></div>}
              </dl>
              <h3 className={m.sub}>Business information</h3>
              <dl className={m.defs}>
                <div><dt>Business name</dt><dd>{d.businessName ?? "Not provided"} <span className={m.muted}>as typed by the buyer; not verified</span></dd></div>
                <div><dt>E-mail address</dt><dd>{d.contact.email ?? "Not provided"}{d.contact.masked && d.contact.email ? <span className={m.muted}> (masked)</span> : null}</dd></div>
                <div><dt>Phone</dt><dd>{d.contact.phone ?? "Not provided"}{d.contact.masked && d.contact.phone ? <span className={m.muted}> (masked)</span> : null}</dd></div>
                <div><dt>E-mail confirmation</dt><dd>{d.emailConfirmed ? "Confirmed" : "Not confirmed"} <span className={m.muted}>A confirmed e-mail does not mean a verified business.</span></dd></div>
                <div><dt>Business verification</dt><dd>Not verified <span className={m.muted}>No buyer verification exists.</span></dd></div>
              </dl>
              {d.contact.masked && <p className={m.note}>Contact details are masked: your account may not read them in full.</p>}
              <div className={m.actions} role="group" aria-label="Related records and account status">
                {d.links.inquiries && <Link prefetch={false} href={d.links.inquiries} className={prof.btnSecondary}><MessageSquareText size={16} aria-hidden /> View Inquiries</Link>}
                {canManage && d.actions.suspend.permitted && <div><button type="button" className={prof.btnGold} disabled={!d.actions.suspend.available} aria-describedby={d.actions.suspend.reason ? `${uid}-s-why` : undefined} onClick={() => openAction("suspend")}>Suspend Account</button>{d.actions.suspend.reason && <p id={`${uid}-s-why`} className={m.muted}>{d.actions.suspend.reason}</p>}</div>}
                {canManage && d.actions.reactivate.permitted && <div><button type="button" className={prof.btnGold} disabled={!d.actions.reactivate.available} aria-describedby={d.actions.reactivate.reason ? `${uid}-r-why` : undefined} onClick={() => openAction("reactivate")}>Reactivate Account</button>{d.actions.reactivate.reason && <p id={`${uid}-r-why`} className={m.muted}>{d.actions.reactivate.reason}</p>}</div>}
              </div>
            </div>
          )}
        </div>
      </dialog>

      <dialog ref={dialog} className={m.dialog} aria-labelledby={`${uid}-dlg`} onClick={closeOnBackdrop(dialog)} onClose={() => setAction(null)}>
        {action && d && (
          <form method="dialog" className={m.dialogBody} onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
            <h2 id={`${uid}-dlg`} className={m.drawerTitle}>{action === "suspend" ? "Suspend buyer account?" : "Reactivate buyer account?"}</h2>
            <p><strong>{d.name}</strong> <span className={m.muted}>{d.code}</span></p>
            <ul className={m.list} aria-label="What this does">{(action === "suspend" ? SUSPEND_EFFECTS : REACTIVATE_EFFECTS).map((t) => <li key={t}>{t}</li>)}</ul>
            <div className={auth.field}>
              <label htmlFor={`${uid}-reason`} className={auth.label}>Reason <span aria-hidden>*</span></label>
              <textarea id={`${uid}-reason`} className={auth.control} rows={4} maxLength={REASON_MAX} value={reason} aria-required="true" aria-invalid={reasonError ? true : undefined} aria-describedby={reasonError ? `${uid}-reason-err` : `${uid}-reason-hint`} onChange={(e) => { setReason(e.target.value); setFieldErrors({}); setServerError(""); }} onBlur={() => setTouched(true)} />
              <p id={`${uid}-reason-hint`} className={m.muted}>Recorded in the audit history (internal). It is never shown to the buyer.</p>
              {reasonError && <p id={`${uid}-reason-err`} className={m.err} role="alert">{reasonError}</p>}
            </div>
            {serverError && <p className={m.err} role="alert">{serverError}</p>}
            <div className={m.dialogActions}>
              <button type="button" className={prof.btnSecondary} onClick={() => dialog.current?.close()}>Cancel</button>
              <button type="submit" className={prof.btnGold} disabled={busy}>{busy ? "Saving…" : action === "suspend" ? "Confirm suspension" : "Confirm reactivation"}</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
