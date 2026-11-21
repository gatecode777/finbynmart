"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Info, Search, X } from "lucide-react";
import auth from "@/components/auth/Auth.module.css";
import prof from "@/components/supplier/profile/SupplierProfile.module.css";
import { Dropdown } from "@/components/ui/Dropdown";
import { NOT_RECORDED, SEARCH_RE, defaultRange, parseRange } from "@/lib/admin/auditRules";
import type { AuditDetail, AuditList } from "@/lib/admin/auditLogs";
import r from "./AdminReports.module.css";
import s from "./AdminInquiries.module.css";
import m from "./AdminInquiryManagement.module.css";

interface State { action: string; q: string; from: string; to: string }
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST";
const qs = (st: State, cursor?: string | null) => { const p = new URLSearchParams(); if (st.action !== "all") p.set("action", st.action); if (st.q) p.set("q", st.q); p.set("from", st.from); p.set("to", st.to); if (cursor) p.set("cursor", cursor); return p.toString(); };
type Load = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string; status: number } | { kind: "ok"; data: AuditDetail };

/**
 * The audit history viewer. Read-only: there is no edit, delete, undo or export control. The applied filters (action, target reference, From, To) are in the URL and drive the request; a response
 * that arrives after a newer one is ignored; a failure keeps the filters and shows Retry (never an empty history); a detail shows only allowlisted fields.
 */
