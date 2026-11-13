"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Info, Package, Search } from "lucide-react";
import auth from "@/components/auth/Auth.module.css";
import prof from "../profile/SupplierProfile.module.css";
import { flashToast } from "@/components/ui/Toast";
import type { InventoryResult, InventoryRow, MovementRow } from "@/lib/supplier/inventoryService";
import { KINDS, REASONS, formatQty, movementEffect, parseQtyMilli, validateAdjust, type AdjustErrors, type AdjustInput } from "@/lib/supplier/inventoryRules";
import s from "./Inventory.module.css";

const STATUS_LABEL: Record<InventoryRow["status"], string> = { IN_STOCK: "In stock", LOW_STOCK: "Low stock", OUT_OF_STOCK: "Out of stock", UNTRACKED: "Not tracked" };
const TYPE_LABEL = { OPENING: "Opening balance", ADD: "Added", REMOVE: "Removed", RESERVE: "Reserved for order", RELEASE: "Reservation released", DISPATCH: "Dispatched" } as const;
const signed = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + formatQty(Math.abs(n));

export function SupplierInventoryWorkspace({ initial, canAdjust }: { initial: InventoryResult; canAdjust: boolean }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<"stock" | "moves">("stock");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState("");
  const [moves, setMoves] = useState<{ items: MovementRow[]; meta: InventoryResult["meta"] } | null>(null);
  const [mPage, setMPage] = useState(1);
  const [target, setTarget] = useState<InventoryRow | null>(null);
  const [recent, setRecent] = useState<MovementRow[] | null>(null);
  const loadRecent = useCallback(async () => {
    const res = await fetch("/api/supplier/inventory/movements?limit=3", { cache: "no-store" }).catch(() => null);
    const json = res?.ok ? await res.json().catch(() => null) : null;
    setRecent(json?.ok ? json.data.items : []);
  }, []);
  useEffect(() => { void loadRecent(); }, [loadRecent]);
  const abort = useRef<AbortController | null>(null);

  const load = useCallback(async (p: { q: string; status: string; page: number }) => {
    abort.current?.abort();
    const ctl = (abort.current = new AbortController());
    const sp = new URLSearchParams();
    if (p.q) sp.set("q", p.q);
    if (p.status !== "all") sp.set("status", p.status);
    if (p.page > 1) sp.set("page", String(p.page));
    const res = await fetch(`/api/supplier/inventory?${sp}`, { cache: "no-store", signal: ctl.signal }).catch(() => null);
    if (ctl.signal.aborted) return;
    const json = res?.ok ? await res.json().catch(() => null) : null;
    if (json?.ok) { setData(json.data); setLoadError(""); } else setLoadError("Could not load inventory. Try again.");
  }, []);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => void load({ q, status, page }), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, status, page, load]);

  useEffect(() => {
    if (tab !== "moves") return;
    void (async () => {
      const res = await fetch(`/api/supplier/inventory/movements?page=${mPage}`, { cache: "no-store" }).catch(() => null);
      const json = res?.ok ? await res.json().catch(() => null) : null;
      if (json?.ok) setMoves(json.data);
      else flashToast("error", "Could not load movement history.");
    })();
  }, [tab, mPage]);

  const m = data.meta;
  const sm = data.summary;
  const qty = (n: number | null, unit: string) => (n === null ? "—" : `${formatQty(n)} ${unit}`);

  return (
    <>
      <dl className={s.summary} aria-label="Inventory summary">
        {[["Tracked SKUs", sm.tracked], ["Low-stock SKUs", sm.lowStock], ["Out-of-stock SKUs", sm.outOfStock], ["Untracked SKUs", sm.untracked]].map(([l, v]) => (
          <div key={l as string} className={s.stat}><dt className={s.statLabel}>{l}</dt><dd className={s.statValue} style={{ margin: 0 }}>{(v as number).toLocaleString("en-IN")}</dd></div>
        ))}
      </dl>

      <div className={s.tabs} role="tablist" aria-label="Inventory views">
        <button type="button" role="tab" aria-selected={tab === "stock"} className={tab === "stock" ? s.tabOn : s.tab} onClick={() => setTab("stock")}>Stock Overview</button>
        <button type="button" role="tab" aria-selected={tab === "moves"} className={tab === "moves" ? s.tabOn : s.tab} onClick={() => setTab("moves")}>Movement History</button>
      </div>

      {tab === "stock" ? (
        <>
          <div className={s.tools}>
            <div style={{ position: "relative" }}>
              <label htmlFor="inv-q" className="sr-only" style={{ position: "absolute", left: -9999 }}>Search product or SKU</label>
              <Search size={16} aria-hidden style={{ position: "absolute", left: 12, top: 14 }} />
              <input id="inv-q" className={auth.control} style={{ paddingLeft: 36 }} placeholder="Search product or SKU" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            </div>
            <div>
              <label htmlFor="inv-status" className={s.inlineLabel}>Status</label>
              <select id="inv-status" className={auth.control} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                <option value="all">All Stock</option>
                <option value="IN_STOCK">In stock</option>
                <option value="LOW_STOCK">Low stock</option>
                <option value="OUT_OF_STOCK">Out of stock</option>
                <option value="untracked">Not tracked</option>
              </select>
            </div>
          </div>
          {loadError && <p role="alert" className={s.err}>{loadError}</p>}

          <section className={s.panel} aria-label="Stock overview">
            {data.items.length === 0 ? (
              <p className={s.empty}>{sm.tracked + sm.untracked === 0 ? "You have no products yet." : "No products match these filters."}</p>
            ) : (
              <>
                <table className={s.table}>
                  <thead><tr><th scope="col">Product &amp; SKU</th><th scope="col" className={s.num}>On hand</th><th scope="col" className={s.num}>Reserved</th><th scope="col" className={s.num}>Available</th><th scope="col" className={s.num}>Reorder level</th><th scope="col">Status</th>{canAdjust && <th scope="col">Action</th>}</tr></thead>
                  <tbody>
                    {data.items.map((r) => (
                      <tr key={r.productRef}>
                        <td><div className={s.prod}><Thumb src={r.imageUrl} /><div><span className={s.name}>{r.name}</span><span className={s.sub}>{r.sku}</span></div></div></td>
                        <td className={s.num}>{qty(r.onHandMilli, r.unit)}</td>
                        <td className={s.num}>{qty(r.reservedMilli, r.unit)}</td>
                        <td className={s.num}>{qty(r.onHandMilli === null ? null : r.onHandMilli - (r.reservedMilli ?? 0), r.unit)}</td>
                        <td className={s.num}>{r.reorderMilli === null ? "Not set" : qty(r.reorderMilli, r.unit)}</td>
                        <td><span className={`${s.badge} ${s[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                        {canAdjust && <td><button type="button" className={prof.btnSecondary} onClick={() => setTarget(r)}>{r.onHandMilli === null ? "Set opening" : "Adjust"}</button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className={s.cards}>
                  {data.items.map((r) => (
                    <article key={r.productRef} className={s.card}>
                      <div className={s.cardRow}><div className={s.prod}><Thumb src={r.imageUrl} /><div><span className={s.name}>{r.name}</span><span className={s.sub}>{r.sku}</span></div></div><span className={`${s.badge} ${s[r.status]}`}>{STATUS_LABEL[r.status]}</span></div>
                      <div className={s.qtys}><span>On hand<br /><strong>{qty(r.onHandMilli, r.unit)}</strong></span><span>Available<br /><strong>{qty(r.onHandMilli === null ? null : r.onHandMilli - (r.reservedMilli ?? 0), r.unit)}</strong></span><span>Reserved<br /><strong>{qty(r.reservedMilli, r.unit)}</strong></span><span>Reorder level<br /><strong>{r.reorderMilli === null ? "Not set" : qty(r.reorderMilli, r.unit)}</strong></span></div>
                      {canAdjust && <button type="button" className={prof.btnSecondary} onClick={() => setTarget(r)}>{r.onHandMilli === null ? "Set opening" : "Adjust"}</button>}
                    </article>
                  ))}
                </div>
              </>
            )}
            <div className={s.pager}>
              <span>Showing {data.items.length ? (m.page - 1) * m.limit + 1 : 0}–{(m.page - 1) * m.limit + data.items.length} of {m.totalCount.toLocaleString("en-IN")}</span>
              <span style={{ display: "flex", gap: ".5rem" }}>
                <button type="button" className={s.pg} aria-label="Previous page" disabled={m.page <= 1} onClick={() => setPage(m.page - 1)}>‹</button>
                {pageList(m.page, m.totalPages).map((p, i) => p === 0 ? <span key={"g" + i} aria-hidden>…</span> : <button key={p} type="button" className={p === m.page ? s.pgOn : s.pg} aria-current={p === m.page ? "page" : undefined} aria-label={"Page " + p} onClick={() => setPage(p)}>{p}</button>)}
                <button type="button" className={s.pg} aria-label="Next page" disabled={m.page >= m.totalPages} onClick={() => setPage(m.page + 1)}>›</button>
              </span>
            </div>
          </section>
          <div className={s.bottom}>
            <section className={s.panel} aria-label="Recent movements" style={{ padding: "1rem 1.25rem" }}>
              <h2 className={s.h2}>Recent movements</h2>
              {recent === null ? <p className={s.sub}>Loading…</p> : recent.length === 0 ? <p className={s.sub}>No stock movements recorded yet.</p> : (
                <ul className={s.recent}>{recent.map((x) => (
                  <li key={x.id}><span className={s.tag}>{TYPE_LABEL[x.type]}</span><span><strong>{signed(x.deltaMilli)} {x.unit}</strong> · {x.sku}</span></li>
                ))}</ul>
              )}
            </section>
            <aside className={s.infoCard}><Info size={20} aria-hidden /><p>Available = on hand minus the quantity reserved for confirmed orders. A product that is not tracked has no stock figure; that is not zero stock.</p></aside>
          </div>
        </>
      ) : (
        <section className={s.panel} aria-label="Movement history">
          {!moves ? <p className={s.empty}>Loading…</p> : moves.items.length === 0 ? <p className={s.empty}>No stock movements recorded yet.</p> : (
            <>
              <table className={s.table}>
                <thead><tr><th scope="col">When</th><th scope="col">Product</th><th scope="col">Type</th><th scope="col" className={s.num}>Change</th><th scope="col" className={s.num}>Balance after</th><th scope="col">Reason</th></tr></thead>
                <tbody>{moves.items.map((x) => (
                  <tr key={x.id}><td>{new Date(x.createdAt).toLocaleString()}</td><td><span className={s.name}>{x.name}</span><span className={s.sub}>{x.sku}</span></td><td>{TYPE_LABEL[x.type]}</td><td className={s.num}>{signed(x.deltaMilli)} {x.unit}</td><td className={s.num}>{formatQty(x.resultMilli)} {x.unit}</td><td>{REASONS.find((r) => r.code === x.reason)?.label ?? x.reason}{x.note ? ` — ${x.note}` : ""}</td></tr>
                ))}</tbody>
              </table>
              <div className={s.cards}>
                {moves.items.map((x) => (
                  <article key={x.id} className={s.card}>
                    <div className={s.cardRow}><div><span className={s.name}>{x.name}</span><span className={s.sub}>{x.sku} · {new Date(x.createdAt).toLocaleString()}</span></div><strong>{signed(x.deltaMilli)} {x.unit}</strong></div>
                    <span className={s.sub}>{TYPE_LABEL[x.type]} · balance {formatQty(x.resultMilli)} {x.unit}</span>
                  </article>
                ))}
              </div>
              <div className={s.pager}>
                <span>Page {moves.meta.page} of {moves.meta.totalPages}</span>
                <span style={{ display: "flex", gap: ".5rem" }}>
                  <button type="button" className={prof.btnSecondary} disabled={mPage <= 1} onClick={() => setMPage(mPage - 1)}>Previous</button>
                  <button type="button" className={prof.btnSecondary} disabled={mPage >= moves.meta.totalPages} onClick={() => setMPage(mPage + 1)}>Next</button>
                </span>
              </div>
            </>
          )}
        </section>
      )}

      {target && (
        <AdjustDialog
          row={target}
          onClose={() => setTarget(null)}
          onDone={() => { setTarget(null); void load({ q, status, page }); void loadRecent(); if (tab === "moves") setMPage(1); setMoves(null); }}
        />
      )}
    </>
  );
}

function AdjustDialog({ row, onClose, onDone }: { row: InventoryRow; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const key = useRef("");
  const [f, setF] = useState<AdjustInput>({ productRef: row.productRef, kind: row.onHandMilli === null ? "OPENING" : "ADD", quantity: "", reason: "", note: "", reorderLevel: "" });
  const [errors, setErrors] = useState<AdjustErrors>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { key.current = crypto.randomUUID(); ref.current?.showModal(); }, []);
  const set = (k: keyof AdjustInput, v: string) => { setF((p) => ({ ...p, [k]: v })); setErrors((p) => ({ ...p, [k]: undefined })); setFormError(""); key.current = crypto.randomUUID(); };

  const qty = parseQtyMilli(f.quantity);
  const eff = qty === null ? null : movementEffect(f.kind, qty, row.onHandMilli);
  const kinds = row.onHandMilli === null ? KINDS.filter((k) => k.code === "OPENING") : KINDS.filter((k) => k.code !== "OPENING");
  const err = (k: keyof AdjustInput) => (errors[k] ? <p id={`ie-${k}`} className={s.err}>{errors[k]}</p> : null);
  const aria = (k: keyof AdjustInput) => ({ "aria-invalid": errors[k] ? true : undefined, "aria-describedby": errors[k] ? `ie-${k}` : undefined });

  async function submit() {
    if (busy) return;
    const e = validateAdjust(f);
    if (Object.keys(e).length) { setErrors(e); flashToast("error", "Adjustment not recorded. Fix the highlighted fields."); return; }
    setBusy(true);
    const res = await fetch("/api/supplier/inventory/adjustments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, idempotencyKey: key.current }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (res?.ok && data.ok) { flashToast("success", "Adjustment recorded."); onDone(); return; }
    setErrors(data.fields ?? {});
    const msg = res ? (data.message ?? "Could not record the adjustment.") : "Network error. Nothing was recorded; try again.";
    setFormError(msg);
    flashToast("error", "Adjustment not recorded. " + msg);
  }

  return (
    <dialog ref={ref} className={s.dialog} aria-labelledby="adj-title" onClose={onClose} onCancel={onClose}>
      <form className={s.dlgBody} noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <h2 id="adj-title">{row.onHandMilli === null ? "Set opening balance" : "Record adjustment"}</h2>
        <p className={s.sub} style={{ margin: 0 }}>{row.name} · {row.sku} · unit: {row.unit}</p>
        {formError && <p role="alert" className={s.err}>{formError}</p>}
        <div className={auth.field}>
          <label htmlFor="adj-kind" className={auth.label}>Type</label>
          <select id="adj-kind" className={auth.control} value={f.kind} onChange={(e) => set("kind", e.target.value)} {...aria("kind")}>{kinds.map((k) => <option key={k.code} value={k.code}>{k.label}</option>)}</select>
          {err("kind")}
        </div>
        <div className={auth.field}>
          <label htmlFor="adj-qty" className={auth.label}>Quantity ({row.unit})</label>
          <input id="adj-qty" className={auth.control} inputMode="decimal" value={f.quantity} onChange={(e) => set("quantity", e.target.value)} {...aria("quantity")} />
          {err("quantity")}
        </div>
        <div className={auth.field}>
          <label htmlFor="adj-reason" className={auth.label}>Reason</label>
          <select id="adj-reason" className={auth.control} value={f.reason} onChange={(e) => set("reason", e.target.value)} {...aria("reason")}><option value="">Select a reason</option>{REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}</select>
          {err("reason")}
        </div>
        <div className={auth.field}>
          <label htmlFor="adj-note" className={auth.label}>Explanation (optional unless “Other”)</label>
          <textarea id="adj-note" className={auth.control} rows={2} maxLength={300} value={f.note} onChange={(e) => set("note", e.target.value)} {...aria("note")} />
          {err("note")}
        </div>
        <div className={auth.field}>
          <label htmlFor="adj-reorder" className={auth.label}>Reorder level ({row.unit}, optional)</label>
          <input id="adj-reorder" className={auth.control} inputMode="decimal" value={f.reorderLevel} onChange={(e) => set("reorderLevel", e.target.value)} {...aria("reorderLevel")} />
          <p className={s.hint}>Low stock is flagged when on hand is at or below this level. None is set by default.</p>
          {err("reorderLevel")}
        </div>
        <p className={s.preview} aria-live="polite">
          Current: {row.onHandMilli === null ? "not tracked" : `${formatQty(row.onHandMilli)} ${row.unit}`}
          {eff && ("error" in eff ? ` · ${eff.error}` : ` · after: ${formatQty(eff.result)} ${row.unit}`)}
        </p>
        <div className={s.dlgActions}>
          <button type="button" className={prof.btnSecondary} onClick={() => ref.current?.close()}>Cancel</button>
          <button type="submit" className={prof.btnGold} disabled={busy}>{busy ? "Recording…" : "Record"}</button>
        </div>
      </form>
    </dialog>
  );
}

function Thumb({ src }: { src: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" className={s.thumb} loading="lazy" /> : <span className={s.thumb} aria-hidden><Package size={18} /></span>;
}

/** 1 … c-1 c c+1 … last (0 marks a gap). */
function pageList(c: number, n: number): number[] {
  const set = new Set([1, n, c - 1, c, c + 1].filter((x) => x >= 1 && x <= n));
  const out: number[] = [];
  [...set].sort((x, y) => x - y).forEach((x, i, arr) => { if (i && x - arr[i - 1] > 1) out.push(0); out.push(x); });
  return out;
}
