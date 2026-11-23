"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Info, Search } from "lucide-react";
import auth from "@/components/auth/Auth.module.css";
import prof from "@/components/supplier/profile/SupplierProfile.module.css";
import { INBOX_KINDS, INBOX_TABS, type InboxKind, type InboxTab } from "@/lib/supplier/inquiryInboxRules";
import type { InboxResult } from "@/lib/supplier/inquiryListService";
import s from "./InquiryList.module.css";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export function SupplierInboxWorkspace({ initial, canView }: { initial: InboxResult; canView: boolean }) {
  const [data, setData] = useState(initial);
  const [kind, setKind] = useState<InboxKind>("all");
  const [tab, setTab] = useState<InboxTab>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const first = useRef(true);

  const load = useCallback(async () => {
    abort.current?.abort();
    const ctl = (abort.current = new AbortController());
    setBusy(true);
    const sp = new URLSearchParams({ tab, kind, page: String(page) });
    if (q.trim()) sp.set("q", q.trim());
    const res = await fetch(`/api/supplier/inquiries/list?${sp}`, { cache: "no-store", signal: ctl.signal }).catch(() => null);
    if (ctl.signal.aborted) return;
    const json = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (res?.ok && json?.ok) { setData(json.data); setError(""); } else setError(res ? "Could not load inquiries." : "Network error. Check your connection and retry.");
  }, [tab, kind, page, q]);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  if (!canView) return <p className={s.empty}>Your account is not permitted to view inquiries.</p>;
  if (data.noSellers) {
    return (
      <section className={s.panel} style={{ padding: "1.5rem" }}>
        <h2 className={s.h2}>No seller is linked to your company yet</h2>
        <p>Inquiries arrive for the sellers your company owns on Finbyn Mart. None is linked yet. The platform links a seller to a company after reviewing ownership, and a company cannot claim one itself, so there is nothing to show. Contact support to request a review.</p>
        <p><Link prefetch={false} href="/supplier/support" className={prof.btnSecondary}>Contact support</Link></p>
      </section>
    );
  }

  const m = data.meta;
  return (
    <>
      <div role="group" aria-label="Which inquiries" style={{ display: "flex", flexWrap: "wrap", gap: ".5rem", margin: "0 0 .75rem" }}>
        {INBOX_KINDS.map((k) => (
          <button key={k.key} type="button" className={kind === k.key ? prof.btnPrimary : prof.btnSecondary} aria-pressed={kind === k.key} onClick={() => { setKind(k.key); setTab("all"); setPage(1); }}>
            {k.label}{k.key === "matched" ? ` (${data.matchedTotal.toLocaleString("en-IN")})` : ""}
          </button>
        ))}
      </div>
      <p className={s.note} style={{ margin: "0 0 .75rem" }}>{INBOX_KINDS.find((k) => k.key === kind)!.badge}</p>
      {kind !== "all" && <div className={s.tabs} role="group" aria-label="Filter inquiries by status" style={{ display: "flex", flexWrap: "wrap", gap: ".5rem", margin: "0 0 1rem" }}>
        {INBOX_TABS.map((t) => (
          <button key={t.key} type="button" className={tab === t.key ? prof.btnPrimary : prof.btnSecondary} aria-pressed={tab === t.key} onClick={() => { setTab(t.key); setPage(1); }}>
            {t.label} ({data.counts[t.key].toLocaleString("en-IN")})
          </button>
        ))}
      </div>}
      <div className={s.search} style={{ maxWidth: 480, marginBottom: "1rem" }}>
        <label htmlFor="si-q" className={s.sr}>Search by inquiry reference or product</label>
        <Search size={16} aria-hidden className={s.searchIcon} />
        <input id="si-q" className={auth.control} placeholder="Inquiry reference or product" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>
      {error && <p role="alert" className={s.err}>{error} <button type="button" className={prof.btnSecondary} onClick={() => void load()}>Retry</button></p>}

      <section className={`${s.panel} ${busy ? s.busy : ""}`} aria-label="Inquiries" aria-busy={busy}>
        {data.items.length === 0 ? <p className={s.empty}>{kind === "matched" ? "No matching lead has reached your company yet." : "No inquiries match."}</p> : (
          <>
            <table className={s.table}>
              <thead><tr><th scope="col">Inquiry</th><th scope="col">Buyer</th><th scope="col">Product</th><th scope="col">Delivery</th><th scope="col">Status</th><th scope="col">Received</th><th scope="col">Action</th></tr></thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.reference}>
                    <th scope="row">{r.reference}<span className={s.badge} style={{ marginLeft: 6 }}>{r.kind === "DIRECT" ? "Direct" : "Matched"}</span></th>
                    <td>{r.buyer}{r.guest && <span className={s.badge} style={{ marginLeft: 6 }}>Guest</span>}</td>
                    <td>{r.product}{r.quantityText ? ` · ${r.quantityText}` : ""}</td>
                    <td>{r.location ?? "Not provided"}</td>
                    <td><span className={s.badge}>{r.statusLabel}</span></td>
                    <td>{fmt(r.receivedAt)}</td>
                    <td><Link prefetch={false} href={`/supplier/inquiries/${encodeURIComponent(r.reference)}`} className={prof.btnSecondary}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className={s.cards} aria-label="Inquiries">
              {data.items.map((r) => (
                <li key={r.reference} className={s.card}>
                  <div className={s.cardHead}><strong>{r.reference}</strong><span className={s.badge}>{r.kind === "DIRECT" ? "Direct" : "Matched"}</span><span className={s.badge}>{r.statusLabel}</span></div>
                  <dl className={s.facts}>
                    <div><dt>Buyer</dt><dd>{r.buyer}{r.guest ? " (guest)" : ""}</dd></div>
                    <div><dt>Product</dt><dd>{r.product}{r.quantityText ? ` · ${r.quantityText}` : ""}</dd></div>
                    <div><dt>Delivery</dt><dd>{r.location ?? "Not provided"}</dd></div>
                    <div><dt>Received</dt><dd>{fmt(r.receivedAt)}</dd></div>
                  </dl>
                  <Link prefetch={false} href={`/supplier/inquiries/${encodeURIComponent(r.reference)}`} className={prof.btnSecondary}>Open</Link>
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
      <p className={s.note} style={{ marginTop: "1rem" }}><Info size={14} aria-hidden /> Guest and closed inquiries are listed too. Whether an inquiry can be quoted is shown inside the inquiry. Competing suppliers&apos; responses are never visible here.</p>
    </>
  );
}
