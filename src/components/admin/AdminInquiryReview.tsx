"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Ban, FileText, GitBranch, Pause, Play, RotateCcw, X } from "lucide-react";
import auth from "@/components/auth/Auth.module.css";
import prof from "@/components/supplier/profile/SupplierProfile.module.css";
import { Dropdown } from "@/components/ui/Dropdown";
import { flashToast } from "@/components/ui/Toast";
import { REASON_MAX, cleanReason, validateReason } from "@/lib/admin/inquiryRules";
import type { AdminInquiryCaps, AdminInquiryDetail } from "@/lib/admin/inquiryService";
import type { RecipientsView, ActivityItem } from "@/lib/admin/inquiryOps";
import s from "./AdminInquiries.module.css";
import m from "./AdminInquiryManagement.module.css";

const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const badge = (tone: string) => `${s.badge} ${m[`tone_${tone}` as keyof typeof m] ?? ""}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

type Load<T> = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "ok"; data: T };
type TabKey = "requirement" | "recipients" | "activity";
type Mode = { kind: "job"; action: "pause" | "resume" | "retry" } | { kind: "route" };

async function getJson<T>(url: string, signal?: AbortSignal): Promise<{ ok: true; data: T } | { ok: false; message: string; status: number }> {
  const res = await fetch(url, { cache: "no-store", signal }).catch(() => null);
  if (signal?.aborted) return { ok: false, message: "", status: 0 };
  const json = res ? await res.json().catch(() => null) : null;
  if (res?.ok && json?.ok) return { ok: true, data: json.data as T };
  return { ok: false, status: res?.status ?? 0, message: json?.message ?? (res ? "Could not load this." : "Network error. Check your connection and retry.") };
}

const DIALOG_COPY: Record<"pause" | "resume" | "retry" | "route", { title: string; body: string; button: string; busy: string }> = {
  pause: { title: "Pause distribution?", body: "Stops adding new matched recipients for this requirement. Existing recipients, conversations and quotations are unchanged and the requirement is not closed. This is an operational hold, not a cancellation.", button: "Confirm pause", busy: "Pausing…" },
  resume: { title: "Resume distribution?", body: "Continues matching from the saved progress. Companies that already hold the requirement are never added twice.", button: "Confirm resume", busy: "Resuming…" },
  retry: { title: "Retry failed distribution?", body: "Runs the same job again from its saved progress and candidate list. It does not restart, rematch under a new policy or create another inquiry.", button: "Confirm retry", busy: "Saving…" },
  route: { title: "Routing repair", body: "Adds one eligible matched recipient. The server checks the company against the matching policy now; the original selected supplier and all private conversations are preserved.", button: "Confirm assignment", busy: "Adding…" },
};

export function AdminInquiryReview({ reference, caps, onClose, onChanged }: { reference: string | null; caps: AdminInquiryCaps; onClose: () => void; onChanged: () => void }) {
  const uid = useId();
  const drawer = useRef<HTMLDialogElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<Load<AdminInquiryDetail>>({ kind: "idle" });
  const [tab, setTab] = useState<TabKey>("requirement");
  const [recips, setRecips] = useState<Load<RecipientsView>>({ kind: "idle" });
  const [activity, setActivity] = useState<{ state: Load<null>; items: ActivityItem[]; next: string | null }>({ state: { kind: "idle" }, items: [], next: null });
  const [tick, setTick] = useState(0);
  const abort = useRef<AbortController | null>(null);

  // dialog state
  const [mode, setMode] = useState<Mode | null>(null);
  const [reason, setReason] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const keyRef = useRef<{ sig: string; key: string } | null>(null);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  // open / close the drawer with the selected reference
  useEffect(() => {
    if (!reference) {
      if (drawer.current?.open) drawer.current.close();
      return;
    }
    setTab("requirement");
    setRecips({ kind: "idle" });
    setActivity({ state: { kind: "idle" }, items: [], next: null });
    if (!drawer.current?.open) drawer.current?.showModal();
  }, [reference]);

  // the inquiry detail (reloaded after every change)
  useEffect(() => {
    if (!reference) return;
    abort.current?.abort();
    const ctl = (abort.current = new AbortController());
    setDetail((d) => (d.kind === "ok" && d.data.reference === reference ? d : { kind: "loading" }));
    void getJson<AdminInquiryDetail>(`/api/admin/inquiries/${encodeURIComponent(reference)}`, ctl.signal).then((r) => {
      if (ctl.signal.aborted) return;
      setDetail(r.ok ? { kind: "ok", data: r.data } : { kind: "error", message: r.message });
    });
    return () => ctl.abort();
  }, [reference, tick]);

  // recipients and activity load only when their tab is open (and refresh after a change)
  useEffect(() => {
    if (!reference || tab !== "recipients" || !caps.recipients) return;
    const ctl = new AbortController();
    setRecips((r) => (r.kind === "ok" ? r : { kind: "loading" }));
    void getJson<RecipientsView>(`/api/admin/inquiries/${encodeURIComponent(reference)}/recipients`, ctl.signal).then((r) => {
      if (!ctl.signal.aborted) setRecips(r.ok ? { kind: "ok", data: r.data } : { kind: "error", message: r.message });
    });
    return () => ctl.abort();
  }, [reference, tab, tick, caps.recipients]);

  const loadActivity = useCallback(async (cursor: string | null, replace: boolean) => {
    if (!reference) return;
    setActivity((a) => ({ ...a, state: { kind: "loading" } }));
    const r = await getJson<{ items: ActivityItem[]; nextCursor: string | null }>(`/api/admin/inquiries/${encodeURIComponent(reference)}/activity${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
    setActivity((a) => (r.ok ? { state: { kind: "ok", data: null }, items: replace ? r.data.items : [...a.items, ...r.data.items], next: r.data.nextCursor } : { ...a, state: { kind: "error", message: r.message } }));
  }, [reference]);
  useEffect(() => {
    if (reference && tab === "activity" && caps.audit) void loadActivity(null, true);
  }, [reference, tab, tick, caps.audit, loadActivity]);

  const d = detail.kind === "ok" ? detail.data : null;
  const tabs: { key: TabKey; label: string }[] = [{ key: "requirement", label: "Requirement" }, ...(caps.recipients ? [{ key: "recipients" as const, label: "Recipients" }] : []), ...(caps.audit ? [{ key: "activity" as const, label: "Activity" }] : [])];
  function onTabKey(e: React.KeyboardEvent, i: number) {
    const to = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i + tabs.length - 1) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    setTab(tabs[to].key);
    document.getElementById(`${uid}-tab-${tabs[to].key}`)?.focus();
  }

  // ----- action dialog
  const copy = mode ? DIALOG_COPY[mode.kind === "route" ? "route" : mode.action] : null;
  const reasonError = touched ? validateReason(cleanReason(reason)) ?? fieldErrors.reason ?? null : fieldErrors.reason ?? null;
  const companyError = mode?.kind === "route" && (touched && !companyId ? "Choose a company." : fieldErrors.companyId) ? (touched && !companyId ? "Choose a company." : fieldErrors.companyId) : null;
  function openAction(next: Mode) {
    setMode(next);
    setReason("");
    setCompanyId("");
    setTouched(false);
    setServerError("");
    setFieldErrors({});
    keyRef.current = null;
    if (next.kind === "route" && recips.kind === "idle") setTab("recipients");
    dialog.current?.showModal();
  }
  const keyFor = (sig: string) => {
    if (!keyRef.current || keyRef.current.sig !== sig) keyRef.current = { sig, key: crypto.randomUUID() };
    return keyRef.current.key;
  };
  async function submit() {
    if (!mode || !reference || !d) return;
    setTouched(true);
    const text = cleanReason(reason);
    if (validateReason(text) || (mode.kind === "route" && !companyId)) return;
    setBusy(true);
    setServerError("");
    setFieldErrors({});
    const rev = d.distribution?.rev ?? 0;
    const sig = JSON.stringify([mode, text, companyId, rev]);
    const body = mode.kind === "route" ? { companyId, reason: text, idempotencyKey: keyFor(sig) } : { action: mode.action, reason: text, expectedRev: rev, idempotencyKey: keyFor(sig) };
    const res = await fetch(`/api/admin/inquiries/${encodeURIComponent(reference)}/${mode.kind === "route" ? "routing" : "distribution"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (res?.ok && json?.ok) {
      flashToast("success", String(json.message ?? "Saved."));
      dialog.current?.close();
      reload();
      onChanged();
      return;
    }
    setFieldErrors(json?.fields ?? {});
    setServerError(json?.message ?? (res ? "The change could not be saved." : "Network error. Nothing was saved. Check your connection and try again."));
    flashToast("error", "Not saved.");
    // a conflict means the state moved on: show the current state behind the dialog
    if (res?.status === 409) reload();
  }

  const closeOnBackdrop = (ref: React.RefObject<HTMLDialogElement | null>) => (e: React.MouseEvent<HTMLDialogElement>) => { if (e.target === ref.current) ref.current?.close(); };
  const act = d?.actions;

  return (
    <>
      <dialog ref={drawer} className={m.drawer} aria-labelledby={`${uid}-title`} onClick={closeOnBackdrop(drawer)} onClose={() => { abort.current?.abort(); if (reference) onClose(); }}>
        <div className={m.drawerBody}>
          <header className={m.drawerHead}>
            <h2 id={`${uid}-title`} className={m.drawerTitle}>{d ? d.reference : reference ?? "Inquiry"}{d && <span className={`${s.badge} ${d.source === "GENERAL" ? m.src_GENERAL : m.src_DIRECT}`} style={{ marginLeft: ".6rem" }}>{d.sourceLabel}</span>}</h2>
            <button type="button" className={m.iconBtn} onClick={() => drawer.current?.close()} aria-label="Close inquiry review"><X size={20} aria-hidden /></button>
          </header>

          {detail.kind === "loading" && <p role="status">Loading inquiry…</p>}
          {detail.kind === "error" && <p role="alert" className={m.err}>{detail.message} <button type="button" className={prof.btnSecondary} onClick={reload}>Retry</button></p>}

          {d && act && (
            <>
              <div className={m.actions} role="group" aria-label="Administrative actions">
                {act.route.permitted && (
                  <div><button type="button" className={prof.btnGold} disabled={!act.route.available} aria-describedby={act.route.reason ? `${uid}-route-why` : undefined} onClick={() => openAction({ kind: "route" })}><GitBranch size={16} aria-hidden /> Manage routing</button>{act.route.reason && <span id={`${uid}-route-why`} className={m.actionNote}>{act.route.reason}</span>}</div>
                )}
                {act.pause.permitted && d.distribution?.state !== "PAUSED" && (
                  <div><button type="button" className={prof.btnSecondary} disabled={!act.pause.available} aria-describedby={act.pause.reason ? `${uid}-pause-why` : undefined} onClick={() => openAction({ kind: "job", action: "pause" })}><Pause size={16} aria-hidden /> Pause distribution</button>{act.pause.reason && <span id={`${uid}-pause-why`} className={m.actionNote}>{act.pause.reason}</span>}</div>
                )}
                {act.resume.permitted && d.distribution?.state === "PAUSED" && (
                  <div><button type="button" className={prof.btnGold} disabled={!act.resume.available} onClick={() => openAction({ kind: "job", action: "resume" })}><Play size={16} aria-hidden /> Resume distribution</button></div>
                )}
                {act.retry.permitted && (d.distribution?.state === "FAILED" || d.distribution?.state === "PARTIAL") && (
                  <div><button type="button" className={prof.btnSecondary} disabled={!act.retry.available} aria-describedby={act.retry.reason ? `${uid}-retry-why` : undefined} onClick={() => openAction({ kind: "job", action: "retry" })}><RotateCcw size={16} aria-hidden /> Retry distribution</button>{act.retry.reason && <span id={`${uid}-retry-why`} className={m.actionNote}>{act.retry.reason}</span>}</div>
                )}
                {caps.audit && <div><button type="button" className={prof.btnSecondary} onClick={() => setTab("activity")}><FileText size={16} aria-hidden /> View audit history</button></div>}
                <div><button type="button" className={prof.btnSecondary} disabled aria-describedby={`${uid}-restrict-why`}><Ban size={16} aria-hidden /> Restrict inquiry</button><span id={`${uid}-restrict-why`} className={m.actionNote}>{act.restrict.reason}</span></div>
              </div>

              <div className={m.tabs} role="tablist" aria-label="Inquiry sections">
                {tabs.map((t, i) => (
                  <button key={t.key} type="button" role="tab" id={`${uid}-tab-${t.key}`} aria-selected={tab === t.key} aria-controls={`${uid}-panel-${t.key}`} tabIndex={tab === t.key ? 0 : -1} className={m.tab} onClick={() => setTab(t.key)} onKeyDown={(e) => onTabKey(e, i)}>{t.label}</button>
                ))}
              </div>

              {tab === "requirement" && (
                <div role="tabpanel" id={`${uid}-panel-requirement`} aria-labelledby={`${uid}-tab-requirement`} className={m.panelBody}>
                  <div className={m.box}>
                    <p className={m.boxTitle}>Original requirement (read-only)</p>
                    {d.requirement}{d.quantityText ? ` · ${d.quantityText}` : ""}{d.category ? ` · ${d.category}` : ""}
                  </div>
                  <div className={m.box}>
                    <p className={m.boxTitle}>{d.source === "GENERAL" ? "Selected supplier" : "Original selected supplier"}</p>
                    {d.source === "GENERAL" ? "None. A general requirement has no buyer-selected supplier; matching suppliers receive it." : d.selectedSupplier ?? "Not recorded"}
                  </div>
                  {d.requirementDetail === null ? (
                    <p className={m.note}>Your account is not permitted to read requirement content (specifications, message and delivery).</p>
                  ) : (
                    <>
                      {d.requirementDetail.specifications.length > 0 && (<><h3>Specifications</h3><dl className={m.defs}>{d.requirementDetail.specifications.map((s) => <div key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}</dl></>)}
                      <h3>Buyer message</h3>
                      <p className={m.box}>{d.requirementDetail.message || "No message was written."}</p>
                      <dl className={m.defs}>
                        {d.requirementDetail.delivery && <div><dt>Delivery</dt><dd>{d.requirementDetail.delivery}</dd></div>}
                        {d.requirementDetail.requiredBy && <div><dt>Required by</dt><dd>{day(d.requirementDetail.requiredBy)}</dd></div>}
                      </dl>
                    </>
                  )}
                  <dl className={m.defs}>
                    <div><dt>Buyer</dt><dd>{d.buyer}</dd></div>
                    <div><dt>Received</dt><dd>{fmt(d.receivedAt)}</dd></div>
                    <div><dt>Lifecycle</dt><dd>{d.statusLabel}</dd></div>
                    {d.distribution && <div><dt>Distribution</dt><dd><span className={badge(d.distribution.tone)}>{d.distribution.label}</span>{d.distribution.hasError && " · a worker error was recorded"}</dd></div>}
                  </dl>
                  {d.distribution && (
                    <p className={m.muted}>
                      Matching candidates: {d.distribution.candidates ?? "not calculated yet"} · recipients added by the worker: {d.distribution.counts.created} · skipped: {d.distribution.counts.skipped}{d.distribution.truncated ? " · the candidate list was capped" : ""}
                      {d.distribution.pause ? ` · paused ${fmt(d.distribution.pause.at)}: ${d.distribution.pause.reason}` : ""}
                    </p>
                  )}
                  {d.history.length > 0 && (<><h3>Lifecycle history (visible to the buyer)</h3><ul className={m.list}>{d.history.map((h, i) => <li key={i}>{h.to} · {h.actor} · {fmt(h.at)}</li>)}</ul></>)}
                  <h3>Supplier responses</h3>
                  {d.responses === null ? <p className={m.muted}>Your account is not permitted to read supplier responses.</p> : d.responses.length === 0 ? <p className={m.muted}>No response has been recorded.</p> : (
                    <ul className={m.list}>{d.responses.map((r, i) => <li key={i}><strong>{r.company || r.author}</strong> · {r.sender} · {r.type === "CLARIFICATION" ? "Clarification request" : "Response"} · {fmt(r.at)}<p>{r.body}</p></li>)}</ul>
                  )}
                  <h3>Quotations (read-only summary)</h3>
                  {d.quotations === null ? <p className={m.muted}>Your account is not permitted to read quotations.</p> : d.quotations.length === 0 ? <p className={m.muted}>No quotation has been sent.</p> : (
                    <ul className={m.list}>{d.quotations.map((q) => <li key={q.reference}><strong>{q.reference}</strong> v{q.version} · {q.company} · {q.status.replaceAll("_", " ").toLowerCase()} · sent {day(q.sentAt)} · valid until {day(q.validUntil)}</li>)}</ul>
                  )}
                  {d.quotations && <p className={m.muted}>An administrator quotation page does not exist yet, so only this summary is shown. Amounts and quotation actions are not available here.</p>}
                </div>
              )}

              {tab === "recipients" && caps.recipients && (
                <div role="tabpanel" id={`${uid}-panel-recipients`} aria-labelledby={`${uid}-tab-recipients`} className={m.panelBody}>
                  {recips.kind === "loading" && <p role="status">Loading recipients…</p>}
                  {recips.kind === "error" && <p role="alert" className={m.err}>{recips.message} <button type="button" className={prof.btnSecondary} onClick={reload}>Retry</button></p>}
                  {recips.kind === "ok" && (
                    <>
                      {recips.data.recipients.length === 0 ? <p className={m.muted}>{d.source === "GENERAL" ? "No supplier company holds this requirement yet." : "No recipient is recorded."}</p> : (
                        <div className={m.tableWrap}>
                          <table className={m.recipients}>
                            <caption className={m.sr}>Companies holding this requirement</caption>
                            <thead><tr><th scope="col">Company</th><th scope="col">Type</th><th scope="col">Why</th><th scope="col">Progress</th><th scope="col">Lead notice</th><th scope="col">Added</th><th scope="col">Messages</th><th scope="col">Quotation</th></tr></thead>
                            <tbody>
                              {recips.data.recipients.map((r, i) => (
                                <tr key={i}>
                                  <th scope="row">{r.company}</th>
                                  <td>{r.kind === "DIRECT" ? "Direct" : "Matched"}<span className={m.sub}>{r.origin}</span></td>
                                  <td>{r.reason}{r.policy ? <span className={m.sub}>Policy {r.policy}</span> : null}</td>
                                  <td>{r.progress}</td>
                                  <td>{r.notice ?? "No record"}</td>
                                  <td>{day(r.addedAt)}</td>
                                  <td>{r.messages}</td>
                                  <td>{r.quotation ? `${r.quotation.reference} (${r.quotation.status.replaceAll("_", " ").toLowerCase()})` : "None"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <p className={m.muted}>{recips.data.total} {recips.data.total === 1 ? "company holds" : "companies hold"} this requirement{recips.data.truncated ? " (the first 100 matched companies are listed)" : ""}. A recipient row does not prove delivery: the lead-notice column shows only what was recorded.</p>
                      {recips.data.routing && recips.data.routing.unavailable && <p className={m.note}>{recips.data.routing.unavailable}</p>}
                      {recips.data.routing && recips.data.routing.candidates.length > 0 && <p className={m.note}>{recips.data.routing.candidates.length} {recips.data.routing.candidates.length === 1 ? "company qualifies" : "companies qualify"} for routing repair. Use Manage routing to add one.</p>}
                    </>
                  )}
                </div>
              )}

              {tab === "activity" && caps.audit && (
                <div role="tabpanel" id={`${uid}-panel-activity`} aria-labelledby={`${uid}-tab-activity`} className={m.panelBody}>
                  <p className={m.muted}>Administrative actions recorded for this inquiry. This is separate from the lifecycle history the buyer can see.</p>
                  {activity.state.kind === "error" && <p role="alert" className={m.err}>{activity.state.message} <button type="button" className={prof.btnSecondary} onClick={() => void loadActivity(null, true)}>Retry</button></p>}
                  {activity.state.kind === "loading" && activity.items.length === 0 && <p role="status">Loading activity…</p>}
                  {activity.state.kind === "ok" && activity.items.length === 0 && <p className={m.muted}>No administrative action has been recorded for this inquiry.</p>}
                  {activity.items.length > 0 && (
                    <div className={m.tableWrap}>
                      <table className={m.recipients}>
                        <caption className={m.sr}>Administrative actions</caption>
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

      <dialog ref={dialog} className={m.dialog} aria-labelledby={`${uid}-dlg`} onClick={closeOnBackdrop(dialog)} onClose={() => setMode(null)}>
        {mode && copy && (
          <form method="dialog" className={m.dialogBody} onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
            <h2 id={`${uid}-dlg`} className={m.drawerTitle}>{copy.title}</h2>
            <p>{copy.body}</p>
            {mode.kind === "route" && (
              <div className={auth.field}>
                <span id={`${uid}-co-l`} className={auth.label}>Eligible additional supplier <span aria-hidden>*</span></span>
                {recips.kind === "ok" && recips.data.routing && recips.data.routing.candidates.length > 0 ? (
                  <Dropdown id={`${uid}-co`} value={companyId} onChange={(v) => { setCompanyId(v); setFieldErrors({}); setServerError(""); }} describedBy={companyError ? `${uid}-co-err` : undefined} options={[{ value: "", label: "Select a supplier" }, ...recips.data.routing.candidates.map((c) => ({ value: c.companyId, label: c.name }))]} />
                ) : (
                  <p className={m.note}>{recips.kind === "loading" ? "Loading eligible suppliers…" : recips.kind === "ok" ? recips.data.routing?.unavailable ?? "No eligible supplier is available." : "Open the Recipients tab to load the eligible suppliers."}</p>
                )}
                {companyError && <p id={`${uid}-co-err`} className={m.err} role="alert">{companyError}</p>}
              </div>
            )}
            <div className={auth.field}>
              <label htmlFor={`${uid}-reason`} className={auth.label}>Reason <span aria-hidden>*</span></label>
              <textarea id={`${uid}-reason`} className={auth.control} rows={4} maxLength={REASON_MAX} value={reason} aria-required="true" aria-invalid={reasonError ? true : undefined} aria-describedby={reasonError ? `${uid}-reason-err` : `${uid}-reason-hint`} onChange={(e) => { setReason(e.target.value); setFieldErrors({}); setServerError(""); }} onBlur={() => setTouched(true)} placeholder="Why is this change needed?" />
              <p id={`${uid}-reason-hint`} className={m.muted}>Recorded in the audit history. Never shown to the buyer or the supplier.</p>
              {reasonError && <p id={`${uid}-reason-err`} className={m.err} role="alert">{reasonError}</p>}
            </div>
            {serverError && <p className={m.err} role="alert">{serverError}</p>}
            <div className={m.dialogActions}>
              <button type="button" className={prof.btnSecondary} onClick={() => dialog.current?.close()}>Cancel</button>
              <button type="submit" className={prof.btnGold} disabled={busy || (mode.kind === "route" && !(recips.kind === "ok" && (recips.data.routing?.candidates.length ?? 0) > 0))}>{busy ? copy.busy : copy.button}</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
