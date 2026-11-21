"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Lock, X } from "lucide-react";
import auth from "@/components/auth/Auth.module.css";
import prof from "@/components/supplier/profile/SupplierProfile.module.css";
import { flashToast } from "@/components/ui/Toast";
import { REASON_MAX, cleanReason, validateReason } from "@/lib/admin/categoryRules";
import type { ActivityItem, CategoryDetail, Caps } from "@/lib/admin/categoryManagement";
import s from "./AdminInquiries.module.css";
import m from "./AdminInquiryManagement.module.css";

const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
type Load<T> = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "ok"; data: T };
type TabKey = "details" | "activity";

async function getJson<T>(url: string, signal?: AbortSignal): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const res = await fetch(url, { cache: "no-store", signal }).catch(() => null);
  if (signal?.aborted) return { ok: false, message: "" };
  const json = res ? await res.json().catch(() => null) : null;
  return res?.ok && json?.ok ? { ok: true, data: json.data as T } : { ok: false, message: json?.message ?? (res ? "Could not load this." : "Network error. Check your connection and retry.") };
}

export function AdminCategoryReview({ reference, caps, onClose, onChanged }: { reference: string | null; caps: Caps; onClose: () => void; onChanged: () => void }) {
  const uid = useId();
  const drawer = useRef<HTMLDialogElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<Load<CategoryDetail>>({ kind: "idle" });
  const [tab, setTab] = useState<TabKey>("details");
  const [activity, setActivity] = useState<{ state: Load<null>; items: ActivityItem[]; next: string | null }>({ state: { kind: "idle" }, items: [], next: null });
  const [tick, setTick] = useState(0);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const keyRef = useRef<{ sig: string; key: string } | null>(null);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!reference) { if (drawer.current?.open) drawer.current.close(); return; }
    setTab("details");
    setActivity({ state: { kind: "idle" }, items: [], next: null });
    if (!drawer.current?.open) drawer.current?.showModal();
  }, [reference]);

  useEffect(() => {
    if (!reference) return;
    const ctl = new AbortController();
    setDetail((d) => (d.kind === "ok" && d.data.ref === reference ? d : { kind: "loading" }));
    void getJson<CategoryDetail>(`/api/admin/categories/${encodeURIComponent(reference)}`, ctl.signal).then((r) => { if (!ctl.signal.aborted) setDetail(r.ok ? { kind: "ok", data: r.data } : { kind: "error", message: r.message }); });
    return () => ctl.abort();
  }, [reference, tick]);

  const loadActivity = useCallback(async (cursor: string | null, replace: boolean) => {
    if (!reference) return;
    setActivity((a) => ({ ...a, state: { kind: "loading" } }));
    const r = await getJson<{ items: ActivityItem[]; nextCursor: string | null }>(`/api/admin/categories/${encodeURIComponent(reference)}/activity${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
    setActivity((a) => (r.ok ? { state: { kind: "ok", data: null }, items: replace ? r.data.items : [...a.items, ...r.data.items], next: r.data.nextCursor } : { ...a, state: { kind: "error", message: r.message } }));
  }, [reference]);
  useEffect(() => { if (reference && tab === "activity" && caps.audit) void loadActivity(null, true); }, [reference, tab, tick, caps.audit, loadActivity]);

  const d = detail.kind === "ok" ? detail.data : null;
  const tabs: { key: TabKey; label: string }[] = [{ key: "details", label: "Details" }, ...(caps.audit ? [{ key: "activity" as const, label: "Activity" }] : [])];
  function onTabKey(e: React.KeyboardEvent, i: number) {
    const to = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i + tabs.length - 1) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    setTab(tabs[to].key);
    document.getElementById(`${uid}-tab-${tabs[to].key}`)?.focus();
  }

  const reasonError = (touched ? validateReason(cleanReason(reason)) : null) ?? fieldErrors.reason ?? null;
  const next = d ? !d.ownActive : false;
  function openDialog() { setReason(""); setTouched(false); setServerError(""); setFieldErrors({}); keyRef.current = null; dialog.current?.showModal(); }
  const keyFor = (sig: string) => { if (!keyRef.current || keyRef.current.sig !== sig) keyRef.current = { sig, key: crypto.randomUUID() }; return keyRef.current.key; };

  async function submit() {
    if (!d || !reference) return;
    setTouched(true);
    const text = cleanReason(reason);
    if (validateReason(text)) return;
    setBusy(true); setServerError(""); setFieldErrors({});
    const sig = JSON.stringify([next, text, d.revision]);
    const res = await fetch(`/api/admin/categories/${encodeURIComponent(reference)}/activation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: next, reason: text, expectedRev: d.revision, idempotencyKey: keyFor(sig) }) }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (res?.ok && json?.ok) { flashToast("success", String(json.message ?? "Saved.")); dialog.current?.close(); reload(); onChanged(); return; }
    setFieldErrors(json?.fields ?? {});
    setServerError(json?.message ?? (res ? "The change could not be saved." : "Network error. Nothing was saved. Check your connection and try again."));
    flashToast("error", "Not saved.");
    if (res?.status === 409) reload();
  }
  const closeOnBackdrop = (ref: React.RefObject<HTMLDialogElement | null>) => (e: React.MouseEvent<HTMLDialogElement>) => { if (e.target === ref.current) ref.current?.close(); };
  const act = d?.actions.activation;

  return (
    <>
      <dialog ref={drawer} className={m.drawer} aria-labelledby={`${uid}-title`} onClick={closeOnBackdrop(drawer)} onClose={() => { if (reference) onClose(); }}>
        <div className={m.drawerBody}>
          <header className={m.drawerHead}>
            <h2 id={`${uid}-title`} className={m.drawerTitle}>{d ? d.name : "Category"}{d && <span className={s.badge} style={{ marginLeft: ".6rem" }}>{d.level === "MAIN" ? "Main category" : d.level === "DEPARTMENT" ? "Department" : "Product category"}</span>}</h2>
            <button type="button" className={m.iconBtn} onClick={() => drawer.current?.close()} aria-label="Close category review"><X size={20} aria-hidden /></button>
          </header>
          {detail.kind === "loading" && <p role="status">Loading category…</p>}
          {detail.kind === "error" && <p role="alert" className={m.err}>{detail.message} <button type="button" className={prof.btnSecondary} onClick={reload}>Retry</button></p>}

          {d && (
            <>
              <div className={m.tabs} role="tablist" aria-label="Category sections">
                {tabs.map((t, i) => <button key={t.key} type="button" role="tab" id={`${uid}-tab-${t.key}`} aria-selected={tab === t.key} aria-controls={`${uid}-panel-${t.key}`} tabIndex={tab === t.key ? 0 : -1} className={m.tab} onClick={() => setTab(t.key)} onKeyDown={(e) => onTabKey(e, i)}>{t.label}</button>)}
              </div>

              {tab === "details" && (
                <div role="tabpanel" id={`${uid}-panel-details`} aria-labelledby={`${uid}-tab-details`} className={m.panelBody}>
                  <dl className={m.defs}>
                    <div><dt>Path</dt><dd>{d.path.map((p) => p.name).join(" › ")}</dd></div>
                    <div><dt>Identity</dt><dd>{d.id} <span className={m.muted}>(fixed: URLs and product references depend on it)</span></dd></div>
                    <div><dt>Admin status</dt><dd><span className={`${s.badge} ${d.ownActive ? m.tone_ok : m.tone_bad}`}>{d.ownActive ? "Active" : "Inactive"}</span>{d.level !== "MAIN" && <span className={m.muted}> follows its main category</span>}</dd></div>
                    <div><dt>Effective</dt><dd>{d.effectiveActive ? "Active" : "Inactive"}</dd></div>
                    <div><dt>Public visibility</dt><dd>{!d.effectiveActive ? "Hidden by an administrator" : d.discoverable ? "Discoverable" : "Active, but no eligible public products yet"}</dd></div>
                    <div><dt>Eligible products</dt><dd>{d.eligibleProducts.toLocaleString("en-IN")} <span className={m.muted}>({d.countScope.toLowerCase()}; counted without the activation gate)</span></dd></div>
                    <div><dt>Source</dt><dd>{d.source === "catalog" ? "Product catalogue" : "Curated category"}</dd></div>
                    {d.internalReason && <div><dt>Deactivation reason</dt><dd>{d.internalReason} <span className={m.muted}>(internal)</span></dd></div>}
                  </dl>
                  {d.description && <p className={m.box}>{d.description}</p>}
                  {d.children.length > 0 && (<><h3>Below this category</h3><ul className={m.list}>{d.children.map((c) => <li key={c.id}>{c.name} · {c.eligibleProducts.toLocaleString("en-IN")} eligible</li>)}</ul></>)}

                  <h3>Impact of changing availability</h3>
                  <p className={m.muted}>{d.impact.eligibleProducts.toLocaleString("en-IN")} eligible products in this category ({d.impact.catalogueProducts.toLocaleString("en-IN")} catalogue, {d.impact.supplierProducts.toLocaleString("en-IN")} supplier-created), {d.impact.descendants.toLocaleString("en-IN")} categories below it.</p>
                  <ul className={m.list}>{d.impact.effects.map((e) => <li key={e}>{e}</li>)}</ul>

                  <fieldset className={m.box} style={{ border: 0 }}>
                    <legend className={m.boxTitle}>Edit category</legend>
                    <p className={m.muted}><Lock size={14} aria-hidden /> Name, slug, parent and description cannot be changed yet: {d.unsupported.join(", ").toLowerCase()} are not supported (public pages, product references, supplier forms and matching rules are tied to the code-defined categories, and there is no redirect layer).</p>
                    <div className={m.actions}>
                      {act?.permitted ? (
                        <div>
                          <button type="button" className={d.ownActive ? prof.btnSecondary : prof.btnGold} disabled={!act.available} aria-describedby={act.reason ? `${uid}-why` : undefined} onClick={openDialog}>{d.ownActive ? "Deactivate category" : "Reactivate category"}</button>
                          {act.reason && <span id={`${uid}-why`} className={m.actionNote}>{act.reason}</span>}
                        </div>
                      ) : <p className={m.muted}>Your account may view categories but may not change their availability.</p>}
                    </div>
                  </fieldset>
                </div>
              )}

              {tab === "activity" && caps.audit && (
                <div role="tabpanel" id={`${uid}-panel-activity`} aria-labelledby={`${uid}-tab-activity`} className={m.panelBody}>
                  {activity.state.kind === "error" && <p role="alert" className={m.err}>{activity.state.message} <button type="button" className={prof.btnSecondary} onClick={() => void loadActivity(null, true)}>Retry</button></p>}
                  {activity.state.kind === "loading" && activity.items.length === 0 && <p role="status">Loading activity…</p>}
                  {activity.state.kind === "ok" && activity.items.length === 0 && <p className={m.muted}>No administrative change has been recorded for this branch.</p>}
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

      <dialog ref={dialog} className={m.dialog} aria-labelledby={`${uid}-dlg`} onClick={closeOnBackdrop(dialog)}>
        {d && (
          <form method="dialog" className={m.dialogBody} onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
            <h2 id={`${uid}-dlg`} className={m.drawerTitle}>{next ? "Reactivate" : "Deactivate"} {d.name}?</h2>
            <ul className={m.list} aria-label="What this does">{d.impact.effects.map((e) => <li key={e}>{e}</li>)}</ul>
            <div className={auth.field}>
              <label htmlFor={`${uid}-reason`} className={auth.label}>Reason <span aria-hidden>*</span></label>
              <textarea id={`${uid}-reason`} className={auth.control} rows={4} maxLength={REASON_MAX} value={reason} aria-required="true" aria-invalid={reasonError ? true : undefined} aria-describedby={reasonError ? `${uid}-reason-err` : `${uid}-reason-hint`} onChange={(e) => { setReason(e.target.value); setFieldErrors({}); setServerError(""); }} onBlur={() => setTouched(true)} placeholder="Why is this change needed?" />
              <p id={`${uid}-reason-hint`} className={m.muted}>Recorded in the audit history (internal).</p>
              {reasonError && <p id={`${uid}-reason-err`} className={m.err} role="alert">{reasonError}</p>}
            </div>
            {serverError && <p className={m.err} role="alert">{serverError}</p>}
            <div className={m.dialogActions}>
              <button type="button" className={prof.btnSecondary} onClick={() => dialog.current?.close()}>Cancel</button>
              <button type="submit" className={prof.btnGold} disabled={busy}>{busy ? "Saving…" : next ? "Confirm reactivation" : "Confirm deactivation"}</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
