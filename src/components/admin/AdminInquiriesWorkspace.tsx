"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Info, Search, ShieldCheck } from "lucide-react";
import auth from "@/components/auth/Auth.module.css";
import prof from "@/components/supplier/profile/SupplierProfile.module.css";
import { Dropdown } from "@/components/ui/Dropdown";
import { flashToast } from "@/components/ui/Toast";
import { todayInReportZone } from "@/lib/supplier/analyticsRules";
import { ADMIN_STATUS_GROUPS, type AdminStatusGroup } from "@/lib/admin/inquiryRules";
import type { AdminInquiryDetail, AdminInquiryList } from "@/lib/admin/inquiryService";
import s from "./AdminInquiries.module.css";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const fmtTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

export function AdminInquiriesWorkspace({ initial, range, canExport }: { initial: AdminInquiryList; range: { startDay: string; endDay: string }; canExport: boolean }) {
  const [data, setData] = useState(initial);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<AdminStatusGroup>("all");
  const [start, setStart] = useState(range.startDay);
  const [end, setEnd] = useState(range.endDay);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<AdminInquiryDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [exporting, setExporting] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const first = useRef(true);
  const reviewRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    abort.current?.abort();
    const ctl = (abort.current = new AbortController());
    setBusy(true);
    const sp = new URLSearchParams({ start, end, group, page: String(page) });
    if (q.trim()) sp.set("q", q.trim());
    const res = await fetch(`/api/admin/inquiries?${sp}`, { cache: "no-store", signal: ctl.signal }).catch(() => null);
    if (ctl.signal.aborted) return;
    const json = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (res?.ok && json?.ok) { setData(json.data); setError(""); } else setError(json?.message ?? (res ? "Could not load inquiries." : "Network error. Check your connection and retry."));
  }, [q, group, start, end, page]);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function review(reference: string) {
    setDetailError("");
    const res = await fetch(`/api/admin/inquiries/${encodeURIComponent(reference)}`, { cache: "no-store" }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    if (res?.ok && json?.ok) {
      setSelected(json.data);
      setTimeout(() => reviewRef.current?.scrollIntoView({ block: "start" }), 0);
    } else {
      setSelected(null);
      setDetailError(json?.message ?? "Could not load this inquiry.");
      flashToast("error", "Inquiry not loaded.");
    }
  }

  async function exportCsv() {
    setExporting(true);
    const res = await fetch("/api/admin/inquiries/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ start, end, group, q }) }).catch(() => null);
    setExporting(false);
    if (!res?.ok) { flashToast("error", "Export failed. " + (res ? "Please try again." : "Network error.")); return; }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url; a.download = `inquiries-${start}_${end}.csv`; a.click();
    URL.revokeObjectURL(url);
    flashToast("success", res.headers.get("X-Export-Truncated") === "true" ? "Exported the first 5,000 inquiries; narrow the filters for the rest." : "Export ready.");
  }

  const m = data.meta;
  const today = todayInReportZone();
  const reset = () => { setQ(""); setGroup("all"); setStart(range.startDay); setEnd(range.endDay); setPage(1); };
  const filtered = q !== "" || group !== "all" || start !== range.startDay || end !== range.endDay;

  return (
    <>
      {canExport && (
        <div className={s.exportRow}>
          <button type="button" className={prof.btnSecondary} onClick={exportCsv} disabled={exporting}><Download size={16} aria-hidden /> {exporting ? "Exporting…" : "Export"}</button>
        </div>
      )}

      <dl className={s.metrics} aria-label="Inquiry counts">
        {ADMIN_STATUS_GROUPS.map((g) => (
          <div key={g.key} className={s.metric}><dt>{g.label}</dt><dd>{data.summary[g.key].toLocaleString("en-IN")}</dd></div>
        ))}
      </dl>
      <p className={s.note}><Info size={14} aria-hidden /> One count per inquiry sent to a supplier, by date received. A request sent to several suppliers counts once for each.</p>

      <div className={s.filters}>
        <div className={s.search}>
          <label htmlFor="ai-q" className={s.sr}>Search by inquiry reference or requirement</label>
          <Search size={16} aria-hidden className={s.searchIcon} />
          <input id="ai-q" className={auth.control} placeholder="Inquiry reference or requirement" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label htmlFor="ai-group" className={s.sr}>Status</label>
          <Dropdown id="ai-group" value={group} onChange={(v) => { setGroup(v as AdminStatusGroup); setPage(1); }} options={ADMIN_STATUS_GROUPS.map((g) => ({ value: g.key, label: g.key === "all" ? "All statuses" : g.label }))} />
        </div>
        <div className={s.dates}>
          <label htmlFor="ai-start" className={s.sr}>Received from</label>
          <input id="ai-start" type="date" className={auth.control} value={start} max={end} onChange={(e) => { if (e.target.value) { setStart(e.target.value); setPage(1); } }} />
          <label htmlFor="ai-end" className={s.sr}>Received to</label>
          <input id="ai-end" type="date" className={auth.control} value={end} min={start} max={today} onChange={(e) => { if (e.target.value) { setEnd(e.target.value); setPage(1); } }} />
        </div>
        <button type="button" className={s.clear} onClick={reset} disabled={!filtered}>Clear filters</button>
      </div>
      {error && <p role="alert" className={s.err}>{error} <button type="button" className={prof.btnSecondary} onClick={() => void load()}>Retry</button></p>}

      <section className={`${s.panel} ${busy ? s.busy : ""}`} aria-label="Inquiries" aria-busy={busy}>
        {data.items.length === 0 ? (
          <p className={s.empty}>{filtered ? "No inquiries match these filters." : "No inquiries were received in this period."}</p>
        ) : (
          <>
            <table className={s.table}>
              <thead><tr><th scope="col">Inquiry</th><th scope="col">Buyer</th><th scope="col">Requirement</th><th scope="col">Supplier</th><th scope="col">Status</th><th scope="col">Received</th><th scope="col">Action</th></tr></thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.reference} className={selected?.reference === r.reference ? s.rowOn : undefined}>
                    <th scope="row">{r.reference}</th>
                    <td>{r.buyer}</td>
                    <td>{r.requirement}{r.quantityText ? ` · ${r.quantityText}` : ""}</td>
                    <td>{r.supplier}</td>
                    <td><span className={s.badge}>{r.statusLabel}</span></td>
                    <td>{fmt(r.receivedAt)}</td>
                    <td><button type="button" className={prof.btnSecondary} onClick={() => void review(r.reference)} aria-label={`Review inquiry ${r.reference}`}>Review</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className={s.cards} aria-label="Inquiries">
              {data.items.map((r) => (
                <li key={r.reference} className={s.card}>
                  <div className={s.cardHead}><strong>{r.reference}</strong><span className={s.badge}>{r.statusLabel}</span></div>
                  <dl className={s.facts}>
                    <div><dt>Buyer</dt><dd>{r.buyer}</dd></div>
                    <div><dt>Requirement</dt><dd>{r.requirement}{r.quantityText ? ` · ${r.quantityText}` : ""}</dd></div>
                    <div><dt>Supplier</dt><dd>{r.supplier}</dd></div>
                    <div><dt>Received</dt><dd>{fmt(r.receivedAt)}</dd></div>
                  </dl>
                  <button type="button" className={prof.btnSecondary} onClick={() => void review(r.reference)}>Review</button>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className={s.pager}>
          <span>Showing {data.items.length ? (m.page - 1) * m.limit + 1 : 0}–{(m.page - 1) * m.limit + data.items.length} of {m.total.toLocaleString("en-IN")}</span>
          <span className={s.pagerBtns}>
            <button type="button" className={prof.btnSecondary} disabled={m.page <= 1} onClick={() => setPage(m.page - 1)}>Previous</button>
            <button type="button" className={prof.btnSecondary} disabled={m.page >= m.totalPages} onClick={() => setPage(m.page + 1)}>Next</button>
          </span>
        </div>
      </section>

      {(selected || detailError) && (
        <section ref={reviewRef} className={s.review} aria-labelledby="ai-review-title" tabIndex={-1}>
          <h2 id="ai-review-title">Selected inquiry review{selected ? `: ${selected.reference}` : ""}</h2>
          {detailError && <p role="alert" className={s.err}>{detailError}</p>}
          {selected && (
            <div className={s.reviewGrid}>
              <div>
                <h3>Original requirement (read-only)</h3>
                <p className={s.box}>{selected.requirement}{selected.quantityText ? ` · ${selected.quantityText}` : ""}{selected.category ? ` · ${selected.category}` : ""}</p>
                <h3>Buyer message</h3>
                <p className={s.box}>{selected.message || "No message was written."}</p>
                {selected.delivery && (<><h3>Delivery</h3><p className={s.box}>{selected.delivery}</p></>)}
              </div>
              <div>
                <h3>Buyer</h3><p>{selected.buyer}</p>
                <h3>Assigned supplier</h3><p>{selected.supplier}</p>
                <h3>Status</h3><p><span className={s.badge}>{selected.statusLabel}</span> · received {fmtTime(selected.receivedAt)}</p>
                {selected.history.length > 0 && (<><h3>Status history</h3><ul className={s.hist}>{selected.history.map((h, i) => <li key={i}>{h.to} · {h.actor} · {fmtTime(h.at)}</li>)}</ul></>)}
              </div>
              <div className={s.fullRow}>
                <h3>Supplier responses</h3>
                {selected.responses === null ? <p className={s.hint}>Your account is not permitted to read supplier responses.</p> : selected.responses.length === 0 ? <p className={s.hint}>No supplier response has been recorded.</p> : (
                  <ul className={s.msgs}>{selected.responses.map((r, i) => <li key={i}><strong>{r.author}</strong> · {r.type === "CLARIFICATION" ? "Clarification request" : "Response"} · {fmtTime(r.at)}<p>{r.body}</p></li>)}</ul>
                )}
              </div>
              <div className={s.fullRow}>
                <p className={s.hint}>Assignment changes and status actions are not available: no approved admin assignment or moderation policy exists yet, so nothing here can alter an inquiry.</p>
              </div>
            </div>
          )}
          <p className={s.audit}><ShieldCheck size={16} aria-hidden /> Viewing is read-only. Administrative access depends on your permissions.</p>
        </section>
      )}
    </>
  );
}
