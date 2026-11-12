"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { HelpCircle, MessageSquareText, Send } from "lucide-react";
import { MESSAGE_MAX, MESSAGE_MIN, MESSAGE_TYPES, type MessageType } from "@/lib/supplier/inquiryRules";
import type { MessageDto } from "@/lib/inquiries/messages";
import dash from "../dashboard/SupplierDashboard.module.css";
import form from "../quotations/create/QuoteBuilder.module.css";
import { newIdempotencyKey } from "../idempotencyKey";
import styles from "./InquiryDetail.module.css";

interface Props {
  reference: string;
  buyerName: string;
  canRespond: { available: boolean; reason: string | null };
  initial: { items: MessageDto[]; nextCursor: string | null };
}

const HINT: Record<MessageType, string> = {
  RESPONSE: "Answer the buyer's inquiry. Plain text only.",
  CLARIFICATION: "Ask the buyer a question you need answered before you can quote. The buyer can read it on their inquiry page; replying inside Finbyn Mart is not available yet, so an answer will not appear here.",
};

/**
 * Respond to the buyer. Two modes of ONE message model (a response, or a clarification question), a persisted conversation below it (newest first, older pages
 * on request), nothing in browser storage. The message stays in the box until the server has saved it; a lost answer is retried with the SAME key (so it can
 * never be sent twice), and a changed message gets a new key. Sending is disabled while a send is in flight, but the server is what prevents duplicates.
 */
