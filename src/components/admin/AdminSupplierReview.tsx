"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Package, ShieldAlert, ShieldCheck, X } from "lucide-react";
import auth from "@/components/auth/Auth.module.css";
import prof from "@/components/supplier/profile/SupplierProfile.module.css";
import { Dropdown } from "@/components/ui/Dropdown";
import { flashToast } from "@/components/ui/Toast";
import { NOTICE_CODES, REACTIVATE_EFFECTS, SUSPEND_EFFECTS, cleanReason, validateReason, type CompanyAction } from "@/lib/admin/supplierRules";
import { REASON_MAX } from "@/lib/admin/inquiryRules";
import type { ActivityItem, SupplierDetail } from "@/lib/admin/supplierManagement";
import s from "./AdminInquiries.module.css";
import m from "./AdminInquiryManagement.module.css";

const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
type Load<T> = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "ok"; data: T };
type TabKey = "overview" | "links" | "activity";

async function getJson<T>(url: string, signal?: AbortSignal): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const res = await fetch(url, { cache: "no-store", signal }).catch(() => null);
  if (signal?.aborted) return { ok: false, message: "" };
  const json = res ? await res.json().catch(() => null) : null;
  return res?.ok && json?.ok ? { ok: true, data: json.data as T } : { ok: false, message: json?.message ?? (res ? "Could not load this." : "Network error. Check your connection and retry.") };
}

