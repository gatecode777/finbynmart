"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Info, Search } from "lucide-react";
import auth from "@/components/auth/Auth.module.css";
import prof from "@/components/supplier/profile/SupplierProfile.module.css";
import { Dropdown } from "@/components/ui/Dropdown";
import { flashToast } from "@/components/ui/Toast";
import { todayInReportZone } from "@/lib/supplier/analyticsRules";
import { ADMIN_STATUS_GROUPS, DISTRIBUTION_FILTERS, SEARCH_MAX, SOURCE_FILTERS, toListParams, type AdminListState, type AdminStatusGroup, type DistributionFilter, type SourceFilter } from "@/lib/admin/inquiryRules";
import type { AdminInquiryCaps, AdminInquiryList } from "@/lib/admin/inquiryService";
import { AdminInquiryReview } from "./AdminInquiryReview";
import s from "./AdminInquiries.module.css";
import m from "./AdminInquiryManagement.module.css";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const badge = (tone: string) => `${s.badge} ${m[`tone_${tone}` as keyof typeof m] ?? ""}`;
const srcBadge = (source: "DIRECT" | "GENERAL") => `${s.badge} ${source === "GENERAL" ? m.src_GENERAL : m.src_DIRECT}`;

interface Props { initial: AdminInquiryList; defaults: { startDay: string; endDay: string }; state: AdminListState; initialReview: string | null; caps: AdminInquiryCaps; canExport: boolean }