export function ResponsePanel({ reference, buyerName, canRespond, initial }: Props) {
  const router = useRouter();
  const id = useId();
  const [type, setType] = useState<MessageType>("RESPONSE");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [blocked, setBlocked] = useState<string | null>(canRespond.available ? null : canRespond.reason);
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const keyRef = useRef<{ type: MessageType; text: string; key: string } | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const trimmedLength = text.trim().length;

  function onTabKey(e: React.KeyboardEvent, i: number) {
    const last = MESSAGE_TYPES.length - 1;
    const next = e.key === "ArrowRight" ? (i + 1) % MESSAGE_TYPES.length : e.key === "ArrowLeft" ? (i - 1 + MESSAGE_TYPES.length) % MESSAGE_TYPES.length : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (next === null) return;
    e.preventDefault();
    setType(MESSAGE_TYPES[next].value);
    setErrors({});
    tabRefs.current[next]?.focus();
  }

  async function send() {
    setErrors({});
    setBanner(null);
    if (trimmedLength < MESSAGE_MIN) {
      setErrors({ message: `Write at least ${MESSAGE_MIN} characters.` });
      areaRef.current?.focus();
      return;
    }
    // the same content keeps the same key (a retry after a lost answer cannot create a second message); changed content gets a new one
    if (!keyRef.current || keyRef.current.type !== type || keyRef.current.text !== text) keyRef.current = { type, text, key: newIdempotencyKey() };
    setSending(true);
    try {
      const res = await fetch(`/api/supplier/inquiries/${encodeURIComponent(reference)}/responses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, message: text, idempotencyKey: keyRef.current.key }) });
      const body = await res.json().catch(() => null);
      if ((res.status === 201 || res.status === 200) && body?.ok) {
        const message = body.data.message as MessageDto;
        setItems((cur) => (cur.some((m) => m.id === message.id) ? cur : [message, ...cur]));
        setText("");
        keyRef.current = null;
        setBanner({ tone: "ok", text: `${type === "RESPONSE" ? "Response" : "Clarification request"} sent. ${body.message}` });
        router.refresh(); // the header status, the timeline and the quotation actions are read again from the records
        return;
      }
      if (res.status === 422) {
        setErrors(body?.fields ?? { message: body?.message ?? "Check the message." });
        setBanner({ tone: "error", text: "The message was not sent. Check the highlighted fields." });
        window.setTimeout(() => summaryRef.current?.focus(), 0);
        return;
      }
      if (res.status === 409 && (body?.code === "INQUIRY_CLOSED" || body?.code === "NOT_ELIGIBLE")) {
        setBlocked(body.message);
        setBanner({ tone: "error", text: `${body.message} Your text is still here.` });
        router.refresh();
        return;
      }
      if (res.status === 409 && body?.code === "IDEMPOTENCY_CONFLICT") {
        keyRef.current = null;
        setBanner({ tone: "error", text: "This message could not be matched to the earlier attempt. Press Send again." });
        return;
      }
      if (res.status === 403) {
        setBlocked(body?.message ?? "Your role cannot respond to inquiries.");
        setBanner({ tone: "error", text: "You no longer have permission to respond. Your text is still here." });
        return;
      }
      if (res.status === 404) {
        setBanner({ tone: "error", text: "This inquiry is no longer available to your company. Your text is still here." });
        return;
      }
      if (res.status === 429) {
        setBanner({ tone: "error", text: "You are sending too fast. Wait a moment and press Send again. Your text is still here." });
        return;
      }
      setBanner({ tone: "error", text: body?.message ?? "The message was not sent. Your text is still here. You can press Send again." });
    } catch {
      setBanner({ tone: "error", text: "We could not confirm the result (the connection was lost). Your text is still here. Press Send again: retrying is safe and will not send it twice." });
    } finally {
      setSending(false);
    }
  }

  async function loadOlder() {
    if (!cursor) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(`/api/supplier/inquiries/${encodeURIComponent(reference)}/responses?${new URLSearchParams({ cursor, limit: "20" })}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error("failed");
      setItems((cur) => [...cur, ...(body.items as MessageDto[]).filter((m) => !cur.some((c) => c.id === m.id))]);
      setCursor(body.meta.nextCursor);
    } catch {
      setBanner({ tone: "error", text: "Older messages could not be loaded. Try again." });
    } finally {
      setLoadingOlder(false);
    }
  }

  const errorKeys = Object.keys(errors);
  return (
    <>
      <section className={dash.card} aria-labelledby={`${id}-respond`}>
        <h2 id={`${id}-respond`} className={dash.cardTitle}><MessageSquareText size={20} aria-hidden /> Respond to Buyer</h2>
        {blocked ? (
          <p className={styles.note} role="note">{blocked}</p>
        ) : (
          <>
            <div className={styles.tabList} role="tablist" aria-label="Type of message">
              {MESSAGE_TYPES.map((t, i) => (
                <button key={t.value} ref={(el) => { tabRefs.current[i] = el; }} id={`${id}-${t.value}-tab`} type="button" role="tab" aria-selected={type === t.value} aria-controls={`${id}-panel`} tabIndex={type === t.value ? 0 : -1} className={clsx(styles.tab, type === t.value && styles.tabActive)} onClick={() => { setType(t.value); setErrors({}); }} onKeyDown={(e) => onTabKey(e, i)} disabled={sending}>
                  {t.value === "RESPONSE" ? <Send size={16} aria-hidden /> : <HelpCircle size={16} aria-hidden />} {t.label}
                </button>
              ))}
            </div>
            <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${type}-tab`}>
              {errorKeys.length > 0 && (
                <div ref={summaryRef} tabIndex={-1} className={form.errorSummary} role="alert" style={{ marginBottom: "var(--space-3)" }}>
                  <h3 style={{ margin: "0 0 var(--space-2)", fontSize: "var(--fs-base)" }}>Please fix this</h3>
                  <ul>{errorKeys.map((k) => <li key={k}>{k === "message" ? <a className={form.errorLink} href="#sd-message" onClick={(e) => { e.preventDefault(); areaRef.current?.focus(); }}>{errors[k]}</a> : errors[k]}</li>)}</ul>
                </div>
              )}
              <div className={form.field}>
                <label className={form.label} htmlFor="sd-message">{type === "RESPONSE" ? `Your response to ${buyerName}` : `Your question to ${buyerName}`}</label>
                <textarea id="sd-message" ref={areaRef} className={clsx(form.textarea, errors.message && form.invalid)} value={text} maxLength={MESSAGE_MAX} onChange={(e) => { setText(e.target.value); if (errors.message) setErrors({}); }} aria-invalid={errors.message ? true : undefined} aria-describedby={`sd-message-hint${errors.message ? " sd-message-err" : ""}`} disabled={sending} rows={6} />
                <p id="sd-message-hint" className={form.hint}>{HINT[type]}</p>
                {errors.message && <p id="sd-message-err" className={form.error}>{errors.message}</p>}
              </div>
              <div className={styles.formActions}>
                <span className={styles.counterText}>{text.length.toLocaleString("en-IN")} / {MESSAGE_MAX.toLocaleString("en-IN")}</span>
                <button type="button" className={clsx(dash.btn, styles.primary)} onClick={() => void send()} disabled={sending} aria-busy={sending}>
                  <Send size={16} aria-hidden /> {sending ? "Sending..." : type === "RESPONSE" ? "Send Response" : "Send Question"}
                </button>
              </div>
            </div>
          </>
        )}
        {banner && <p className={clsx(form.banner, banner.tone === "error" && form.bannerError)} role={banner.tone === "error" ? "alert" : "status"} style={{ marginTop: "var(--space-3)" }}>{banner.text}</p>}
      </section>

      <section className={dash.card} aria-labelledby={`${id}-prev`}>
        <h2 id={`${id}-prev`} className={dash.cardTitle}>Previous Responses</h2>
        {items.length === 0 ? (
          <p className={styles.note}>You have not sent anything on this inquiry yet. Opening this page does not send or record anything.</p>
        ) : (
          <>
            <ul className={styles.messages} aria-label="Messages sent to the buyer, newest first">
              {items.map((m) => (
                <li key={m.id} className={clsx(styles.message, m.type === "CLARIFICATION" && styles.messageClarify)}>
                  <div className={styles.messageHead}><strong>{m.typeLabel}</strong><span>{m.authorName} · {m.createdLabel}</span></div>
                  <p className={styles.messageBody}>{m.body}</p>
                </li>
              ))}
            </ul>
            <p className={styles.counterText} style={{ marginTop: "var(--space-2)" }}>Delivery and read receipts are not tracked, so none are shown.</p>
            {cursor && <button type="button" className={dash.btn} onClick={() => void loadOlder()} disabled={loadingOlder} aria-busy={loadingOlder} style={{ marginTop: "var(--space-3)" }}>{loadingOlder ? "Loading..." : "Load older messages"}</button>}
          </>
        )}
      </section>
    </>
  );
}