export function AdminSupplierReview({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const uid = useId();
  const drawer = useRef<HTMLDialogElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<Load<SupplierDetail>>({ kind: "idle" });
  const [tab, setTab] = useState<TabKey>("overview");
  const [activity, setActivity] = useState<{ state: Load<null>; items: ActivityItem[]; next: string | null }>({ state: { kind: "idle" }, items: [], next: null });
  const [tick, setTick] = useState(0);
  const [action, setAction] = useState<CompanyAction | null>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("POLICY_REVIEW");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const keyRef = useRef<{ sig: string; key: string } | null>(null);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!id) { if (drawer.current?.open) drawer.current.close(); return; }
    setTab("overview");
    setActivity({ state: { kind: "idle" }, items: [], next: null });
    if (!drawer.current?.open) drawer.current?.showModal();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const ctl = new AbortController();
    setDetail((d) => (d.kind === "ok" && d.data.id === id ? d : { kind: "loading" }));
    void getJson<SupplierDetail>(`/api/admin/suppliers/${id}`, ctl.signal).then((r) => { if (!ctl.signal.aborted) setDetail(r.ok ? { kind: "ok", data: r.data } : { kind: "error", message: r.message }); });
    return () => ctl.abort();
  }, [id, tick]);

  const loadActivity = useCallback(async (cursor: string | null, replace: boolean) => {
    if (!id) return;
    setActivity((a) => ({ ...a, state: { kind: "loading" } }));
    const r = await getJson<{ items: ActivityItem[]; nextCursor: string | null }>(`/api/admin/suppliers/${id}/activity${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
    setActivity((a) => (r.ok ? { state: { kind: "ok", data: null }, items: replace ? r.data.items : [...a.items, ...r.data.items], next: r.data.nextCursor } : { ...a, state: { kind: "error", message: r.message } }));
  }, [id]);
  const d = detail.kind === "ok" ? detail.data : null;
  useEffect(() => { if (id && tab === "activity" && d?.capabilities.audit) void loadActivity(null, true); }, [id, tab, tick, d?.capabilities.audit, loadActivity]);

  const tabs: { key: TabKey; label: string }[] = [{ key: "overview", label: "Overview" }, ...(d?.sellerLinks ? [{ key: "links" as const, label: "Seller links" }] : []), ...(d?.capabilities.audit ? [{ key: "activity" as const, label: "Activity" }] : [])];
  function onTabKey(e: React.KeyboardEvent, i: number) {
    const to = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i + tabs.length - 1) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    setTab(tabs[to].key);
    document.getElementById(`${uid}-tab-${tabs[to].key}`)?.focus();
  }

  function openAction(a: CompanyAction) {
    setAction(a); setReason(""); setNotice("POLICY_REVIEW"); setTouched(false); setServerError(""); setFieldErrors({}); keyRef.current = null;
    dialog.current?.showModal();
  }
  const keyFor = (sig: string) => { if (!keyRef.current || keyRef.current.sig !== sig) keyRef.current = { sig, key: crypto.randomUUID() }; return keyRef.current.key; };
  const reasonError = (touched ? validateReason(cleanReason(reason)) : null) ?? fieldErrors.reason ?? null;

  async function submit() {
    if (!action || !id || !d) return;
    setTouched(true);
    const text = cleanReason(reason);
    if (validateReason(text)) return;
    setBusy(true); setServerError(""); setFieldErrors({});
    const sig = JSON.stringify([action, text, notice, d.revision]);
    const body = action === "suspend" ? { reason: text, noticeCode: notice, expectedRev: d.revision, idempotencyKey: keyFor(sig) } : { reason: text, expectedRev: d.revision, idempotencyKey: keyFor(sig) };
    const res = await fetch(`/api/admin/suppliers/${id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (res?.ok && json?.ok) { flashToast("success", String(json.message ?? "Saved.")); dialog.current?.close(); reload(); onChanged(); return; }
    setFieldErrors(json?.fields ?? {});
    setServerError(json?.message ?? (res ? "The change could not be saved." : "Network error. Nothing was saved. Check your connection and try again."));
    flashToast("error", "Not saved.");
    if (res?.status === 409) reload();
  }
  const closeOnBackdrop = (ref: React.RefObject<HTMLDialogElement | null>) => (e: React.MouseEvent<HTMLDialogElement>) => { if (e.target === ref.current) ref.current?.close(); };
  const badge = (status: string) => `${s.badge} ${status === "ACTIVE" ? m.tone_ok : m.tone_bad}`;

  return (
    <>
      <dialog ref={drawer} className={m.drawer} aria-labelledby={`${uid}-title`} onClick={closeOnBackdrop(drawer)} onClose={() => { if (id) onClose(); }}>
        <div className={m.drawerBody}>
          <header className={m.drawerHead}>
            <h2 id={`${uid}-title`} className={m.drawerTitle}>{d ? d.name : "Supplier company"}{d && <span className={s.badge} style={{ marginLeft: ".6rem" }}>{d.code}</span>}</h2>
            <button type="button" className={m.iconBtn} onClick={() => drawer.current?.close()} aria-label="Close company review"><X size={20} aria-hidden /></button>
          </header>
          {detail.kind === "loading" && <p role="status">Loading company…</p>}
          {detail.kind === "error" && <p role="alert" className={m.err}>{detail.message} <button type="button" className={prof.btnSecondary} onClick={reload}>Retry</button></p>}

          {d && (
            <>
              <div className={m.tabs} role="tablist" aria-label="Company sections">
                {tabs.map((t, i) => <button key={t.key} type="button" role="tab" id={`${uid}-tab-${t.key}`} aria-selected={tab === t.key} aria-controls={`${uid}-panel-${t.key}`} tabIndex={tab === t.key ? 0 : -1} className={m.tab} onClick={() => setTab(t.key)} onKeyDown={(e) => onTabKey(e, i)}>{t.label}</button>)}
              </div>

              {tab === "overview" && (
                <div role="tabpanel" id={`${uid}-panel-overview`} aria-labelledby={`${uid}-tab-overview`} className={m.panelBody}>
                  <dl className={m.defs}>
                    <div><dt>Reference</dt><dd>{d.code} <span className={m.muted}>({d.id})</span></dd></div>
                    <div><dt>Business type</dt><dd>{d.businessType ?? "Not provided"}</dd></div>
                    <div><dt>Location</dt><dd>{[d.city, d.state, d.country].filter(Boolean).join(", ") || "Not provided"}</dd></div>
                    <div><dt>Access</dt><dd><span className={badge(d.status)}>{d.statusLabel}</span></dd></div>
                    <div><dt>Verification</dt><dd><span className={`${s.badge} ${m.tone_muted}`}>{d.verification.label}</span> <span className={m.muted}>{d.verification.note}</span></dd></div>
                    <div><dt>Public discovery</dt><dd><strong>{d.discovery.label}.</strong> <span className={m.muted}>{d.discovery.note}</span></dd></div>
                    <div><dt>Catalogue mapping</dt><dd>{d.linkedSellers === 0 ? "No linked catalogue seller (normal: its own products use the company identity)" : `${d.linkedSellers} linked ${d.linkedSellers === 1 ? "seller" : "sellers"}`}</dd></div>
                    {d.products && <div><dt>Products</dt><dd>{d.products.published} published · {d.products.pending} awaiting review · {d.products.unpublished} individually unpublished</dd></div>}
                    <div><dt>Created</dt><dd>{day(d.createdAt)}</dd></div>
                    <div><dt>Updated</dt><dd>{fmt(d.updatedAt)}</dd></div>
                    {d.suspension && <div><dt>Suspended</dt><dd>{fmt(d.suspension.at)} · internal reason: {d.suspension.reason}</dd></div>}
                  </dl>
                  <p className={m.muted}>{d.legalNote}</p>
                  {d.contact === null ? <p className={m.note}>Contact details are restricted: your account may not read them.</p> : (
                    <dl className={m.defs}>
                      <div><dt>Contact</dt><dd>{d.contact.name || "Not provided"}</dd></div>
                      <div><dt>Email</dt><dd>{d.contact.email || "Not provided"}</dd></div>
                      <div><dt>Phone</dt><dd>{d.contact.phone ?? "Not provided"}</dd></div>
                    </dl>
                  )}
                  <div className={m.actions} role="group" aria-label="Related tools and status">
                    {d.links.companyLinks && <Link href={d.links.companyLinks} className={prof.btnSecondary}><ExternalLink size={16} aria-hidden /> Open Company Links</Link>}
                    {d.links.products && <Link href={d.links.products} className={prof.btnSecondary}><Package size={16} aria-hidden /> View permitted products</Link>}
                    {d.links.review && <Link href={d.links.review} className={prof.btnSecondary}>Open Product Review</Link>}
                    {d.actions.suspend.permitted && <div><button type="button" className={prof.btnGold} disabled={!d.actions.suspend.available} aria-describedby={d.actions.suspend.reason ? `${uid}-s-why` : undefined} onClick={() => openAction("suspend")}><ShieldAlert size={16} aria-hidden /> Manage status: suspend</button>{d.actions.suspend.reason && <span id={`${uid}-s-why`} className={m.actionNote}>{d.actions.suspend.reason}</span>}</div>}
                    {d.actions.reactivate.permitted && <div><button type="button" className={prof.btnGold} disabled={!d.actions.reactivate.available} aria-describedby={d.actions.reactivate.reason ? `${uid}-r-why` : undefined} onClick={() => openAction("reactivate")}><ShieldCheck size={16} aria-hidden /> Manage status: reactivate</button>{d.actions.reactivate.reason && <span id={`${uid}-r-why`} className={m.actionNote}>{d.actions.reactivate.reason}</span>}</div>}
                  </div>
                </div>
              )}

              {tab === "links" && d.sellerLinks && (
                <div role="tabpanel" id={`${uid}-panel-links`} aria-labelledby={`${uid}-tab-links`} className={m.panelBody}>
                  {d.sellerLinks.length === 0 ? <p className={m.muted}>No catalogue seller is linked to this company. That is normal: a company&apos;s own approved products are public under its own company identity, with no catalogue seller needed.</p> : (
                    <ul className={m.list}>{d.sellerLinks.map((l) => <li key={l.key}>{l.name}</li>)}</ul>
                  )}
                  <p className={m.muted}>Links are made only by an administrator in Company Links, after reviewing ownership evidence. They are never matched automatically by name, phone, e-mail or city, and this page cannot change or remove them.</p>
                </div>
              )}

              {tab === "activity" && d.capabilities.audit && (
                <div role="tabpanel" id={`${uid}-panel-activity`} aria-labelledby={`${uid}-tab-activity`} className={m.panelBody}>
                  {activity.state.kind === "error" && <p role="alert" className={m.err}>{activity.state.message} <button type="button" className={prof.btnSecondary} onClick={() => void loadActivity(null, true)}>Retry</button></p>}
                  {activity.state.kind === "loading" && activity.items.length === 0 && <p role="status">Loading activity…</p>}
                  {activity.state.kind === "ok" && activity.items.length === 0 && <p className={m.muted}>No administrative action has been recorded for this company.</p>}
                  {activity.items.length > 0 && (
                    <div className={m.tableWrap}>
                      <table className={m.recipients}>
                        <caption className={m.sr}>Administrative activity</caption>
                        <thead><tr><th scope="col">Actor</th><th scope="col">Action</th><th scope="col">Reason</th><th scope="col">Time</th></tr></thead>
                        <tbody>{activity.items.map((a, i) => <tr key={i}><th scope="row">{a.actor}</th><td>{a.label}{a.detail ? <span className={m.sub}>{a.detail}</span> : null}</td><td>{a.reason ?? ""}</td><td>{fmt(a.at)}</td></tr>)}</tbody>
                      </table>
                    </div>
                  )}
                  {activity.next && <button type="button" className={prof.btnSecondary} disabled={activity.state.kind === "loading"} onClick={() => void loadActivity(activity.next, false)}>Load more</button>}
                </div>
              )}
            </>
          )}
        </div>
      </dialog>

      <dialog ref={dialog} className={m.dialog} aria-labelledby={`${uid}-dlg`} onClick={closeOnBackdrop(dialog)} onClose={() => setAction(null)}>
        {action && d && (
          <form method="dialog" className={m.dialogBody} onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
            <h2 id={`${uid}-dlg`} className={m.drawerTitle}>{action === "suspend" ? "Suspend company?" : "Reactivate company?"}</h2>
            <p><strong>{d.name}</strong> <span className={m.muted}>{d.code}</span></p>
            <ul className={m.list} aria-label="What this does">{(action === "suspend" ? SUSPEND_EFFECTS : REACTIVATE_EFFECTS).map((t) => <li key={t}>{t}</li>)}</ul>
            {action === "suspend" && (
              <div className={auth.field}>
                <span id={`${uid}-n-l`} className={auth.label}>What the supplier is told <span aria-hidden>*</span></span>
                <Dropdown id={`${uid}-n`} value={notice} onChange={(v) => { setNotice(v); setFieldErrors({}); setServerError(""); }} options={NOTICE_CODES.map((n) => ({ value: n.key, label: n.label }))} />
                <p className={m.muted}>A fixed notice. Your reason below is internal and is never shown to the supplier.</p>
              </div>
            )}
            <div className={auth.field}>
              <label htmlFor={`${uid}-reason`} className={auth.label}>Reason <span aria-hidden>*</span></label>
              <textarea id={`${uid}-reason`} className={auth.control} rows={4} maxLength={REASON_MAX} value={reason} aria-required="true" aria-invalid={reasonError ? true : undefined} aria-describedby={reasonError ? `${uid}-reason-err` : `${uid}-reason-hint`} onChange={(e) => { setReason(e.target.value); setFieldErrors({}); setServerError(""); }} onBlur={() => setTouched(true)} placeholder={action === "suspend" ? "Enter reason for suspension" : "Enter reason for reactivation"} />
              <p id={`${uid}-reason-hint`} className={m.muted}>Recorded in the audit history (internal).</p>
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