export function AdminInquiriesWorkspace({ initial, defaults, state, initialReview, caps, canExport }: Props) {
  const [data, setData] = useState(initial);
  const [q, setQ] = useState(state.q);
  const [source, setSource] = useState<SourceFilter>(state.source);
  const [group, setGroup] = useState<AdminStatusGroup>(state.group);
  const [dist, setDist] = useState<DistributionFilter>(state.dist);
  const [start, setStart] = useState(state.start);
  const [end, setEnd] = useState(state.end);
  const [page, setPage] = useState(state.page);
  const [buyer, setBuyer] = useState(state.buyer ?? "");
  const [review, setReview] = useState<string | null>(initialReview);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [tick, setTick] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const first = useRef(true);

  const current = (): AdminListState => ({ q, source, group, dist, start, end, page, ...(buyer ? { buyer } : {}) });
  const syncUrl = useCallback((st: AdminListState, ref: string | null) => {
    const p = toListParams(st, { start: defaults.startDay, end: defaults.endDay });
    if (ref) p.set("review", ref);
    window.history.replaceState(null, "", `/admin/inquiries${p.size ? `?${p}` : ""}`);
  }, [defaults]);

  const load = useCallback(async () => {
    abort.current?.abort();
    const ctl = (abort.current = new AbortController());
    setBusy(true);
    const sp = new URLSearchParams({ start, end, source, group, dist, page: String(page) });
    if (q.trim()) sp.set("q", q.trim());
    if (buyer) sp.set("buyer", buyer);
    const res = await fetch(`/api/admin/inquiries?${sp}`, { cache: "no-store", signal: ctl.signal }).catch(() => null);
    if (ctl.signal.aborted) return;
    const json = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (res?.ok && json?.ok) { setData(json.data); setError(""); } else setError(json?.message ?? (res ? "Could not load inquiries." : "Network error. Check your connection and retry."));
  }, [q, source, group, dist, start, end, page, buyer]);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    syncUrl({ q, source, group, dist, start, end, page, ...(buyer ? { buyer } : {}) }, review);
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  // review is intentionally not a dependency: opening a review must not reload the list
  }, [load, q, source, group, dist, start, end, page, buyer, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  function openReview(ref: string) { setReview(ref); syncUrl(current(), ref); }
  function closeReview() { setReview(null); syncUrl(current(), null); }

  async function exportCsv() {
    setExporting(true);
    const res = await fetch("/api/admin/inquiries/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ start, end, source, group, dist, q }) }).catch(() => null);
    setExporting(false);
    if (!res?.ok) { flashToast("error", "Export failed. " + (res ? "Please try again." : "Network error.")); return; }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url; a.download = `inquiries-${start}_${end}.csv`; a.click();
    URL.revokeObjectURL(url);
    flashToast("success", res.headers.get("X-Export-Truncated") === "true" ? "Exported the first 5,000 requirements; narrow the filters for the rest." : "Export ready.");
  }

  const mt = data.meta;
  const today = todayInReportZone();
  const reset = () => { setQ(""); setSource("all"); setGroup("all"); setDist("all"); setStart(defaults.startDay); setEnd(defaults.endDay); setPage(1); };
  const filtered = buyer !== "" || q !== "" || source !== "all" || group !== "all" || dist !== "all" || start !== defaults.startDay || end !== defaults.endDay;
  const sm = data.summary;
  const n = (v: number) => v.toLocaleString("en-IN");

  return (
    <>
      {canExport && (
        <div className={s.exportRow}>
          <button type="button" className={prof.btnSecondary} onClick={exportCsv} disabled={exporting}><Download size={16} aria-hidden /> {exporting ? "Exporting…" : "Export"}</button>
        </div>
      )}

      {buyer && <p className={s.note} role="status"><Info size={14} aria-hidden /> Showing requirements of one buyer account only, within the date range below. <button type="button" className={s.clear} onClick={() => { setBuyer(""); setPage(1); }}>Show all buyers</button></p>}
      <dl className={m.stats} aria-label="Requirement counts">
        {ADMIN_STATUS_GROUPS.map((g) => <div key={g.key} className={m.stat}><dt>{g.label}</dt><dd>{n(sm.groups[g.key])}</dd></div>)}
        <div className={m.stat}><dt>Direct inquiries</dt><dd>{n(sm.sources.direct)}</dd></div>
        <div className={m.stat}><dt>General requirements</dt><dd>{n(sm.sources.general)}</dd></div>
        <div className={m.stat}><dt>Needs attention</dt><dd>{sm.attention > 0 ? <button type="button" className={m.statBtn} onClick={() => { setDist("attention"); setPage(1); }} aria-label={`${n(sm.attention)} need attention. Show them.`}>{n(sm.attention)}</button> : n(0)}</dd></div>
      </dl>
      <p className={s.note}><Info size={14} aria-hidden /> One count per requirement, by date received, under the search and date range (the source, status and distribution filters do not change them). &quot;Needs attention&quot; means distribution failed, or is retrying after a recorded failure; finding no eligible supplier is not a failure.</p>

      <div className={m.bar}>
        <div className={`${m.field} ${m.barSearch}`}>
          <label htmlFor="ai-q" className={m.lbl}>Search</label>
          <div className={s.search}>
            <Search size={16} aria-hidden className={s.searchIcon} />
            <input id="ai-q" className={auth.control} placeholder="Reference or product name (starts with)" value={q} maxLength={SEARCH_MAX} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
        </div>
        <div className={m.field}>
          <label htmlFor="ai-source" className={m.lbl}>Source</label>
          <Dropdown id="ai-source" value={source} onChange={(v) => { setSource(v as SourceFilter); setPage(1); }} options={SOURCE_FILTERS.map((x) => ({ value: x.key, label: x.label }))} />
        </div>
        <div className={m.field}>
          <label htmlFor="ai-group" className={m.lbl}>Lifecycle</label>
          <Dropdown id="ai-group" value={group} onChange={(v) => { setGroup(v as AdminStatusGroup); setPage(1); }} options={ADMIN_STATUS_GROUPS.map((g) => ({ value: g.key, label: g.key === "all" ? "All statuses" : g.label }))} />
        </div>
        <div className={m.field}>
          <label htmlFor="ai-dist" className={m.lbl}>Distribution</label>
          <Dropdown id="ai-dist" value={dist} onChange={(v) => { setDist(v as DistributionFilter); setPage(1); }} options={DISTRIBUTION_FILTERS.map((x) => ({ value: x.key, label: x.key === "all" ? "All distribution states" : x.label }))} />
        </div>
        <div className={`${m.field} ${m.barDates}`}>
          <span className={m.lbl} id="ai-date-l">Date received</span>
          <div className={m.dateRow} role="group" aria-labelledby="ai-date-l">
            <label htmlFor="ai-start" className={s.sr}>From</label>
            <input id="ai-start" type="date" className={auth.control} value={start} max={end} onChange={(e) => { if (e.target.value) { setStart(e.target.value); setPage(1); } }} />
            <label htmlFor="ai-end" className={s.sr}>To</label>
            <input id="ai-end" type="date" className={auth.control} value={end} min={start} max={today} onChange={(e) => { if (e.target.value) { setEnd(e.target.value); setPage(1); } }} />
          </div>
        </div>
        <div className={m.barEnd}><button type="button" className={s.clear} onClick={reset} disabled={!filtered}>Clear filters</button></div>
      </div>
      {error && <p role="alert" className={s.err}>{error} <button type="button" className={prof.btnSecondary} onClick={() => setTick((t) => t + 1)}>Retry</button></p>}

      <section className={`${s.panel} ${busy ? s.busy : ""}`} aria-label="Requirements" aria-busy={busy}>
        {busy && data.items.length === 0 ? (
          <ul className={m.skeleton} aria-hidden>{[0, 1, 2, 3].map((i) => <li key={i} />)}</ul>
        ) : data.items.length === 0 ? (
          <p className={s.empty}>{filtered ? "No requirements match these filters." : "No requirements were received in this period."}</p>
        ) : (
          <>
            <table className={s.table}>
              <caption className={s.sr}>Inquiries and requirements</caption>
              <thead><tr><th scope="col">Reference &amp; source</th><th scope="col">Buyer</th><th scope="col">Requirement</th><th scope="col">Recipients</th><th scope="col">Distribution</th><th scope="col">Lifecycle</th><th scope="col">Received</th><th scope="col">Action</th></tr></thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.reference} className={review === r.reference ? s.rowOn : undefined}>
                    <th scope="row"><span className={m.refCell}>{r.reference}<span className={srcBadge(r.source)}>{r.sourceLabel}</span></span></th>
                    <td>{r.buyer}</td>
                    <td>{r.requirement}{r.quantityText ? ` · ${r.quantityText}` : ""}{r.selectedSupplier && <span className={m.sub}>Selected: {r.selectedSupplier}</span>}</td>
                    <td>{r.recipients.total === 0 ? "None yet" : <>{r.recipients.direct > 0 && <>Direct {r.recipients.direct}<br /></>}{r.recipients.matched > 0 && <>Matched {r.recipients.matched}</>}</>}</td>
                    <td><span className={badge(r.distribution.tone)}>{r.distribution.label}</span></td>
                    <td><span className={s.badge}>{r.statusLabel}</span></td>
                    <td>{fmt(r.receivedAt)}</td>
                    <td><button type="button" className={prof.btnSecondary} onClick={() => openReview(r.reference)} aria-label={`Review ${r.reference}`}>Review</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className={s.cards} aria-label="Requirements">
              {data.items.map((r) => (
                <li key={r.reference} className={s.card}>
                  <div className={s.cardHead}><strong>{r.reference}</strong><span className={srcBadge(r.source)}>{r.sourceLabel}</span></div>
                  <dl className={s.facts}>
                    <div><dt>Buyer</dt><dd>{r.buyer}</dd></div>
                    <div><dt>Requirement</dt><dd>{r.requirement}{r.quantityText ? ` · ${r.quantityText}` : ""}</dd></div>
                    {r.selectedSupplier && <div><dt>Selected</dt><dd>{r.selectedSupplier}</dd></div>}
                    <div><dt>Recipients</dt><dd>{r.recipients.total === 0 ? "None yet" : `${r.recipients.direct ? `Direct ${r.recipients.direct}` : ""}${r.recipients.direct && r.recipients.matched ? " · " : ""}${r.recipients.matched ? `Matched ${r.recipients.matched}` : ""}`}</dd></div>
                    <div><dt>Distribution</dt><dd><span className={badge(r.distribution.tone)}>{r.distribution.label}</span></dd></div>
                    <div><dt>Lifecycle</dt><dd>{r.statusLabel}</dd></div>
                    <div><dt>Received</dt><dd>{fmt(r.receivedAt)}</dd></div>
                  </dl>
                  <button type="button" className={prof.btnSecondary} onClick={() => openReview(r.reference)}>Review</button>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className={s.pager}>
          <span>Showing {data.items.length ? (mt.page - 1) * mt.limit + 1 : 0}–{(mt.page - 1) * mt.limit + data.items.length} of {n(mt.total)} requirements</span>
          <span className={s.pagerBtns}>
            <button type="button" className={prof.btnSecondary} disabled={mt.page <= 1} onClick={() => setPage(mt.page - 1)}>Previous</button>
            <button type="button" className={prof.btnSecondary} disabled={mt.page >= mt.totalPages} onClick={() => setPage(mt.page + 1)}>Next</button>
          </span>
        </div>
      </section>

      <AdminInquiryReview reference={review} caps={caps} onClose={closeReview} onChanged={() => setTick((t) => t + 1)} />
    </>
  );
}
