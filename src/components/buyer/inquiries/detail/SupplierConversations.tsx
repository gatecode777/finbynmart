"use client";

import { FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import { Send } from "lucide-react";
import { flashToast } from "@/components/ui/Toast";
import { MESSAGE_MAX, MESSAGE_MIN } from "@/lib/supplier/inquiryRules";
import type { ResponderDto } from "@/lib/inquiries/conversations";
import type { MessageDto } from "@/lib/inquiries/messages";
import styles from "./InquiryDetail.module.css";

const newKey = () => crypto.randomUUID().replace(/-/g, "");

/**
 * The suppliers that really replied or quoted for this requirement, each with its OWN private conversation. A reply is sent only to the opened supplier
 * (the server resolves author, recipient and time). Labels are the server's: "Selected supplier" / "Additional matching supplier". There is no live chat,
 * typing indicator or read receipt, and files cannot be attached yet. The text is kept when a send fails; the retry reuses the same key, so it cannot double-send.
 */
export function SupplierConversations({ reference, suppliers, open }: { reference: string; suppliers: ResponderDto[]; open: boolean }) {
  const id = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const [items, setItems] = useState<MessageDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [text, setText] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [sending, setSending] = useState(false);
  const [announce, setAnnounce] = useState("");
  const abort = useRef<AbortController | null>(null);
  const attempt = useRef<{ text: string; key: string } | null>(null);
  const current = suppliers.find((s) => s.conversation === selected) ?? null;
  const base = `/api/buyer/inquiries/${encodeURIComponent(reference)}/conversations`;

  const load = useCallback(
    async (conversation: string, after: string | null) => {
      abort.current?.abort();
      const ctl = (abort.current = new AbortController());
      setLoading(true);
      setLoadError("");
      const res = await fetch(`${base}/${conversation}${after ? `?cursor=${encodeURIComponent(after)}` : ""}`, { cache: "no-store", signal: ctl.signal }).catch(() => null);
      if (ctl.signal.aborted) return;
      const json = res ? await res.json().catch(() => null) : null;
      setLoading(false);
      if (res?.ok && json?.ok) {
        setItems((prev) => (after ? [...prev, ...json.data.items] : json.data.items));
        setCursor(json.data.nextCursor);
      } else setLoadError(res ? "Could not load this conversation. Nothing was changed." : "Network error. Check your connection and retry.");
    },
    [base],
  );

  useEffect(() => {
    if (selected) void load(selected, null);
    return () => abort.current?.abort();
  }, [selected, load]);

  function choose(conversation: string) {
    if (conversation === selected) return setSelected(null);
    setItems([]);
    setCursor(null);
    setText("");
    setFieldError("");
    attempt.current = null;
    setSelected(conversation);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!current || sending) return;
    const message = text.trim();
    if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) {
      setFieldError(`Write between ${MESSAGE_MIN} and ${MESSAGE_MAX.toLocaleString("en-IN")} characters.`);
      return;
    }
    setFieldError("");
    setSending(true);
    // the same text keeps the same key, so a retry after a lost response cannot create a second message
    if (!attempt.current || attempt.current.text !== message) attempt.current = { text: message, key: newKey() };
    const res = await fetch(`${base}/${current.conversation}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, idempotencyKey: attempt.current.key }) }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    setSending(false);
    if (res?.ok && json?.ok) {
      setItems((prev) => (prev.some((m) => m.id === json.data.id) ? prev : [json.data, ...prev]));
      setText("");
      attempt.current = null;
      setAnnounce(`Message sent to ${current.name}.`);
      flashToast("success", json.message ?? "Your message was sent to this supplier.");
      return;
    }
    const msg = json?.fields?.message ?? json?.message ?? (res ? "Your message was not sent." : "Network error. Your message was not sent.");
    setFieldError(msg);
    setAnnounce(msg);
    flashToast("error", "Your message was not sent. Your text is kept: try again.");
  }

  return (
    <>
      <ul className={styles.responders} aria-label="Suppliers that replied or quoted">
        {suppliers.map((s) => {
          const expanded = s.conversation === selected;
          return (
            <li key={s.conversation} className={clsx(styles.responder, expanded && styles.responderOpen)}>
              <div className={styles.responderHead}>
                <strong>{s.name}</strong>
                <span className={clsx(styles.badge, s.origin === "SELECTED" && styles.badgeSelected)}>{s.originLabel}</span>
              </div>
              <p className={styles.muted}>
                {s.replies} {s.replies === 1 ? "reply" : "replies"}
                {s.lastActivityLabel ? ` · Last activity ${s.lastActivityLabel}` : ""}
              </p>
              {s.lastReply ? <p className={styles.reply}>&ldquo;{s.lastReply.summary}&rdquo;</p> : <p className={styles.muted}>This supplier has not sent a message{s.offer ? ", but has submitted an offer" : ""}.</p>}
              <div className={styles.responderActions}>
                {s.offer ? (
                  <Link prefetch={false} href={s.offer.href} className={styles.link}>View quotation {s.offer.reference} (V{s.offer.version}, {s.offer.statusLabel})</Link>
                ) : (
                  <span className={styles.muted}>No submitted offer yet</span>
                )}
                <button type="button" className={styles.btn} aria-expanded={expanded} aria-controls={`${id}-${s.conversation}`} onClick={() => choose(s.conversation)}>
                  {expanded ? "Close conversation" : "Open conversation"}
                </button>
              </div>

              {expanded && (
                <div id={`${id}-${s.conversation}`} className={styles.thread}>
                  {loadError && <p role="alert" className={styles.fieldError}>{loadError} <button type="button" className={styles.btn} onClick={() => void load(s.conversation, null)}>Retry</button></p>}
                  {loading && items.length === 0 && <p className={styles.muted}>Loading messages...</p>}
                  {!loading && !loadError && items.length === 0 && <p className={styles.muted}>No messages in this conversation yet.</p>}
                  <ol className={styles.messages} aria-label={`Messages with ${s.name}, newest first`}>
                    {items.map((m) => (
                      <li key={m.id} className={clsx(styles.bubble, m.sender === "BUYER" && styles.bubbleMine)}>
                        <div className={styles.bubbleHead}><strong>{m.sender === "BUYER" ? "You" : s.name}</strong><span>{m.typeLabel} · {m.createdLabel}</span></div>
                        <span className={styles.bubbleBody}>{m.body}</span>
                      </li>
                    ))}
                  </ol>
                  {cursor && <button type="button" className={styles.btn} disabled={loading} onClick={() => void load(s.conversation, cursor)}>{loading ? "Loading..." : "Load older messages"}</button>}

                  {open ? (
                    <form onSubmit={send} noValidate className={styles.composer}>
                      <label htmlFor={`${id}-msg`} className={styles.composerLabel}>Reply to {s.name}</label>
                      <p id={`${id}-hint`} className={styles.muted}>Only {s.name} will see this message. Other suppliers cannot, and it is not sent to anyone else. Plain text, no files, no phone or email needed.</p>
                      <textarea id={`${id}-msg`} className={clsx(styles.textarea, fieldError && styles.textareaInvalid)} rows={4} maxLength={MESSAGE_MAX} value={text} onChange={(e) => setText(e.target.value)} aria-invalid={Boolean(fieldError)} aria-describedby={`${id}-hint${fieldError ? ` ${id}-err` : ""}`} disabled={sending} />
                      {fieldError && <p id={`${id}-err`} className={styles.fieldError} role="alert">{fieldError}</p>}
                      <div className={styles.composerFoot}>
                        <span className={styles.muted}>{text.trim().length}/{MESSAGE_MAX.toLocaleString("en-IN")}</span>
                        <button type="submit" className={styles.btn} disabled={sending}><Send size={16} aria-hidden /> {sending ? "Sending..." : `Send to ${s.name}`}</button>
                      </div>
                    </form>
                  ) : (
                    <p className={styles.muted}>This requirement is closed, so new messages cannot be sent. The conversation stays readable.</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="visually-hidden" role="status" aria-live="polite">{announce}</p>
    </>
  );
}