export function AdminAuditWorkspace({ initial, state, today, initialError, noScope, failed, actions }: { initial: AuditList | null; state: State; today: string; initialError: string | null; noScope: boolean; failed: boolean; actions: { key: string; label: string }[] }) {
  const uid = useId();
  const [applied, setApplied] = useState<State>(state);
  const [draft, setDraft] = useState<State>(state);
  const [data, setData] = useState<AuditList | null>(initial);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [pageIx, setPageIx] = useState(0);
  const [error, setError] = useState(failed ? "The audit history could not be loaded." : "");
  const [formError, setFormError] = useState(initialError ?? "");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const seq = useRef(0);
  const first = useRef(true);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setBusy(true);
    let res: Response | null = null;
    try { res = await fetch(`/api/admin/audit-logs?${qs(applied, cursors[pageIx])}`, { cache: "no-store", credentials: "same-origin" }); } catch { res = null; }
    const json = res ? await res.json().catch(() => null) : null;
    if (mine !== seq.current) return; // a newer request owns the screen
    setBusy(false);
    if (res?.ok && json?.ok) { setData(json.data); setError(""); }
    else if (res?.status === 422) setFormError(json?.fields?.range ?? json?.fields?.q ?? json?.message ?? "Check the filters.");
    else setError(res?.status === 403 ? "You do not have permission to view the audit history." : json?.message ?? (res ? "The audit history could not be loaded." : "Network error. Check your connection and retry."));
  }, [applied, cursors, pageIx]);

  useEffect(() => {
    if (first.current) { first.current = false; if (failed) void load(); return; }
    void load();
  }, [load, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onPop = () => {
      const sp = new URLSearchParams(window.location.search);
      const d = defaultRange();
      const next = { action: sp.get("action") ?? "all", q: sp.get("q") ?? "", from: sp.get("from") ?? d.startDay, to: sp.get("to") ?? d.endDay };
      setDraft(next); setApplied(next); setCursors([null]); setPageIx(0); setFormError("");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const q = draft.q.trim();
    if (q && !SEARCH_RE.test(q)) { setFormError("Search by a target reference: letters, digits and - ~ / _ only."); return; }
    const range = parseRange(draft.from, draft.to);
    if (!range.ok) { setFormError(range.message); return; }
    setFormError("");
    const next = { ...draft, q };
    window.history.pushState(null, "", `/admin/audit-logs?${qs(next)}`);
    setApplied(next); setCursors([null]); setPageIx(0);
  }
  function reset() {
    const d = defaultRange();
    const next = { action: "all", q: "", from: d.startDay, to: d.endDay };
    setDraft(next); setFormError(""); window.history.pushState(null, "", "/admin/audit-logs");
    setApplied(next); setCursors([null]); setPageIx(0);
  }
  const next = () => { if (data?.nextCursor) { setCursors((c) => [...c.slice(0, pageIx + 1), data.nextCursor]); setPageIx((i) => i + 1); } };
  const filtered = applied.action !== "all" || applied.q !== "";

  return (
    <>
      {noScope ? (
        <p className={s.empty}>Your account can read the audit history, but it does not hold the access to any workflow whose events are recorded. Each event type needs the permission of its own area.</p>
      ) : (
        <>
          <form className={r.form} onSubmit={apply} noValidate aria-label="Audit log filters">
            <div className={r.field}>
              <label htmlFor={`${uid}-act`} className={r.lbl}>Action</label>
              <Dropdown id={`${uid}-act`} value={draft.action} onChange={(v) => setDraft({ ...draft, action: v })} options={[{ value: "all", label: "All actions" }, ...actions.map((a) => ({ value: a.key, label: a.label }))]} />
            </div>
            <div className={r.field}>
              <label htmlFor={`${uid}-q`} className={r.lbl}>Target reference</label>
              <div className={s.search}><Search size={16} aria-hidden className={s.searchIcon} /><input id={`${uid}-q`} className={auth.control} placeholder="Search target reference" value={draft.q} maxLength={60} aria-invalid={formError && /reference/.test(formError) ? true : undefined} aria-describedby={formError ? `${uid}-err` : undefined} onChange={(e) => setDraft({ ...draft, q: e.target.value })} /></div>
            </div>
            <div className={r.field}>
              <label htmlFor={`${uid}-from`} className={r.lbl}>From</label>
              <input id={`${uid}-from`} type="date" className={r.date} value={draft.from} max={today} aria-invalid={formError && !/reference/.test(formError) ? true : undefined} aria-describedby={formError ? `${uid}-err` : undefined} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
            </div>
            <div className={r.field}>
              <label htmlFor={`${uid}-to`} className={r.lbl}>To</label>
              <input id={`${uid}-to`} type="date" className={r.date} value={draft.to} max={today} aria-invalid={formError && !/reference/.test(formError) ? true : undefined} aria-describedby={formError ? `${uid}-err` : undefined} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
            </div>
            <div className={r.actions}>
              <button type="submit" className={prof.btnGold}>Apply</button>
              <button type="button" className={prof.btnSecondary} onClick={reset}>Reset</button>
            </div>
            {formError && <p id={`${uid}-err`} className={r.err} role="alert" style={{ gridColumn: "1 / -1" }}>{formError} (Dates are calendar days in Asia/Kolkata, at most 366 days, not in the future.)</p>}
          </form>

          {error && <p role="alert" className={r.err} style={{ marginBottom: "1rem" }}>{error} <button type="button" className={prof.btnSecondary} onClick={() => setTick((t) => t + 1)}>Retry</button></p>}
          <p className="visually-hidden" role="status" aria-live="polite">{busy ? "Loading audit events." : ""}</p>

          <section className={`${s.panel} ${busy ? s.busy : ""}`} aria-label="Recorded events" aria-busy={busy}>
            {!data ? (
              busy ? <ul className={m.skeleton} aria-hidden>{[0, 1, 2, 3].map((i) => <li key={i} />)}</ul> : null
            ) : data.items.length === 0 ? (
              <p className={s.empty}>{filtered || applied.from !== defaultRange().startDay ? "No recorded events match these filters in this period." : "No events have been recorded in this period."}</p>
            ) : (
              <>
                <table className={s.table}>
                  <caption className={s.sr}>Recorded administrative events, newest first</caption>
                  <thead><tr><th scope="col">Time</th><th scope="col">Actor</th><th scope="col">Action</th><th scope="col">Target</th><th scope="col">Details</th></tr></thead>
                  <tbody>
                    {data.items.map((e) => (
                      <tr key={e.eventKey} className={open === e.eventKey ? s.rowOn : undefined}>
                        <th scope="row">{when(e.recordedAt)}</th>
                        <td><span style={{ overflowWrap: "anywhere" }}>{e.actor.label}</span></td>
                        <td><span style={{ overflowWrap: "anywhere" }}>{e.label}</span></td>
                        <td><span style={{ overflowWrap: "anywhere" }}>{e.target.reference ?? e.target.type}</span></td>
                        <td><button type="button" className={prof.btnSecondary} onClick={() => setOpen(e.eventKey)} aria-label={`View details of ${e.label}, ${when(e.recordedAt)}`}>View Details</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className={s.cards} aria-label="Recorded events">
                  {data.items.map((e) => (
                    <li key={e.eventKey} className={s.card}>
                      <div className={s.cardHead}><strong style={{ overflowWrap: "anywhere" }}>{e.label}</strong></div>
                      <dl className={s.facts}>
                        <div><dt>Time</dt><dd>{when(e.recordedAt)}</dd></div>
                        <div><dt>Actor</dt><dd style={{ overflowWrap: "anywhere" }}>{e.actor.label}</dd></div>
                        <div><dt>Target</dt><dd style={{ overflowWrap: "anywhere" }}>{e.target.reference ?? e.target.type}</dd></div>
                      </dl>
                      <button type="button" className={prof.btnSecondary} onClick={() => setOpen(e.eventKey)} aria-label={`View details of ${e.label}, ${when(e.recordedAt)}`}>View Details</button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className={s.pager}>
              <span className={s.note} style={{ margin: 0 }}><Info size={14} aria-hidden /> This view shows events actually recorded by supported workflows.</span>
              <span className={s.pagerBtns}>
                <button type="button" className={prof.btnSecondary} disabled={pageIx === 0 || busy} onClick={() => setPageIx((i) => i - 1)}>Previous</button>
                <button type="button" className={prof.btnSecondary} disabled={!data?.nextCursor || busy} onClick={next}>Next</button>
              </span>
            </div>
          </section>

          {data && (
            <details className={r.card} style={{ marginTop: "1rem" }}>
              <summary>Coverage of this view</summary>
              <p className={r.note}>Workflows you can see: {data.coverage.workflows.join(", ") || "none"}. Times are in Asia/Kolkata (IST).</p>
              <p className={r.note}>Not recorded by any workflow, so they cannot appear: {NOT_RECORDED.join("; ")}. History before a workflow began recording is not available, and nothing here is reconstructed. This page has no edit or delete controls, which does not by itself make the stored history tamper-proof or guarantee its retention.</p>
            </details>
          )}
        </>
      )}
      <AuditDetailDialog eventKey={open} onClose={() => setOpen(null)} />
    </>
  );
}

function AuditDetailDialog({ eventKey, onClose }: { eventKey: string | null; onClose: () => void }) {
  const uid = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<Load>({ kind: "idle" });
  const [tick, setTick] = useState(0);
  useEffect(() => { if (!eventKey) { if (ref.current?.open) ref.current.close(); return; } if (!ref.current?.open) ref.current?.showModal(); }, [eventKey]);
  useEffect(() => {
    if (!eventKey) return;
    const ctl = new AbortController();
    setDetail((d) => (d.kind === "ok" && d.data.eventKey === eventKey ? d : { kind: "loading" }));
    void (async () => {
      const res = await fetch(`/api/admin/audit-logs/${eventKey}`, { cache: "no-store", signal: ctl.signal }).catch(() => null);
      if (ctl.signal.aborted) return;
      const json = res ? await res.json().catch(() => null) : null;
      setDetail(res?.ok && json?.ok ? { kind: "ok", data: json.data } : { kind: "error", status: res?.status ?? 0, message: res?.status === 403 ? "You do not have permission to view this event." : res?.status === 404 ? "This event was not found, or you may not view it." : json?.message ?? (res ? "Could not load this event." : "Network error. Check your connection and retry.") });
    })();
    return () => ctl.abort();
  }, [eventKey, tick]);
  const d = detail.kind === "ok" ? detail.data : null;
  return (
    <dialog ref={ref} className={m.drawer} aria-labelledby={`${uid}-t`} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }} onClose={() => { if (eventKey) onClose(); }}>
      <div className={m.drawerBody}>
        <header className={m.drawerHead}>
          <h2 id={`${uid}-t`} className={m.drawerTitle}>{d ? d.label : "Audit event"}</h2>
          <button type="button" className={m.iconBtn} onClick={() => ref.current?.close()} aria-label="Close event details"><X size={20} aria-hidden /></button>
        </header>
        {detail.kind === "loading" && <p role="status">Loading event…</p>}
        {detail.kind === "error" && <p role="alert" className={m.err}>{detail.message} {detail.status !== 403 && detail.status !== 404 && <button type="button" className={prof.btnSecondary} onClick={() => setTick((t) => t + 1)}>Retry</button>}</p>}
        {d && (
          <div className={m.panelBody}>
            <dl className={m.defs}>
              <div><dt>Event identifier</dt><dd style={{ overflowWrap: "anywhere" }}>{d.eventKey}</dd></div>
              <div><dt>Action</dt><dd>{d.label} <span className={m.muted}>({d.action})</span></dd></div>
              <div><dt>Workflow</dt><dd>{d.workflow}</dd></div>
              <div><dt>Actor</dt><dd>{d.actor.label}</dd></div>
              <div><dt>Target</dt><dd><span style={{ overflowWrap: "anywhere" }}>{d.target.type}{d.target.reference ? `: ${d.target.reference}` : ""}</span></dd></div>
              <div><dt>Recorded at</dt><dd>{when(d.recordedAt)}</dd></div>
              {d.summary && <div><dt>Summary</dt><dd>{d.summary}</dd></div>}
              {d.changes.map((c) => <div key={c.label}><dt>{c.label} change</dt><dd>{c.before} → {c.after}</dd></div>)}
              {d.reasonCode && <div><dt>Reason code</dt><dd>{d.reasonCode}</dd></div>}
              {d.reason && <div><dt>Recorded reason</dt><dd style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{d.reason}</dd></div>}
              {d.facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd style={{ overflowWrap: "anywhere" }}>{f.value}</dd></div>)}
            </dl>
            {d.notes.map((n) => <p key={n} className={m.muted}>{n}</p>)}
            <div className={m.actions} role="group" aria-label="Related record">
              {d.link ? <Link href={d.link.href} className={prof.btnSecondary}><ExternalLink size={16} aria-hidden /> {d.link.label}</Link> : <p className={m.muted}>No related-record link is available for this event with your permissions.</p>}
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
