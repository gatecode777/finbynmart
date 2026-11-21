"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Info, Plus, Search } from "lucide-react";
import auth from "@/components/auth/Auth.module.css";
import prof from "@/components/supplier/profile/SupplierProfile.module.css";
import { Dropdown } from "@/components/ui/Dropdown";
import { EMPTY_STATE, LEVELS, SEARCH_MAX, STATUSES, toParams, type LevelFilter, type ListState, type StatusFilter } from "@/lib/admin/categoryRules";
import type { CategoryList, CategoryRow, Caps } from "@/lib/admin/categoryManagement";
import { AdminCategoryReview } from "./AdminCategoryReview";
import s from "./AdminInquiries.module.css";
import m from "./AdminInquiryManagement.module.css";

const n = (v: number) => v.toLocaleString("en-IN");
const visibility = (r: CategoryRow) => (!r.effectiveActive ? { label: "Hidden by admin", tone: "bad" } : r.discoverable ? { label: "Discoverable", tone: "ok" } : { label: "No eligible products", tone: "muted" });
const badge = (tone: string) => `${s.badge} ${m[`tone_${tone}` as keyof typeof m] ?? ""}`;

export function AdminCategoriesWorkspace({ initial, state, initialReview, caps }: { initial: CategoryList; state: ListState; initialReview: string | null; caps: Caps }) {
  const [data, setData] = useState(initial);
  const [q, setQ] = useState(state.q);
  const [level, setLevel] = useState<LevelFilter>(state.level);
  const [status, setStatus] = useState<StatusFilter>(state.status);
  const [parent, setParent] = useState(state.parent);
  const [page, setPage] = useState(state.page);
  const [review, setReview] = useState<string | null>(initialReview);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  // lazy hierarchy: main categories are listed from the first response; a branch loads its children only when opened
  const [open, setOpen] = useState<Record<string, { state: "loading" | "ok" | "error"; rows: CategoryRow[] }>>({});
  const [mains, setMains] = useState<CategoryRow[]>([]);
  const abort = useRef<AbortController | null>(null);
  const first = useRef(true);

  const syncUrl = useCallback((st: ListState, ref: string | null) => {
    const p = toParams(st);
    if (ref) p.set("review", ref);
    window.history.replaceState(null, "", `/admin/categories${p.size ? `?${p}` : ""}`);
  }, []);

  const load = useCallback(async () => {
    abort.current?.abort();
    const ctl = (abort.current = new AbortController());
    setBusy(true);
    const res = await fetch(`/api/admin/categories?${toParams({ q: q.trim(), level, status, parent, page })}`, { cache: "no-store", signal: ctl.signal }).catch(() => null);
    if (ctl.signal.aborted) return;
    const json = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (res?.ok && json?.ok) { setData(json.data); setError(""); } else setError(json?.message ?? (res ? "Could not load categories." : "Network error. Check your connection and retry."));
  }, [q, level, status, parent, page]);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    syncUrl({ q, level, status, parent, page }, review);
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  // review is intentionally not a dependency: opening a review must not reload the list
  }, [load, q, level, status, parent, page, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // the hierarchy panel's main categories (a small fixed set, loaded once and after a change)
  useEffect(() => {
    const ctl = new AbortController();
    void fetch(`/api/admin/categories?level=MAIN&limit=50`, { cache: "no-store", signal: ctl.signal }).then((r) => r.json()).then((j) => { if (j?.ok) setMains(j.data.items); }).catch(() => undefined);
    return () => ctl.abort();
  }, [tick]);
  const items = mains.length ? mains : initial.items.filter((r) => r.level === "MAIN");

  async function toggle(row: CategoryRow) {
    if (open[row.id]) { setOpen((o) => { const { [row.id]: _gone, ...rest } = o; void _gone; return rest; }); return; }
    setOpen((o) => ({ ...o, [row.id]: { state: "loading", rows: [] } }));
    const res = await fetch(`/api/admin/categories?parent=${encodeURIComponent(row.ref)}&limit=50`, { cache: "no-store" }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    setOpen((o) => ({ ...o, [row.id]: res?.ok && json?.ok ? { state: "ok", rows: json.data.items } : { state: "error", rows: [] } }));
  }

  const openReview = (ref: string) => { setReview(ref); syncUrl({ q, level, status, parent, page }, ref); };
  const closeReview = () => { setReview(null); syncUrl({ q, level, status, parent, page }, null); };
  const mt = data.meta;
  const filtered = q !== "" || level !== "all" || status !== "all" || parent !== "";
  const reset = () => { setQ(""); setLevel(EMPTY_STATE.level); setStatus(EMPTY_STATE.status); setParent(""); setPage(1); };

  return (
    <>
      <div className={s.exportRow}>
        <button type="button" className={prof.btnGold} disabled aria-describedby="ac-add-why"><Plus size={16} aria-hidden /> Add Category</button>
      </div>
      <p id="ac-add-why" className={s.note}><Info size={14} aria-hidden /> Adding, renaming, moving or re-slugging a category is not available yet: public pages, product references, supplier forms and matching rules are tied to the code-defined categories, and no redirect layer exists. Activation of main categories is available below.</p>

      <dl className={m.stats} aria-label="Category counts">
        <div className={m.stat}><dt>Categories</dt><dd>{n(data.summary.total)}</dd></div>
        <div className={m.stat}><dt>Main categories</dt><dd>{n(data.summary.main)}</dd></div>
        <div className={m.stat}><dt>Active</dt><dd>{n(data.summary.active)}</dd></div>
        <div className={m.stat}><dt>Inactive</dt><dd>{n(data.summary.inactive)}</dd></div>
      </dl>
      <p className={s.note}><Info size={14} aria-hidden /> Counts are all categories (main, department and product category) by effective status. &quot;Eligible products&quot; are counted without the activation gate: an inactive category can show products and still be hidden.</p>

      <div className={m.bar}>
        <div className={`${m.field} ${m.barSearch}`}>
          <label htmlFor="ac-q" className={m.lbl}>Search</label>
          <div className={s.search}><Search size={16} aria-hidden className={s.searchIcon} /><input id="ac-q" className={auth.control} placeholder="Name or slug (starts with)" value={q} maxLength={SEARCH_MAX} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        </div>
        <div className={m.field}><label htmlFor="ac-level" className={m.lbl}>Level</label><Dropdown id="ac-level" value={level} onChange={(v) => { setLevel(v as LevelFilter); setPage(1); }} options={LEVELS.map((x) => ({ value: x.key, label: x.label }))} /></div>
        <div className={m.field}><label htmlFor="ac-status" className={m.lbl}>Status</label><Dropdown id="ac-status" value={status} onChange={(v) => { setStatus(v as StatusFilter); setPage(1); }} options={STATUSES.map((x) => ({ value: x.key, label: x.key === "all" ? "All statuses" : x.label }))} /></div>
        <div className={m.barEnd}><button type="button" className={s.clear} onClick={reset} disabled={!filtered}>Clear filters</button></div>
      </div>
      {error && <p role="alert" className={s.err}>{error} <button type="button" className={prof.btnSecondary} onClick={() => setTick((t) => t + 1)}>Retry</button></p>}

      <div className={m.reviewLayout}>
        <nav aria-label="Category hierarchy" className={m.hier}>
          <h2 className={m.hierTitle}>Category hierarchy</h2>
          <ul className={m.hierList}>
            {items.map((r) => (
              <li key={r.id}>
                <div className={m.hierRow}>
                  {r.childCount > 0 ? <button type="button" className={m.hierToggle} onClick={() => void toggle(r)} aria-expanded={!!open[r.id]} aria-label={`${open[r.id] ? "Collapse" : "Expand"} ${r.name}`}>{open[r.id] ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}</button> : <span className={m.hierSpacer} />}
                  <button type="button" className={m.hierName} onClick={() => openReview(r.ref)}>{r.name}{!r.effectiveActive && <span className={m.muted}> (inactive)</span>}</button>
                </div>
                {open[r.id]?.state === "loading" && <p role="status" className={m.muted}>Loading…</p>}
                {open[r.id]?.state === "error" && <p role="alert" className={m.err}>Could not load. <button type="button" className={prof.btnSecondary} onClick={() => { setOpen((o) => { const { [r.id]: _g, ...rest } = o; void _g; return rest; }); void toggle(r); }}>Retry</button></p>}
                {open[r.id]?.state === "ok" && (
                  <ul className={m.hierList}>{open[r.id].rows.map((c) => <li key={c.id}><button type="button" className={m.hierName} onClick={() => openReview(c.ref)}>{c.name}</button></li>)}{open[r.id].rows.length === 0 && <li className={m.muted}>No subcategories.</li>}</ul>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <section className={`${s.panel} ${busy ? s.busy : ""}`} aria-label="Categories" aria-busy={busy}>
          {busy && data.items.length === 0 ? (
            <ul className={m.skeleton} aria-hidden>{[0, 1, 2, 3].map((i) => <li key={i} />)}</ul>
          ) : data.items.length === 0 ? (
            <p className={s.empty}>{filtered ? "No categories match these filters." : "No categories exist."}</p>
          ) : (
            <>
              <table className={s.table}>
                <caption className={s.sr}>Categories</caption>
                <thead><tr><th scope="col">Category</th><th scope="col">Parent</th><th scope="col">Admin status</th><th scope="col">Public visibility</th><th scope="col">Eligible products</th><th scope="col">Action</th></tr></thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r.id} className={review === r.ref ? s.rowOn : undefined}>
                      <th scope="row">{r.name}<span className={m.sub}>{r.level === "MAIN" ? "Main category" : r.level === "DEPARTMENT" ? "Department" : "Product category"}</span></th>
                      <td>{r.parentName ?? "None (main)"}</td>
                      <td><span className={badge(r.effectiveActive ? "ok" : "bad")}>{r.effectiveActive ? "Active" : "Inactive"}</span></td>
                      <td><span className={badge(visibility(r).tone)}>{visibility(r).label}</span></td>
                      <td>{n(r.eligibleProducts)}<span className={m.sub}>{r.countScope}</span></td>
                      <td><button type="button" className={prof.btnSecondary} onClick={() => openReview(r.ref)} aria-label={`Review ${r.name}`}>Review</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className={s.cards} aria-label="Categories">
                {data.items.map((r) => (
                  <li key={r.id} className={s.card}>
                    <div className={s.cardHead}><strong style={{ overflowWrap: "anywhere" }}>{r.name}</strong><span className={badge(r.effectiveActive ? "ok" : "bad")}>{r.effectiveActive ? "Active" : "Inactive"}</span></div>
                    <dl className={s.facts}>
                      <div><dt>Parent</dt><dd>{r.parentName ?? "None (main)"}</dd></div>
                      <div><dt>Visibility</dt><dd><span className={badge(visibility(r).tone)}>{visibility(r).label}</span></dd></div>
                      <div><dt>Eligible</dt><dd>{n(r.eligibleProducts)} · {r.countScope.toLowerCase()}</dd></div>
                    </dl>
                    <button type="button" className={prof.btnSecondary} onClick={() => openReview(r.ref)}>Review</button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className={s.pager}>
            <span>Showing {data.items.length ? (mt.page - 1) * mt.limit + 1 : 0}–{(mt.page - 1) * mt.limit + data.items.length} of {n(mt.total)} categories</span>
            <span className={s.pagerBtns}>
              <button type="button" className={prof.btnSecondary} disabled={mt.page <= 1} onClick={() => setPage(mt.page - 1)}>Previous</button>
              <button type="button" className={prof.btnSecondary} disabled={mt.page >= mt.totalPages} onClick={() => setPage(mt.page + 1)}>Next</button>
            </span>
          </div>
        </section>
      </div>

      <AdminCategoryReview reference={review} caps={caps} onClose={closeReview} onChanged={() => setTick((t) => t + 1)} />
    </>
  );
}
