"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Info, Search } from "lucide-react";
import auth from "@/components/auth/Auth.module.css";
import prof from "@/components/supplier/profile/SupplierProfile.module.css";
import { Dropdown } from "@/components/ui/Dropdown";
import { EMPTY_STATE, QUOTATION_FILTERS, SEARCH_MAX, toListParams, type QuotationFilter, type QuotationListState } from "@/lib/admin/quotationAdminRules";
import type { QuotationList } from "@/lib/admin/quotationManagement";
import { AdminQuotationReview } from "./AdminQuotationReview";
import s from "./AdminInquiries.module.css";
import m from "./AdminInquiryManagement.module.css";

export const toneOf = (st: string) => (st === "ACCEPTED" ? m.tone_ok : st === "REJECTED" || st === "EXPIRED" || st === "WITHDRAWN" ? m.tone_bad : m.tone_muted);

/**
 * The quotation list (read-only). Search and the status filter apply together when Search is pressed; the applied state drives the request, a response that arrives after a newer
 * request is ignored, and a failed request keeps the filters and rows and offers Retry (never an empty list).
 */
export function AdminQuotationsWorkspace({ initial, state, initialReview }: { initial: QuotationList | null; state: QuotationListState; initialReview: string | null }) {
  const uid = useId();
  const [data, setData] = useState<QuotationList | null>(initial);
  const [applied, setApplied] = useState<QuotationListState>(state);
  const [qDraft, setQDraft] = useState(state.q);
  const [statusDraft, setStatusDraft] = useState<QuotationFilter>(state.status);
  const [review, setReview] = useState<string | null>(initialReview);
  const [error, setError] = useState(initial ? "" : "The quotations could not be loaded.");
  const [qError, setQError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const first = useRef(true);

  const syncUrl = useCallback((st: QuotationListState, ref: string | null) => {
    const p = toListParams(st);
    if (ref) p.set("review", ref);
    window.history.replaceState(null, "", `/admin/quotations${p.size ? `?${p}` : ""}`);
  }, []);

  const load = useCallback(async () => {
    abort.current?.abort();
    const ctl = (abort.current = new AbortController());
    setBusy(true);
    const res = await fetch(`/api/admin/quotations?${toListParams(applied)}`, { cache: "no-store", signal: ctl.signal }).catch(() => null);
    if (ctl.signal.aborted) return; // a newer request owns the screen
    const json = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (res?.ok && json?.ok) { setData(json.data); setError(""); } else setError(json?.message ?? (res ? "The quotations could not be loaded." : "Network error. Check your connection and retry."));
  }, [applied]);

  useEffect(() => {
    if (first.current) { first.current = false; if (!initial) void load(); return; }
    void load();
  }, [load, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = qDraft.trim();
    if (q && !/^[A-Za-z0-9-]{1,40}$/.test(q)) { setQError("Search by a quotation or requirement reference: letters, digits and hyphens only."); return; }
    setQError("");
    const next: QuotationListState = { q, status: statusDraft, page: 1 };
    setApplied(next);
    syncUrl(next, review);
  }
  function reset() { setQDraft(""); setStatusDraft("all"); setQError(""); setApplied(EMPTY_STATE); syncUrl(EMPTY_STATE, review); }
  function goPage(p: number) { const next = { ...applied, page: p }; setApplied(next); syncUrl(next, review); }
  function openReview(ref: string) { setReview(ref); syncUrl(applied, ref); }
  function closeReview() { setReview(null); syncUrl(applied, null); }

  const filtered = applied.q !== "" || applied.status !== "all";
  const n = (v: number) => v.toLocaleString("en-IN");
  const mt = data?.meta;

  return (
    <>
      <form className={m.bar} onSubmit={submit} role="search" aria-label="Search quotations" noValidate>
        <div className={`${m.field} ${m.barSearch}`}>
          <label htmlFor={`${uid}-q`} className={m.lbl}>Search</label>
          <div className={s.search}>
            <Search size={16} aria-hidden className={s.searchIcon} />
            <input id={`${uid}-q`} className={auth.control} placeholder="Search quotation or requirement reference" value={qDraft} maxLength={SEARCH_MAX} aria-invalid={qError ? true : undefined} aria-describedby={qError ? `${uid}-qe` : undefined} onChange={(e) => setQDraft(e.target.value)} />
          </div>
          {qError && <p id={`${uid}-qe`} className={m.err} role="alert">{qError}</p>}
        </div>
        <div className={m.field}>
          <label htmlFor={`${uid}-status`} className={m.lbl}>Status</label>
          <Dropdown id={`${uid}-status`} value={statusDraft} onChange={(v) => setStatusDraft(v as QuotationFilter)} options={QUOTATION_FILTERS.map((x) => ({ value: x.key, label: x.label }))} />
        </div>
        <div className={m.barEnd}>
          <button type="submit" className={prof.btnGold}>Search</button>
          <button type="button" className={s.clear} onClick={reset} disabled={!filtered && qDraft === "" && statusDraft === "all"}>Reset</button>
        </div>
      </form>

      {error && <p role="alert" className={s.err}>{error} <button type="button" className={prof.btnSecondary} onClick={() => setTick((t) => t + 1)}>Retry</button></p>}
      <p className={s.sr} role="status" aria-live="polite">{busy ? "Loading quotations." : ""}</p>

      <section className={`${s.panel} ${busy ? s.busy : ""}`} aria-label="Submitted quotations" aria-busy={busy}>
        {!data ? (
          busy ? <ul className={m.skeleton} aria-hidden>{[0, 1, 2, 3].map((i) => <li key={i} />)}</ul> : null
        ) : data.items.length === 0 ? (
          <p className={s.empty}>{filtered ? "No quotations match these filters." : "No submitted quotations yet."}</p>
        ) : (
          <>
            <table className={s.table}>
              <caption className={s.sr}>Submitted quotations</caption>
              <thead><tr><th scope="col">Quotation</th><th scope="col">Requirement</th><th scope="col">Supplier</th><th scope="col">Total</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.reference} className={review === r.reference ? s.rowOn : undefined}>
                    <th scope="row"><span style={{ overflowWrap: "anywhere" }}>{r.reference}</span></th>
                    <td><span style={{ overflowWrap: "anywhere" }}>{r.requirementReference}</span></td>
                    <td><span style={{ overflowWrap: "anywhere" }}>{r.supplierName}</span></td>
                    <td>{r.total ?? "Not available"}</td>
                    <td><span className={`${s.badge} ${toneOf(r.status)}`}>{r.statusLabel}</span></td>
                    <td><button type="button" className={prof.btnSecondary} onClick={() => openReview(r.reference)} aria-label={`View details of quotation ${r.reference}`}>View Details</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className={s.cards} aria-label="Submitted quotations">
              {data.items.map((r) => (
                <li key={r.reference} className={s.card}>
                  <div className={s.cardHead}><strong style={{ overflowWrap: "anywhere" }}>{r.reference}</strong><span className={`${s.badge} ${toneOf(r.status)}`}>{r.statusLabel}</span></div>
                  <dl className={s.facts}>
                    <div><dt>Requirement</dt><dd style={{ overflowWrap: "anywhere" }}>{r.requirementReference}</dd></div>
                    <div><dt>Supplier</dt><dd style={{ overflowWrap: "anywhere" }}>{r.supplierName}</dd></div>
                    <div><dt>Total</dt><dd>{r.total ?? "Not available"}</dd></div>
                  </dl>
                  <button type="button" className={prof.btnSecondary} onClick={() => openReview(r.reference)} aria-label={`View details of quotation ${r.reference}`}>View Details</button>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className={s.note} style={{ margin: ".5rem 1rem" }}><Info size={14} aria-hidden /> Amounts are shown per quotation in their own currency; currencies are never combined. Statuses are as of the time of loading{data ? ` (${new Date(data.referenceTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST)` : ""}. This page is read-only.</p>
        {data && mt && (
          <div className={s.pager}>
            <span>Showing {data.items.length ? (mt.page - 1) * mt.limit + 1 : 0}–{(mt.page - 1) * mt.limit + data.items.length} of {n(mt.total)}</span>
            <span className={s.pagerBtns}>
              <button type="button" className={prof.btnSecondary} disabled={mt.page <= 1 || busy} onClick={() => goPage(mt.page - 1)}>Previous</button>
              <button type="button" className={prof.btnSecondary} disabled={mt.page >= mt.totalPages || busy} onClick={() => goPage(mt.page + 1)}>Next</button>
            </span>
          </div>
        )}
      </section>

      <AdminQuotationReview reference={review} onClose={closeReview} />
    </>
  );
}
