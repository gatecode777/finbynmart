"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { FileText, X } from "lucide-react";
import auth from "@/components/auth/Auth.module.css";
import prof from "@/components/supplier/profile/SupplierProfile.module.css";
import { Dropdown } from "@/components/ui/Dropdown";
import { flashToast } from "@/components/ui/Toast";
import { NOTE_MAX, type Decision } from "@/lib/verification/rules";
import type { AdminCaps, SubmissionDetail } from "@/lib/verification/service";
import s from "./AdminInquiries.module.css";
import m from "./AdminInquiryManagement.module.css";

const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const badge = (tone: string) => `${s.badge} ${m[`tone_${tone}` as keyof typeof m] ?? ""}`;
const kb = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
type Load<T> = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "ok"; data: T };
type TabKey = "details" | "documents" | "history";
type History = { submissions: { reference: string; revision: number; state: string; stateLabel: string; submittedAt: string; decidedAt: string | null; decision: string | null; reasonLabel: string | null }[]; events: { label: string; at: string; detail: string | null }[] };

async function getJson<T>(url: string, signal?: AbortSignal): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const res = await fetch(url, { cache: "no-store", signal }).catch(() => null);
  if (signal?.aborted) return { ok: false, message: "" };
  const json = res ? await res.json().catch(() => null) : null;
  return res?.ok && json?.ok ? { ok: true, data: json.data as T } : { ok: false, message: json?.message ?? (res ? "Could not load this." : "Network error. Check your connection and retry.") };
}
const TITLE: Record<Decision, string> = { approve: "Approve", "request-changes": "Request changes on", reject: "Reject" };
const CONFIRM: Record<Decision, [string, string]> = { approve: ["Confirm approval", "Approving…"], "request-changes": ["Confirm request", "Sending…"], reject: ["Confirm rejection", "Rejecting…"] };

