"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Info, Search } from "lucide-react";
import auth from "@/components/auth/Auth.module.css";
import prof from "@/components/supplier/profile/SupplierProfile.module.css";
import { Dropdown } from "@/components/ui/Dropdown";
import { todayInReportZone } from "@/lib/supplier/analyticsRules";
import { EMPTY_QUEUE, FILTER_STATES, SEARCH_MAX, toQueueParams, type QueueState } from "@/lib/verification/rules";
import type { AdminCaps, QueueList } from "@/lib/verification/service";
import { AdminVerificationReview } from "./AdminVerificationReview";
import s from "./AdminInquiries.module.css";
import m from "./AdminInquiryManagement.module.css";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const badge = (tone: string) => `${s.badge} ${m[`tone_${tone}` as keyof typeof m] ?? ""}`;

export function AdminVerificationWorkspace({ initial, state, initialReview, caps }: { initial: QueueList; state: QueueState; initialReview: string | null; caps: AdminCaps }) {
  const [data, setData] = useState(initial);
  const [q, setQ] = useState(state.q);
  const [status, setStatus] = useState<QueueState["status"]>(state.status);
  const [start, setStart] = useState(state.start);
  const [end, setEnd] = useState(state.end);
  const [page, setPage] = useState(state.page);
  const [review, setReview] = useState<string | null>(initialReview);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const first = useRef(true);

  const syncUrl = useCallback((st: QueueState, ref: string | null) => {
    const p = toQueueParams(st);
    if (ref) p.set("review", ref);
    window.history.replaceState(null, "", `/admin/verification${p.size ? `?${p}` : ""}`);
  }, []);

  const load = useCallback(async () => {
    abort.current?.abort();
    const ctl = (abort.current = new AbortController());
    setBusy(true);
    const sp = toQueueParams({ q: q.trim(), status, start, end, page });
    const res = await fetch(`/api/admin/verification?${sp}`, { cache: "no-store", signal: ctl.signal }).catch(() => null);
    if (ctl.signal.aborted) return;
    const json = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (res?.ok && json?.ok) { setData(json.data); setError(""); } else setError(json?.message ?? (res ? "Could not load applications." : "Network error. Check your connection and retry."));
  }, [q, status, start, end, page]);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    syncUrl({ q, status, start, end, page }, review);
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  // review is intentionally not a dependency: opening a review must not reload the queue
  }, [load, q, status, start, end, page, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const openReview = (ref: string) => { setReview(ref); syncUrl({ q, status, start, end, page }, ref); };
  const closeReview = () => { setReview(null); syncUrl({ q, status, start, end, page }, null); };
  const mt = data.meta;
  const today = todayInReportZone();
  const filtered = q !== "" || status !== "all" || start !== "" || end !== "";
  const reset = () => { setQ(""); setStatus(EMPTY_QUEUE.status); setStart(""); setEnd(""); setPage(1); };
  const n = (v: number) => v.toLocaleString("en-IN");

  return (
    <>
      {data.policy.state !== "CONFIGURED" && (
        <p role="status" className={m.note} style={{ marginBottom: "1rem" }}>
          <strong>Verification policy not configured.</strong> {data.policy.message} You can inspect submitted applications, but approval is blocked and suppliers cannot submit until the policy is set.
        </p>
      )}
      <dl className={m.stats} aria-label="Application counts">
        <div className={m.stat}><dt>Awaiting review</dt><dd>{n(data.summary.awaiting)}</dd></div>
        <div className={m.stat}><dt>Changes requested</dt><dd>{n(data.summary.changesRequested)}</dd></div>
        <div className={m.stat}><dt>Rejected</dt><dd>{n(data.summary.rejected)}</dd></div>
        <div className={m.stat}><dt>Approved companies</dt><dd>{n(data.summary.approvedCompanies)}</dd></div>
      </dl>
      <p className={s.note}><Info size={14} aria-hidden /> Awaiting review counts applications (at most one per company). The other counts are companies: one per company, whatever the number of revisions. An approval is a platform review of submitted business evidence, not government or product-quality certification.</p>

      <div className={m.bar}>
        <div className={`${m.field} ${m.barSearch}`}>
          <label htmlFor="av-q" className={m.lbl}>Search</label>
          <div className={s.search}>
            <Search size={16} aria-hidden className={s.searchIcon} />
            <input id="av-q" className={auth.control} placeholder="Application reference or company name (starts with)" value={q} maxLength={SEARCH_MAX} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
        </div>
        <div className={m.field}><label htmlFor="av-status" className={m.lbl}>Status</label><Dropdown id="av-status" value={status} onChange={(v) => { setStatus(v as QueueState["status"]); setPage(1); }} options={FILTER_STATES.map((x) => ({ value: x.key, label: x.key === "all" ? "All statuses" : x.label }))} /></div>
        <div className={`${m.field} ${m.barDates}`}>
          <span className={m.lbl} id="av-date-l">Submitted date</span>
          <div className={m.dateRow} role="group" aria-labelledby="av-date-l">
            <label htmlFor="av-start" className={s.sr}>From</label>
            <input id="av-start" type="date" className={auth.control} value={start} max={end || today} onChange={(e) => { setStart(e.target.value); setPage(1); }} />
            <label htmlFor="av-end" className={s.sr}>To</label>
            <input id="av-end" type="date" className={auth.control} value={end} min={start} max={today} onChange={(e) => { setEnd(e.target.value); setPage(1); }} />
          </div>
        </div>
        <div className={m.barEnd}><button type="button" className={s.clear} onClick={reset} disabled={!filtered}>Clear filters</button></div>
      </div>
      {error && <p role="alert" className={s.err}>{error} <button type="button" className={prof.btnSecondary} onClick={() => setTick((t) => t + 1)}>Retry</button></p>}

      <section className={`${s.panel} ${busy ? s.busy : ""}`} aria-label="Verification applications" aria-busy={busy}>
        {busy && data.items.length === 0 ? (
          <ul className={m.skeleton} aria-hidden>{[0, 1, 2, 3].map((i) => <li key={i} />)}</ul>
        ) : data.items.length === 0 ? (
          <p className={s.empty}>{filtered ? "No applications match these filters." : "No company has submitted evidence for review yet."}</p>
        ) : (
          <>
            <table className={s.table}>
              <caption className={s.sr}>Verification applications</caption>
              <thead><tr><th scope="col">Application</th><th scope="col">Company</th><th scope="col">Location</th><th scope="col">Submitted</th><th scope="col">Review status</th><th scope="col">Action</th></tr></thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.reference} className={review === r.reference ? s.rowOn : undefined}>
                    <th scope="row">{r.reference}<span className={m.sub}>Revision {r.revision}</span></th>
                    <td>{r.company}</td>
                    <td>{r.city ?? "Not provided"}</td>
                    <td>{day(r.submittedAt)}</td>
                    <td><span className={badge(r.tone)}>{r.stateLabel}</span></td>
                    <td><button type="button" className={prof.btnSecondary} onClick={() => openReview(r.reference)} aria-label={`Review ${r.reference}, ${r.company}`}>Review</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className={s.cards} aria-label="Verification applications">
              {data.items.map((r) => (
                <li key={r.reference} className={s.card}>
                  <div className={s.cardHead}><strong>{r.reference}</strong><span className={badge(r.tone)}>{r.stateLabel}</span></div>
                  <dl className={s.facts}>
                    <div><dt>Company</dt><dd>{r.company}</dd></div>
                    <div><dt>Location</dt><dd>{r.city ?? "Not provided"}</dd></div>
                    <div><dt>Submitted</dt><dd>{day(r.submittedAt)} · revision {r.revision}</dd></div>
                  </dl>
                  <button type="button" className={prof.btnSecondary} onClick={() => openReview(r.reference)}>Review</button>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className={s.pager}>
          <span>Showing {data.items.length ? (mt.page - 1) * mt.limit + 1 : 0}–{(mt.page - 1) * mt.limit + data.items.length} of {n(mt.total)} applications</span>
          <span className={s.pagerBtns}>
            <button type="button" className={prof.btnSecondary} disabled={mt.page <= 1} onClick={() => setPage(mt.page - 1)}>Previous</button>
            <button type="button" className={prof.btnSecondary} disabled={mt.page >= mt.totalPages} onClick={() => setPage(mt.page + 1)}>Next</button>
          </span>
        </div>
      </section>

      <AdminVerificationReview reference={review} caps={caps} onClose={closeReview} onChanged={() => setTick((t) => t + 1)} />
    </>
  );
}
