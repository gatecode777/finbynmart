"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Info, Search } from "lucide-react";
import auth from "@/components/auth/Auth.module.css";
import prof from "@/components/supplier/profile/SupplierProfile.module.css";
import { Dropdown } from "@/components/ui/Dropdown";
import { BUYER_STATUSES, EMPTY_STATE, SEARCH_MAX, toListParams, type BuyerListState, type StatusFilter } from "@/lib/admin/buyerRules";
import type { BuyerList } from "@/lib/admin/buyerManagement";
import { AdminBuyerReview } from "./AdminBuyerReview";
import s from "./AdminInquiries.module.css";
import m from "./AdminInquiryManagement.module.css";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "Not provided");
const tone = (st: string) => (st === "ACTIVE" ? m.tone_ok : st === "SUSPENDED" ? m.tone_bad : m.tone_muted);
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

/**
 * The buyer list. Search and the status filter apply together when Search is pressed (Reset restores the defaults); the applied state, not the draft, drives the request, and a response that
 * arrives after a newer request is ignored. A failed request keeps the filters and offers Retry: it never shows an empty list.
 */
export function AdminBuyersWorkspace({ initial, state, initialReview, canManage }: { initial: BuyerList | null; state: BuyerListState; initialReview: string | null; canManage: boolean }) {
  const uid = useId();
  const [data, setData] = useState<BuyerList | null>(initial);
  const [applied, setApplied] = useState<BuyerListState>(state);
  const [qDraft, setQDraft] = useState(state.q);
  const [statusDraft, setStatusDraft] = useState<StatusFilter>(state.status);
  const [review, setReview] = useState<string | null>(initialReview);
  const [error, setError] = useState(initial ? "" : "The buyers could not be loaded.");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const first = useRef(true);

  const syncUrl = useCallback((st: BuyerListState, id: string | null) => {
    const p = toListParams(st);
    if (id) p.set("review", id);
    window.history.replaceState(null, "", `/admin/buyers${p.size ? `?${p}` : ""}`);
  }, []);

  const load = useCallback(async () => {
    abort.current?.abort();
    const ctl = (abort.current = new AbortController());
    setBusy(true);
    const res = await fetch(`/api/admin/buyers?${toListParams(applied)}`, { cache: "no-store", signal: ctl.signal }).catch(() => null);
    if (ctl.signal.aborted) return; // a newer request owns the screen
    const json = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (res?.ok && json?.ok) { setData(json.data); setError(""); } else setError(json?.message ?? (res ? "The buyers could not be loaded." : "Network error. Check your connection and retry."));
  }, [applied]);

  useEffect(() => {
    if (first.current) { first.current = false; if (!initial) void load(); return; }
    void load();
  // the first render uses the server's list; review is not a dependency (opening a buyer must not reload the list)
  }, [load, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: BuyerListState = { q: qDraft.trim(), status: statusDraft, page: 1 };
    setApplied(next);
    syncUrl(next, review);
  }
  function reset() {
    setQDraft(""); setStatusDraft(EMPTY_STATE.status); setApplied(EMPTY_STATE);
    syncUrl(EMPTY_STATE, review);
  }
  function goPage(p: number) { const next = { ...applied, page: p }; setApplied(next); syncUrl(next, review); }
  function openReview(id: string) { setReview(id); syncUrl(applied, id); }
  function closeReview() { setReview(null); syncUrl(applied, null); }

  const filtered = applied.q !== "" || applied.status !== "all";
  const n = (v: number) => v.toLocaleString("en-IN");
  const mt = data?.meta;

  return (
    <>
      <form className={m.bar} onSubmit={submit} role="search" aria-label="Search buyers">
        <div className={`${m.field} ${m.barSearch}`}>
          <label htmlFor={`${uid}-q`} className={m.lbl}>Search</label>
          <div className={s.search}>
            <Search size={16} aria-hidden className={s.searchIcon} />
            <input id={`${uid}-q`} className={auth.control} placeholder="Search buyer name or account reference" value={qDraft} maxLength={SEARCH_MAX} onChange={(e) => setQDraft(e.target.value)} />
          </div>
        </div>
        <div className={m.field}>
          <label htmlFor={`${uid}-status`} className={m.lbl}>Status</label>
          <Dropdown id={`${uid}-status`} value={statusDraft} onChange={(v) => setStatusDraft(v as StatusFilter)} options={BUYER_STATUSES.map((x) => ({ value: x.key, label: x.label }))} />
        </div>
        <div className={m.barEnd}>
          <button type="submit" className={prof.btnGold}>Search</button>
          <button type="button" className={s.clear} onClick={reset} disabled={!filtered && qDraft === "" && statusDraft === "all"}>Reset</button>
        </div>
      </form>
      <p className={s.note}><Info size={14} aria-hidden /> Search matches a buyer&apos;s name (starts with) or account reference. Contact details are not searchable.</p>

      {error && <p role="alert" className={s.err}>{error} <button type="button" className={prof.btnSecondary} onClick={() => setTick((t) => t + 1)}>Retry</button></p>}
      <p className={s.sr} role="status" aria-live="polite">{busy ? "Loading buyers." : ""}</p>

      <section className={`${s.panel} ${busy ? s.busy : ""}`} aria-label="Buyer accounts" aria-busy={busy}>
        {!data ? (
          busy ? <ul className={m.skeleton} aria-hidden>{[0, 1, 2, 3].map((i) => <li key={i} />)}</ul> : null
        ) : data.items.length === 0 ? (
          <p className={s.empty}>{filtered ? "No buyers match these filters." : "No buyer accounts yet."}</p>
        ) : (
          <>
            <table className={s.table}>
              <caption className={s.sr}>Buyer accounts</caption>
              <thead><tr><th scope="col">Buyer</th><th scope="col">Account reference</th><th scope="col">Status</th><th scope="col">Joined</th><th scope="col">Action</th></tr></thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id} className={review === r.id ? s.rowOn : undefined}>
                    <th scope="row"><span style={{ overflowWrap: "anywhere" }}>{r.name}</span></th>
                    <td>{r.code}</td>
                    <td><span className={`${s.badge} ${tone(r.status)}`}>{r.statusLabel}</span></td>
                    <td>{day(r.joinedAt)}</td>
                    <td><button type="button" className={prof.btnSecondary} onClick={() => openReview(r.id)} aria-label={`View details of ${r.name}`}>View Details</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className={s.cards} aria-label="Buyer accounts">
              {data.items.map((r) => (
                <li key={r.id} className={s.card}>
                  <div className={s.cardHead}><strong style={{ overflowWrap: "anywhere" }}><span aria-hidden>{initials(r.name)} </span>{r.name}</strong><span className={`${s.badge} ${tone(r.status)}`}>{r.statusLabel}</span></div>
                  <dl className={s.facts}>
                    <div><dt>Ref</dt><dd>{r.code}</dd></div>
                    <div><dt>Joined</dt><dd>{day(r.joinedAt)}</dd></div>
                  </dl>
                  <button type="button" className={prof.btnSecondary} onClick={() => openReview(r.id)} aria-label={`View details of ${r.name}`}>View Details</button>
                </li>
              ))}
            </ul>
          </>
        )}
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

      <AdminBuyerReview id={review} canManage={canManage} onClose={closeReview} onChanged={() => setTick((t) => t + 1)} />
    </>
  );
}