export function AdminVerificationReview({ reference, caps, onClose, onChanged }: { reference: string | null; caps: AdminCaps; onClose: () => void; onChanged: () => void }) {
  const uid = useId();
  const drawer = useRef<HTMLDialogElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<Load<SubmissionDetail>>({ kind: "idle" });
  const [history, setHistory] = useState<Load<History>>({ kind: "idle" });
  const [tab, setTab] = useState<TabKey>("details");
  const [tick, setTick] = useState(0);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [action, setAction] = useState<Decision | null>(null);
  const [reasonCode, setReasonCode] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const keyRef = useRef<{ sig: string; key: string } | null>(null);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!reference) { if (drawer.current?.open) drawer.current.close(); return; }
    setTab("details"); setChecks({}); setNote(""); setHistory({ kind: "idle" });
    if (!drawer.current?.open) drawer.current?.showModal();
  }, [reference]);

  useEffect(() => {
    if (!reference) return;
    const ctl = new AbortController();
    setDetail((d) => (d.kind === "ok" && d.data.reference === reference ? d : { kind: "loading" }));
    void getJson<SubmissionDetail>(`/api/admin/verification/${encodeURIComponent(reference)}`, ctl.signal).then((r) => { if (!ctl.signal.aborted) setDetail(r.ok ? { kind: "ok", data: r.data } : { kind: "error", message: r.message }); });
    return () => ctl.abort();
  }, [reference, tick]);

  useEffect(() => {
    if (!reference || tab !== "history") return;
    const ctl = new AbortController();
    setHistory((h) => (h.kind === "ok" ? h : { kind: "loading" }));
    void getJson<History>(`/api/admin/verification/${encodeURIComponent(reference)}/history`, ctl.signal).then((r) => { if (!ctl.signal.aborted) setHistory(r.ok ? { kind: "ok", data: r.data } : { kind: "error", message: r.message }); });
    return () => ctl.abort();
  }, [reference, tab, tick]);

  const d = detail.kind === "ok" ? detail.data : null;
  const tabs: { key: TabKey; label: string }[] = [{ key: "details", label: "Submitted details" }, { key: "documents", label: "Documents" }, { key: "history", label: "History" }];
  function onTabKey(e: React.KeyboardEvent, i: number) {
    const to = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i + tabs.length - 1) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    setTab(tabs[to].key);
    document.getElementById(`${uid}-tab-${tabs[to].key}`)?.focus();
  }

  const reasons = d && action ? (action === "approve" ? d.policy.reasons.approve : action === "reject" ? d.policy.reasons.reject : d.policy.reasons.requestChanges) : [];
  const reasonRequired = action !== "approve" || reasons.length > 0;
  const reasonError = (touched && reasonRequired && !reasonCode ? "Choose a reason from the list." : null) ?? fieldErrors.reasonCode ?? null;
  const allChecked = !!d && d.policy.checklist.every((c) => checks[c.key]);

  function openAction(a: Decision) {
    setAction(a); setReasonCode(""); setTouched(false); setServerError(""); setFieldErrors({}); keyRef.current = null;
    dialog.current?.showModal();
  }
  const keyFor = (sig: string) => { if (!keyRef.current || keyRef.current.sig !== sig) keyRef.current = { sig, key: crypto.randomUUID() }; return keyRef.current.key; };

  async function submit() {
    if (!action || !reference || !d) return;
    setTouched(true);
    if (reasonRequired && !reasonCode) return;
    if (action === "approve" && !allChecked) { setServerError("Confirm every review criterion in the checklist before approving."); return; }
    setBusy(true); setServerError(""); setFieldErrors({});
    const body = { reasonCode, internalNote: note, checklist: checks, expectedRev: d.rev };
    const sig = JSON.stringify([action, body]);
    const res = await fetch(`/api/admin/verification/${encodeURIComponent(reference)}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, idempotencyKey: keyFor(sig) }) }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (res?.ok && json?.ok) { flashToast("success", String(json.message ?? "Saved.")); dialog.current?.close(); reload(); onChanged(); return; }
    setFieldErrors(json?.fields ?? {});
    setServerError(json?.message ?? (res ? "The decision could not be saved." : "Network error. Nothing was saved. Check your connection and try again."));
    flashToast("error", "Not saved.");
    if (res?.status === 409) reload();
  }
  const closeOnBackdrop = (ref: React.RefObject<HTMLDialogElement | null>) => (e: React.MouseEvent<HTMLDialogElement>) => { if (e.target === ref.current) ref.current?.close(); };
  const field = (f: string) => ({ submitted: d?.identity[f as keyof SubmissionDetail["identity"]] ?? "", changed: d?.changedSince.find((c) => c.field === f) });
  const ID_LABELS: [string, string][] = [["businessName", "Company legal name"], ["displayName", "Display name"], ["businessType", "Business type"], ["country", "Country"], ["state", "State"], ["city", "City"]];

  return (
    <>
      <dialog ref={drawer} className={m.drawer} aria-labelledby={`${uid}-title`} onClick={closeOnBackdrop(drawer)} onClose={() => { if (reference) onClose(); }}>
        <div className={m.drawerBody}>
          <header className={m.drawerHead}>
            <h2 id={`${uid}-title`} className={m.drawerTitle}>{d ? `${d.reference} ${d.identity.businessName || ""}` : reference ?? "Application"}{d && <span className={s.badge} style={{ marginLeft: ".6rem" }}>Revision {d.revision}</span>}</h2>
            <button type="button" className={m.iconBtn} onClick={() => drawer.current?.close()} aria-label="Close application review"><X size={20} aria-hidden /></button>
          </header>
          {detail.kind === "loading" && <p role="status">Loading application…</p>}
          {detail.kind === "error" && <p role="alert" className={m.err}>{detail.message} <button type="button" className={prof.btnSecondary} onClick={reload}>Retry</button></p>}

          {d && (
            <>
              <div className={m.tabs} role="tablist" aria-label="Application sections">
                {tabs.map((t, i) => <button key={t.key} type="button" role="tab" id={`${uid}-tab-${t.key}`} aria-selected={tab === t.key} aria-controls={`${uid}-panel-${t.key}`} tabIndex={tab === t.key ? 0 : -1} className={m.tab} onClick={() => setTab(t.key)} onKeyDown={(e) => onTabKey(e, i)}>{t.label}</button>)}
              </div>

              {tab === "details" && (
                <div role="tabpanel" id={`${uid}-panel-details`} aria-labelledby={`${uid}-tab-details`} className={m.panelBody}>
                  <p className={m.muted}>This is the exact revision the supplier submitted, not the current profile. Submitted {fmt(d.submittedAt)}.</p>
                  <dl className={m.defs}>
                    {ID_LABELS.map(([f, label]) => { const x = field(f); return <div key={f}><dt>{label}</dt><dd>{x.submitted || "Not provided"}{x.changed && <span className={m.sub}>Current profile now reads: {x.changed.current || "empty"}</span>}</dd></div>; })}
                    <div><dt>Review status</dt><dd><span className={badge(d.tone)}>{d.stateLabel}</span></dd></div>
                    <div><dt>Company access</dt><dd>{d.company.operationalStatus} <span className={m.muted}>(a separate fact: approval never changes it)</span></dd></div>
                    <div><dt>Effective label</dt><dd><strong>{d.company.effective.label}.</strong> <span className={m.muted}>{d.company.effective.note}</span></dd></div>
                    <div><dt>Policy</dt><dd>{d.policy.version}{d.policy.applies ? "" : " (does not apply to the submitted business type)"}</dd></div>
                  </dl>
                  {d.changedSince.length > 0 && <p className={m.note}>The company profile changed after this submission ({d.changedSince.map((c) => c.field).join(", ")}). This review applies only to the submitted values above.</p>}
                  <h3>Required evidence</h3>
                  <ul className={m.list}>{d.policy.required.map((r) => <li key={r.type}>{r.label}: {d.evidence === null ? "restricted" : d.evidence.some((e) => e.type === r.type) ? "submitted" : "missing"}</li>)}</ul>
                  {d.policy.optional.length > 0 && <p className={m.muted}>Optional: {d.policy.optional.map((o) => o.label).join(", ")}.</p>}
                  {d.decision && (
                    <div className={m.box}>
                      <p className={m.boxTitle}>Decision recorded {fmt(d.decision.at)}</p>
                      {d.decision.reasonLabel && <p>Reason: {d.decision.reasonLabel}</p>}
                      {d.decision.supplierMessage && <p>Shown to the supplier: {d.decision.supplierMessage}</p>}
                      {d.decision.internalNote && <p>Internal note (private): {d.decision.internalNote}</p>}
                    </div>
                  )}

                  {d.state === "PENDING_REVIEW" && (
                    <fieldset className={m.box} style={{ border: 0 }}>
                      <legend className={m.boxTitle}>Review checklist <span className={m.muted}>(the criteria of policy {d.policy.version}; your confirmation, not proof)</span></legend>
                      {d.policy.checklist.map((c) => (
                        <label key={c.key} style={{ display: "flex", gap: ".5rem", alignItems: "flex-start", minHeight: 44, padding: ".25rem 0" }}>
                          <input type="checkbox" checked={!!checks[c.key]} onChange={(e) => setChecks((x) => ({ ...x, [c.key]: e.target.checked }))} style={{ width: 20, height: 20, marginTop: 2 }} />
                          <span>{c.label}</span>
                        </label>
                      ))}
                      {caps.notes && (
                        <div className={auth.field}>
                          <label htmlFor={`${uid}-note`} className={auth.label}>Internal review notes <span className={m.muted}>(private: never shown to the supplier)</span></label>
                          <textarea id={`${uid}-note`} className={auth.control} rows={3} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
                        </div>
                      )}
                      {d.approvalBlockers.length > 0 && <p role="alert" className={m.err}>Approval is blocked: {d.approvalBlockers[0]}</p>}
                      <div className={m.actions} role="group" aria-label="Decision">
                        {d.actions.approve.permitted && <div><button type="button" className={prof.btnPrimary} disabled={!d.actions.approve.available || !allChecked} aria-describedby={`${uid}-approve-why`} onClick={() => openAction("approve")}>Approve</button><span id={`${uid}-approve-why`} className={m.actionNote}>{d.actions.approve.reason ?? (allChecked ? "Records a platform review of this revision. It does not verify product quality or imply government endorsement." : "Confirm every criterion to enable approval.")}</span></div>}
                        {d.actions["request-changes"].permitted && <div><button type="button" className={prof.btnSecondary} disabled={!d.actions["request-changes"].available} onClick={() => openAction("request-changes")}>Request changes</button></div>}
                        {d.actions.reject.permitted && <div><button type="button" className={prof.btnSecondary} disabled={!d.actions.reject.available} onClick={() => openAction("reject")}>Reject</button></div>}
                        {!d.actions.approve.permitted && !d.actions["request-changes"].permitted && !d.actions.reject.permitted && <p className={m.muted}>Your account may inspect this application but may not record a decision.</p>}
                      </div>
                    </fieldset>
                  )}
                </div>
              )}

              {tab === "documents" && (
                <div role="tabpanel" id={`${uid}-panel-documents`} aria-labelledby={`${uid}-tab-documents`} className={m.panelBody}>
                  {d.evidence === null ? <p className={m.note}>Private documents are restricted: your account may not open submitted evidence.</p> : d.evidence.length === 0 ? <p className={m.muted}>No evidence was submitted.</p> : (
                    <div className={m.tableWrap}>
                      <table className={m.recipients}>
                        <caption className={m.sr}>Submitted evidence</caption>
                        <thead><tr><th scope="col">Document</th><th scope="col">File</th><th scope="col">Size</th><th scope="col">Stored</th><th scope="col">Open</th></tr></thead>
                        <tbody>
                          {d.evidence.map((e) => (
                            <tr key={e.documentId}>
                              <th scope="row">{e.label}<span className={m.sub}>uploaded {fmt(e.uploadedAt)}</span></th>
                              <td>{e.filename}</td>
                              <td>{kb(e.size)}</td>
                              <td>{e.available ? "Available" : "Unavailable"}</td>
                              <td>{e.available ? <a className={prof.btnSecondary} href={`/api/admin/verification/${encodeURIComponent(d.reference)}/documents/${e.documentId}`} aria-label={`Download ${e.label}: ${e.filename}`}><FileText size={16} aria-hidden /> View document</a> : "Not available"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className={m.muted}>Documents are private, sent only to authorized reviewers as attachments, and each opening is recorded. The stored file is checked against the fingerprint taken at submission; a changed file is not served. No malware scanner is configured, so none is claimed.</p>
                </div>
              )}

              {tab === "history" && (
                <div role="tabpanel" id={`${uid}-panel-history`} aria-labelledby={`${uid}-tab-history`} className={m.panelBody}>
                  {history.kind === "loading" && <p role="status">Loading history…</p>}
                  {history.kind === "error" && <p role="alert" className={m.err}>{history.message} <button type="button" className={prof.btnSecondary} onClick={reload}>Retry</button></p>}
                  {history.kind === "ok" && (
                    <>
                      <h3>Submissions of this company</h3>
                      <ul className={m.list}>{history.data.submissions.map((h) => <li key={h.reference}><strong>{h.reference}</strong> · revision {h.revision} · {h.stateLabel} · submitted {fmt(h.submittedAt)}{h.decidedAt ? ` · decided ${fmt(h.decidedAt)}` : ""}{h.reasonLabel ? ` · ${h.reasonLabel}` : ""}</li>)}</ul>
                      {caps.audit ? (history.data.events.length === 0 ? <p className={m.muted}>No audit events.</p> : (
                        <div className={m.tableWrap}>
                          <table className={m.recipients}>
                            <caption className={m.sr}>Audit events</caption>
                            <thead><tr><th scope="col">Event</th><th scope="col">Detail</th><th scope="col">Time</th></tr></thead>
                            <tbody>{history.data.events.map((e, i) => <tr key={i}><th scope="row">{e.label}</th><td>{e.detail ?? ""}</td><td>{fmt(e.at)}</td></tr>)}</tbody>
                          </table>
                        </div>
                      )) : <p className={m.muted}>Audit events need an additional permission.</p>}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </dialog>

      <dialog ref={dialog} className={m.dialog} aria-labelledby={`${uid}-dlg`} onClick={closeOnBackdrop(dialog)} onClose={() => setAction(null)}>
        {action && d && (
          <form method="dialog" className={m.dialogBody} onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
            <h2 id={`${uid}-dlg`} className={m.drawerTitle}>{TITLE[action]} revision {d.revision}?</h2>
            <p><strong>{d.identity.businessName}</strong> <span className={m.muted}>{d.reference}</span></p>
            <p>{action === "approve" ? "This approves exactly the submitted revision shown. It does not activate a suspended company, publish products or change seller ownership." : action === "reject" ? "This records a final decision for this submission. The company and its records are not deleted; resubmission follows the policy." : "The supplier can correct the evidence and submit a new revision. The earlier submission and its evidence are kept."}</p>
            {reasonRequired && (
              <div className={auth.field}>
                <span id={`${uid}-r-l`} className={auth.label}>Supplier-visible reason <span aria-hidden>*</span></span>
                <Dropdown id={`${uid}-r`} value={reasonCode} onChange={(v) => { setReasonCode(v); setFieldErrors({}); setServerError(""); }} describedBy={reasonError ? `${uid}-r-err` : undefined} options={[{ value: "", label: "Choose a reason" }, ...reasons.map((r) => ({ value: r.code, label: r.label }))]} />
                <p className={m.muted}>The supplier sees the policy&apos;s approved wording for this reason. Your internal notes are never shown to them.</p>
                {reasonError && <p id={`${uid}-r-err`} className={m.err} role="alert">{reasonError}</p>}
              </div>
            )}
            {fieldErrors.checklist && <p className={m.err} role="alert">{fieldErrors.checklist}</p>}
            {fieldErrors.internalNote && <p className={m.err} role="alert">{fieldErrors.internalNote}</p>}
            {serverError && <p className={m.err} role="alert">{serverError}</p>}
            <div className={m.dialogActions}>
              <button type="button" className={prof.btnSecondary} onClick={() => dialog.current?.close()}>Cancel</button>
              <button type="submit" className={action === "approve" ? prof.btnPrimary : prof.btnGold} disabled={busy}>{busy ? CONFIRM[action][1] : CONFIRM[action][0]}</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
