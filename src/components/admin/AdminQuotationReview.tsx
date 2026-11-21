"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import prof from "@/components/supplier/profile/SupplierProfile.module.css";
import type { QuotationDetail } from "@/lib/admin/quotationManagement";
import s from "./AdminInquiries.module.css";
import m from "./AdminInquiryManagement.module.css";

const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const tone = (st: string) => (st === "ACCEPTED" ? m.tone_ok : st === "REJECTED" || st === "EXPIRED" || st === "WITHDRAWN" ? m.tone_bad : m.tone_muted);
type Load = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string; status: number } | { kind: "ok"; data: QuotationDetail };

/** Read-only quotation detail drawer: the current submitted version, its stored commercial snapshot and a labelled history of earlier submitted versions. It has no action that changes anything. */
export function AdminQuotationReview({ reference, onClose }: { reference: string | null; onClose: () => void }) {
  const uid = useId();
  const drawer = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<Load>({ kind: "idle" });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!reference) { if (drawer.current?.open) drawer.current.close(); return; }
    if (!drawer.current?.open) drawer.current?.showModal();
  }, [reference]);

  useEffect(() => {
    if (!reference) return;
    const ctl = new AbortController();
    setDetail((d) => (d.kind === "ok" && d.data.reference === reference ? d : { kind: "loading" }));
    void (async () => {
      const res = await fetch(`/api/admin/quotations/${reference}`, { cache: "no-store", signal: ctl.signal }).catch(() => null);
      if (ctl.signal.aborted) return;
      const json = res ? await res.json().catch(() => null) : null;
      setDetail(res?.ok && json?.ok ? { kind: "ok", data: json.data } : { kind: "error", status: res?.status ?? 0, message: res?.status === 403 ? "You do not have permission to view quotations." : res?.status === 404 ? "This quotation was not found, or it has not been submitted." : json?.message ?? (res ? "Could not load this quotation." : "Network error. Check your connection and retry.") });
    })();
    return () => ctl.abort();
  }, [reference, tick]);

  const d = detail.kind === "ok" ? detail.data : null;
  const closeOnBackdrop = (e: React.MouseEvent<HTMLDialogElement>) => { if (e.target === drawer.current) drawer.current?.close(); };

  return (
    <dialog ref={drawer} className={m.drawer} aria-labelledby={`${uid}-title`} onClick={closeOnBackdrop} onClose={() => { if (reference) onClose(); }}>
      <div className={m.drawerBody}>
        <header className={m.drawerHead}>
          <h2 id={`${uid}-title`} className={m.drawerTitle}>{d ? d.reference : "Quotation"}{d && <span className={s.badge} style={{ marginLeft: ".6rem" }}>Revision {d.version}</span>}</h2>
          <button type="button" className={m.iconBtn} onClick={() => drawer.current?.close()} aria-label="Close quotation details"><X size={20} aria-hidden /></button>
        </header>
        {detail.kind === "loading" && <p role="status">Loading quotation…</p>}
        {detail.kind === "error" && <p role="alert" className={m.err}>{detail.message} {detail.status !== 403 && detail.status !== 404 && <button type="button" className={prof.btnSecondary} onClick={reload}>Retry</button>}</p>}
        {d && (
          <div className={m.panelBody}>
            <p><span className={`${s.badge} ${tone(d.status)}`}>{d.statusLabel}</span> <span className={s.badge}>{d.source.label}</span> <span className={m.muted}>Read only: no action on this page changes a quotation.</span></p>
            {d.dataQuality.length > 0 && <div className={m.note} role="note"><strong>Data notes</strong><ul className={m.list}>{d.dataQuality.map((q) => <li key={q}>{q}</li>)}</ul></div>}

            <h3 className={m.sub}>Overview</h3>
            <dl className={m.defs}>
              <div><dt>Submitted</dt><dd>{fmt(d.submittedAt)}</dd></div>
              <div><dt>Valid until</dt><dd>{day(d.validUntil)}</dd></div>
              <div><dt>{d.supplier.relation}</dt><dd>{d.supplier.name}</dd></div>
              <div><dt>Requirement</dt><dd>{d.requirement.reference}{!d.requirement.available && <span className={m.muted}> (record unavailable)</span>}</dd></div>
              <div><dt>Buyer requested</dt><dd>{d.requirement.productName ?? "Not provided"}{d.requirement.quantity ? ` · ${d.requirement.quantity}` : ""}</dd></div>
              <div><dt>Supplier offered</dt><dd>{d.offered.productName} · {d.offered.quantity}</dd></div>
              <div><dt>Unit price</dt><dd>{d.offered.unitPrice} <span className={m.muted}>({d.offered.currency})</span></dd></div>
              <div><dt>Recorded buyer decision</dt><dd>{d.decision ? `${d.decision.type === "ACCEPTED" ? "Accepted" : "Rejected"} on ${fmt(d.decision.at)}` : d.revisionRequestedAt ? `Revision requested on ${fmt(d.revisionRequestedAt)}` : "No decision recorded"}</dd></div>
            </dl>
            {d.decision?.type === "ACCEPTED" && <p className={m.muted}>An acceptance records the buyer&apos;s decision only. It is not proof of an order, payment, shipping or fulfilment.</p>}

            <h3 className={m.sub}>Price breakdown <span className={m.muted}>(as stored with this revision)</span></h3>
            {d.breakdown.error ? <p className={m.err}>{d.breakdown.error}</p> : (
              <div className={m.tableWrap}>
                <table className={m.recipients}>
                  <caption className={m.sr}>Price breakdown</caption>
                  <tbody>{d.breakdown.rows.map((r) => <tr key={r.label}><th scope="row">{r.strong ? <strong>{r.label}</strong> : r.label}</th><td>{r.strong ? <strong>{r.value}</strong> : r.value}</td></tr>)}</tbody>
                </table>
              </div>
            )}
            {d.snapshot.recorded && <p className={m.muted}>Stored snapshot: total {d.snapshot.total} · {d.snapshot.taxRule}</p>}

            <h3 className={m.sub}>Commercial terms</h3>
            <dl className={m.defs}>{d.terms.map((t) => <div key={t.label}><dt>{t.label}</dt><dd>{t.value ?? "Not provided"}</dd></div>)}</dl>

            <h3 className={m.sub}>Revisions</h3>
            <div className={m.tableWrap}>
              <table className={m.recipients}>
                <caption className={m.sr}>Submitted revisions</caption>
                <thead><tr><th scope="col">Revision</th><th scope="col">Submitted</th><th scope="col">Status</th><th scope="col">Total</th><th scope="col">Valid until</th></tr></thead>
                <tbody>{d.versions.map((v) => <tr key={v.version}><th scope="row">{v.version}{v.current ? " (current)" : " (earlier)"}</th><td>{fmt(v.submittedAt)}</td><td>{v.statusLabel}</td><td>{v.total ?? "Not available"}</td><td>{day(v.validUntil)}</td></tr>)}</tbody>
              </table>
            </div>
            <p className={m.muted}>Only submitted revisions are listed. A supplier&apos;s private draft or in-progress revision is never shown.</p>

            <div className={m.actions} role="group" aria-label="Related records">
              {d.links.requirement ? <Link href={d.links.requirement} className={prof.btnSecondary}><ExternalLink size={16} aria-hidden /> View Requirement</Link> : <p className={m.muted}>The requirement link needs inquiry-read permission.</p>}
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
