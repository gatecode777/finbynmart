"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Info, Search } from "lucide-react";
import auth from "@/components/auth/Auth.module.css";
import prof from "@/components/supplier/profile/SupplierProfile.module.css";
import { Dropdown } from "@/components/ui/Dropdown";
import { flashToast } from "@/components/ui/Toast";
import { COMPANY_STATUSES, EMPTY_STATE, MAPPING_FILTERS, SEARCH_MAX, SORTS, toListParams, type MappingFilter, type SortKey, type StatusFilter, type SupplierListState } from "@/lib/admin/supplierRules";
import type { SupplierList } from "@/lib/admin/supplierManagement";
import type { Caps } from "@/lib/admin/supplierManagement";
import { AdminSupplierReview } from "./AdminSupplierReview";
import s from "./AdminInquiries.module.css";
import m from "./AdminInquiryManagement.module.css";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const statusBadge = (st: string) => `${s.badge} ${st === "ACTIVE" ? m.tone_ok : m.tone_bad}`;
const mapText = (n: number) => (n === 0 ? "No catalogue seller" : `${n} linked ${n === 1 ? "seller" : "sellers"}`);

interface Props { initial: SupplierList; state: SupplierListState; initialReview: string | null; caps: Caps; canExport: boolean }

export function AdminSuppliersWorkspace({ initial, state, initialReview, canExport }: Props & { caps: Caps }) {
  const [data, setData] = useState(initial);
  const [q, setQ] = useState(state.q);
  const [status, setStatus] = useState<StatusFilter>(state.status);
  const [mapping, setMapping] = useState<MappingFilter>(state.mapping);
  const [city, setCity] = useState(state.city);
  const [sort, setSort] = useState<SortKey>(state.sort);
  const [page, setPage] = useState(state.page);
  const [review, setReview] = useState<string | null>(initialReview);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [tick, setTick] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const first = useRef(true);
  const cities = initial.facets?.cities ?? [];

  const syncUrl = useCallback((st: SupplierListState, id: string | null) => {
    const p = toListParams(st);
    if (id) p.set("review", id);
    window.history.replaceState(null, "", `/admin/suppliers${p.size ? `?${p}` : ""}`);
  }, []);

  const load = useCallback(async () => {
    abort.current?.abort();
    const ctl = (abort.current = new AbortController());
    setBusy(true);
    const sp = toListParams({ q: q.trim(), status, mapping, city, sort, page });
    const res = await fetch(`/api/admin/suppliers?${sp}`, { cache: "no-store", signal: ctl.signal }).catch(() => null);
    if (ctl.signal.aborted) return;
    const json = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (res?.ok && json?.ok) { setData((d) => ({ ...json.data, facets: d.facets })); setError(""); } else setError(json?.message ?? (res ? "Could not load suppliers." : "Network error. Check your connection and retry."));
  }, [q, status, mapping, city, sort, page]);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    syncUrl({ q, status, mapping, city, sort, page }, review);
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  // review is intentionally not a dependency: opening a review must not reload the list
  }, [load, q, status, mapping, city, sort, page, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  function openReview(id: string) { setReview(id); syncUrl({ q, status, mapping, city, sort, page }, id); }
  function closeReview() { setReview(null); syncUrl({ q, status, mapping, city, sort, page }, null); }

  async function exportCsv() {
    setExporting(true);
    const res = await fetch("/api/admin/suppliers/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q, status, mapping, city, sort }) }).catch(() => null);
    setExporting(false);
    if (!res?.ok) { flashToast("error", "Export failed. " + (res ? "Please try again." : "Network error.")); return; }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url; a.download = "suppliers.csv"; a.click();
    URL.revokeObjectURL(url);
    flashToast("success", res.headers.get("X-Export-Truncated") === "true" ? "Exported the first 5,000 companies; narrow the filters for the rest." : "Export ready.");
  }

  const mt = data.meta;
  const filtered = q !== "" || status !== "all" || mapping !== "all" || city !== "" || sort !== "updated";
  const reset = () => { setQ(""); setStatus(EMPTY_STATE.status); setMapping(EMPTY_STATE.mapping); setCity(""); setSort(EMPTY_STATE.sort); setPage(1); };
  const n = (v: number) => v.toLocaleString("en-IN");

  return (
    <>
      {canExport && <div className={s.exportRow}><button type="button" className={prof.btnSecondary} onClick={exportCsv} disabled={exporting}><Download size={16} aria-hidden /> {exporting ? "Exporting…" : "Export"}</button></div>}

      <dl className={m.stats} aria-label="Company counts">
        <div className={m.stat}><dt>Companies</dt><dd>{n(data.summary.total)}</dd></div>
        <div className={m.stat}><dt>Active</dt><dd>{n(data.summary.active)}</dd></div>
        <div className={m.stat}><dt>Suspended</dt><dd>{n(data.summary.suspended)}</dd></div>
      </dl>
      <p className={s.note}><Info size={14} aria-hidden /> Counts are supplier companies (not staff accounts or catalogue sellers), from the stored records, and ignore the filters below. Active does not mean verified.</p>

      <div className={m.bar}>
        <div className={`${m.field} ${m.barSearch}`}>
          <label htmlFor="as-q" className={m.lbl}>Search</label>
          <div className={s.search}>
            <Search size={16} aria-hidden className={s.searchIcon} />
            <input id="as-q" className={auth.control} placeholder="Company name (starts with) or reference" value={q} maxLength={SEARCH_MAX} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
        </div>
        <div className={m.field}><label htmlFor="as-status" className={m.lbl}>Status</label><Dropdown id="as-status" value={status} onChange={(v) => { setStatus(v as StatusFilter); setPage(1); }} options={COMPANY_STATUSES.map((x) => ({ value: x.key, label: x.label }))} /></div>
        <div className={m.field}><label htmlFor="as-map" className={m.lbl}>Seller mapping</label><Dropdown id="as-map" value={mapping} onChange={(v) => { setMapping(v as MappingFilter); setPage(1); }} options={MAPPING_FILTERS.map((x) => ({ value: x.key, label: x.key === "all" ? "All" : x.label }))} /></div>
        <div className={m.field}><label htmlFor="as-city" className={m.lbl}>City</label><Dropdown id="as-city" value={city} onChange={(v) => { setCity(v); setPage(1); }} options={[{ value: "", label: "All cities" }, ...(city && !cities.includes(city) ? [{ value: city, label: city }] : []), ...cities.map((c) => ({ value: c, label: c }))]} /></div>
        <div className={m.field}><label htmlFor="as-sort" className={m.lbl}>Sort</label><Dropdown id="as-sort" value={sort} onChange={(v) => { setSort(v as SortKey); setPage(1); }} options={SORTS.map((x) => ({ value: x.key, label: x.label }))} /></div>
        <div className={m.barEnd}><button type="button" className={s.clear} onClick={reset} disabled={!filtered}>Clear filters</button></div>
      </div>
      {error && <p role="alert" className={s.err}>{error} <button type="button" className={prof.btnSecondary} onClick={() => setTick((t) => t + 1)}>Retry</button></p>}

      <section className={`${s.panel} ${busy ? s.busy : ""}`} aria-label="Supplier companies" aria-busy={busy}>
        {busy && data.items.length === 0 ? (
          <ul className={m.skeleton} aria-hidden>{[0, 1, 2, 3].map((i) => <li key={i} />)}</ul>
        ) : data.items.length === 0 ? (
          <p className={s.empty}>{filtered ? "No companies match these filters." : "No supplier company exists yet."}</p>
        ) : (
          <>
            <table className={s.table}>
              <caption className={s.sr}>Supplier companies</caption>
              <thead><tr><th scope="col">Company</th><th scope="col">Reference</th><th scope="col">Location</th><th scope="col">Seller mapping</th><th scope="col">Access status</th><th scope="col">Updated</th><th scope="col">Action</th></tr></thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id} className={review === r.id ? s.rowOn : undefined}>
                    <th scope="row">{r.name}{r.businessType && <span className={m.sub}>{r.businessType}</span>}</th>
                    <td>{r.code}</td>
                    <td>{r.city ?? "Not provided"}</td>
                    <td>{mapText(r.linkedSellers)}</td>
                    <td><span className={statusBadge(r.status)}>{r.statusLabel}</span></td>
                    <td>{day(r.updatedAt)}</td>
                    <td><button type="button" className={prof.btnSecondary} onClick={() => openReview(r.id)} aria-label={`Review ${r.name}`}>Review</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className={s.cards} aria-label="Supplier companies">
              {data.items.map((r) => (
                <li key={r.id} className={s.card}>
                  <div className={s.cardHead}><strong style={{ overflowWrap: "anywhere" }}>{r.name}</strong><span className={statusBadge(r.status)}>{r.statusLabel}</span></div>
                  <dl className={s.facts}>
                    <div><dt>Reference</dt><dd>{r.code}</dd></div>
                    <div><dt>Location</dt><dd>{r.city ?? "Not provided"}</dd></div>
                    <div><dt>Mapping</dt><dd>{mapText(r.linkedSellers)}</dd></div>
                    <div><dt>Updated</dt><dd>{day(r.updatedAt)}</dd></div>
                  </dl>
                  <button type="button" className={prof.btnSecondary} onClick={() => openReview(r.id)}>Review</button>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className={s.note} style={{ margin: ".5rem 1rem" }}><Info size={14} aria-hidden /> No catalogue seller does not mean inactive: a company&apos;s own products use its company identity.</p>
        <div className={s.pager}>
          <span>Showing {data.items.length ? (mt.page - 1) * mt.limit + 1 : 0}–{(mt.page - 1) * mt.limit + data.items.length} of {n(mt.total)} companies</span>
          <span className={s.pagerBtns}>
            <button type="button" className={prof.btnSecondary} disabled={mt.page <= 1} onClick={() => setPage(mt.page - 1)}>Previous</button>
            <button type="button" className={prof.btnSecondary} disabled={mt.page >= mt.totalPages} onClick={() => setPage(mt.page + 1)}>Next</button>
          </span>
        </div>
      </section>

      <AdminSupplierReview id={review} onClose={closeReview} onChanged={() => setTick((t) => t + 1)} />
    </>
  );
}
