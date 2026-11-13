"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import auth from "@/components/auth/Auth.module.css";
import prof from "@/components/supplier/profile/SupplierProfile.module.css";
import { Dropdown } from "@/components/ui/Dropdown";
import { flashToast } from "@/components/ui/Toast";
import type { StaffTicket, StaffTicketRow } from "@/lib/admin/supportStaff";
import s from "./AdminInquiries.module.css";

const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const label = (x: string) => x.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export function SupportStaffWorkspace() {
  const [items, setItems] = useState<StaffTicketRow[] | null>(null);
  const [t, setT] = useState<StaffTicket | null>(null);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"reply" | "note">("reply");
  const [next, setNext] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/support", { cache: "no-store" }).catch(() => null);
    const json = res?.ok ? await res.json().catch(() => null) : null;
    if (json?.ok) setItems(json.data.items); else setError("Could not load tickets.");
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function open(ref: string) {
    const res = await fetch(`/api/admin/support/${ref}`, { cache: "no-store" }).catch(() => null);
    const json = res?.ok ? await res.json().catch(() => null) : null;
    if (json?.ok) { setT(json.data); setText(""); setNext(""); setError(""); key.current = crypto.randomUUID(); } else flashToast("error", "Could not open this ticket.");
  }

  async function send() {
    if (!t || busy) return;
    if (text.trim().length < 2) { setError("Write a message."); return; }
    setBusy(true);
    const res = await fetch(`/api/admin/support/${t.reference}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, message: text, idempotencyKey: key.current, nextStatus: next }) }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (res?.ok && json.ok) { flashToast("success", json.message); void open(t.reference); void load(); return; }
    const msg = res ? (json.message ?? "Could not save.") : "Network error. Nothing was saved.";
    setError(msg);
    flashToast("error", "Not saved. " + msg);
  }

  const statusOptions = t ? [{ value: "", label: "Keep status" }, ...t.allowedNext.map((x) => ({ value: x, label: label(x) }))] : [];
  return (
    <>
      {error && <p role="alert" className={s.err}>{error}</p>}
      <section className={s.panel} aria-label="Tickets">
        {items === null ? <p className={s.empty}>Loading…</p> : items.length === 0 ? <p className={s.empty}>No tickets yet.</p> : (
          <ul className={s.cards} style={{ display: "grid" }}>
            {items.map((r) => (
              <li key={r.reference} className={s.card}>
                <div className={s.cardHead}><strong>{r.reference}</strong><span className={s.badge}>{label(r.status)}</span></div>
                <p style={{ margin: 0, overflowWrap: "anywhere" }}>{r.subject}</p>
                <span className={s.hint}>Updated {fmt(r.updatedAt)} · {r.hasSupportReply ? "has a support reply" : "no support reply yet"}</span>
                <button type="button" className={prof.btnSecondary} onClick={() => void open(r.reference)}>Open</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {t && (
        <section className={s.review} aria-labelledby="st-title" tabIndex={-1}>
          <h2 id="st-title">{t.reference}: {t.subject} <span className={s.badge}>{label(t.status)}</span></h2>
          <p className={s.box}>{t.description}</p>
          <ul className={s.msgs} style={{ marginTop: "1rem" }}>
            {t.messages.map((m) => (
              <li key={m.id} style={m.internal ? { background: "var(--accent-soft, #fff7e5)" } : undefined}>
                <strong>{m.role === "support" ? "Support" : m.role === "buyer" ? "Requester" : "System"}</strong> · {fmt(m.at)} {m.internal && <span className={s.badge}>Internal note, not visible to the requester</span>}
                <p>{m.body}</p>
              </li>
            ))}
          </ul>
          <div className={auth.field} style={{ marginTop: "1rem", maxWidth: 640 }}>
            <label htmlFor="st-kind" className={auth.label}>Type</label>
            <Dropdown id="st-kind" value={kind} onChange={(v) => setKind(v as "reply" | "note")} options={[{ value: "reply", label: "Public reply (the requester sees it)" }, { value: "note", label: "Internal note (staff only)" }]} />
            <label htmlFor="st-msg" className={auth.label} style={{ marginTop: ".75rem" }}>Message</label>
            <textarea id="st-msg" className={auth.control} rows={4} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
            <label htmlFor="st-next" className={auth.label} style={{ marginTop: ".75rem" }}>Status after sending</label>
            <Dropdown id="st-next" value={next} onChange={setNext} options={statusOptions} />
          </div>
          <button type="button" className={prof.btnGold} style={{ marginTop: "1rem" }} disabled={busy} onClick={() => void send()}>{busy ? "Saving…" : kind === "reply" ? "Send public reply" : "Save internal note"}</button>
          <p className={s.hint} style={{ marginTop: ".5rem" }}>No response time is promised to the requester.</p>
        </section>
      )}
    </>
  );
}
