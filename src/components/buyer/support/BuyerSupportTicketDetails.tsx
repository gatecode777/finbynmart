"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import { ArrowLeft, Copy, ListChecks, MessagesSquare, Paperclip, RotateCcw, Star, Link2 } from "lucide-react";
import { flashToast } from "@/components/ui/Toast";
import type { TicketTab } from "@/lib/support/conversationRules";
import type { FileItem, MessageDto, MessagePage, TicketOverview, TimelineItem } from "@/lib/support/conversationService";
import type { RelatedDetails } from "@/lib/support/relatedDetails";
import d from "../inquiries/detail/InquiryDetail.module.css";
import inq from "../inquiries/Inquiries.module.css";
import { ReopenTicketModal } from "./ReopenTicketModal";
import { SupportAttachmentList } from "./SupportAttachmentList";
import { SupportConversation } from "./SupportConversation";
import { SupportFeedbackForm } from "./SupportFeedbackForm";
import { SupportRelatedDetails } from "./SupportRelatedDetails";
import { SupportReplyComposer } from "./SupportReplyComposer";
import { SupportTicketStatusBadge } from "./SupportTicketStatusBadge";
import { SupportTicketTimeline } from "./SupportTicketTimeline";
import { usePagedFetch } from "./usePagedFetch";
import styles from "./Support.module.css";
import t from "./TicketDetails.module.css";

const TICKET_TABS = [
  { key: "conversation", label: "Conversation", icon: MessagesSquare },
  { key: "timeline", label: "Timeline", icon: ListChecks },
  { key: "attachments", label: "Attachments", icon: Paperclip },
  { key: "related", label: "Related Details", icon: Link2 },
] as const satisfies readonly { key: TicketTab; label: string; icon: unknown }[];

interface Props {
  initialOverview: TicketOverview;
  /** null = the first page could not be read (the conversation tab then says so; nothing else is affected). */
  initialMessages: MessagePage | null;
  /** undefined = could not be read; null = the ticket is not linked to a record. */
  initialRelated: RelatedDetails | null | undefined;
  buyerName: string;
  initialTab: TicketTab;
}

const api = (ref: string, tail = "") => `/api/buyer/support/tickets/${ref}${tail}`;
const LIST_KEY = "support-list-query";

/** Older messages first, the original description first of all; a message already shown is never added twice. */
function merge(current: MessageDto[], incoming: MessageDto[]): MessageDto[] {
  const byId = new Map<string, MessageDto>();
  for (const m of [...current, ...incoming]) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => (a.key === null ? -1 : b.key === null ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * The ticket page. Everything shown was read from the server for THIS buyer; every action goes to the server, which decides whether it is
 * allowed (the capability flags come from it, never from the browser). The tabs load their own data the first time they are opened, and
 * one failing tab does not blank the others. The reply draft lives here, so it survives switching tabs.
 */
export function BuyerSupportTicketDetails({ initialOverview, initialMessages, initialRelated, buyerName, initialTab }: Props) {
  const id = useId();
  const [overview, setOverview] = useState(initialOverview);
  const [tab, setTab] = useState<TicketTab>(initialTab);
  const [messages, setMessages] = useState<MessageDto[] | null>(initialMessages ? initialMessages.messages : null);
  const [meta, setMeta] = useState(initialMessages?.meta ?? { hasMore: false, nextCursor: null as string | null });
  const [messagesError, setMessagesError] = useState<string | null>(initialMessages ? null : "The conversation could not be loaded. Use Refresh to try again.");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftFiles, setDraftFiles] = useState<File[]>([]);
  const [reopening, setReopening] = useState(false);
  const [version, setVersion] = useState(0);
  const [backHref, setBackHref] = useState("/buyer/support");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastRefresh = useRef(Date.now());
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const ref = overview.reference;

  const timeline = usePagedFetch<TimelineItem>(api(ref, "/timeline"), tab === "timeline", version, (b) => (b as { data: { items: TimelineItem[] } }).data.items);
  const files = usePagedFetch<FileItem>(api(ref, "/attachments"), tab === "attachments", version, (b) => (b as { data: { files: FileItem[] } }).data.files);

  // return to the list with the search and filters it had
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(LIST_KEY);
      if (saved !== null && /^(\?[A-Za-z0-9_=&%.\-:,+]*)?$/.test(saved)) setBackHref(`/buyer/support${saved}`);
    } catch {
      /* storage blocked: the plain list */
    }
  }, []);

  function chooseTab(next: TicketTab) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "conversation") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }

  function onTabKey(event: React.KeyboardEvent, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TICKET_TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TICKET_TABS.length) % TICKET_TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TICKET_TABS.length - 1;
    else return;
    event.preventDefault();
    chooseTab(TICKET_TABS[next].key);
    tabRefs.current[next]?.focus();
  }

  const reloadOverview = useCallback(async () => {
    try {
      const response = await fetch(api(ref), { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ok) setOverview(body.data as TicketOverview);
    } catch {
      /* the page keeps what it has */
    }
  }, [ref]);

  /** Reads the ticket and the newest messages again (manual Refresh, or the page becoming visible again). */
  const refreshAll = useCallback(
    async (quiet = false) => {
      setRefreshing(true);
      lastRefresh.current = Date.now();
      try {
        const response = await fetch(`${api(ref, "/messages")}?limit=50`, { cache: "no-store" });
        const body = await response.json().catch(() => null);
        if (response.ok && body?.ok) {
          const incoming = body.data.messages as MessageDto[];
          const cur = messagesRef.current;
          const lastKey = cur ? ([...cur].reverse().find((m) => m.key)?.key ?? null) : null;
          const firstIncoming = incoming.find((m) => m.key)?.key ?? null;
          // more than a page of new messages arrived since the last read: the two do not meet, so start again from the newest
          const gap = Boolean(body.meta.hasMore) && lastKey !== null && firstIncoming !== null && firstIncoming > lastKey;
          if (!cur || gap) {
            setMessages(incoming);
            setMeta(body.meta);
          } else {
            setMessages(merge(cur, incoming));
          }
          setMessagesError(null);
        } else if (!quiet) {
          setMessagesError("The conversation could not be refreshed. Nothing was changed.");
        }
        await reloadOverview();
        setVersion((v) => v + 1);
      } catch {
        if (!quiet) setMessagesError("Could not reach the server. Nothing was changed.");
      } finally {
        setRefreshing(false);
      }
    },
    [ref, reloadOverview],
  );

  // a visible page that was in the background is read again, at most once a minute; there is no timer polling
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible" && Date.now() - lastRefresh.current > 60_000) void refreshAll(true);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshAll]);

  async function loadOlder() {
    if (!meta.nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const response = await fetch(`${api(ref, "/messages")}?before=${encodeURIComponent(meta.nextCursor)}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ok) {
        setMessages((cur) => merge(cur ?? [], body.data.messages as MessageDto[]));
        setMeta(body.meta);
        setMessagesError(null);
      } else setMessagesError("Earlier messages could not be loaded. Try again.");
    } catch {
      setMessagesError("Could not reach the server. Try again.");
    } finally {
      setLoadingOlder(false);
    }
  }

  function onSent(message: MessageDto) {
    setMessages((cur) => merge(cur ?? [], [message]));
    setVersion((v) => v + 1);
    void reloadOverview();
    flashToast("success", "Your reply was sent.");
  }

  async function copyReference() {
    try {
      await navigator.clipboard.writeText(ref);
      flashToast("success", "Ticket ID copied.");
    } catch {
      flashToast("error", "Could not copy. Select the ticket ID and copy it.");
    }
  }

  const cap = overview.capabilities;
  const resolvedish = overview.status === "RESOLVED" || overview.status === "CLOSED";

  return (
    <>
      <div className={`${d.headerActions} ${d.noPrint}`}>
        <Link href={backHref} className={d.btn}><ArrowLeft size={18} aria-hidden /> Back to All Tickets</Link>
        {cap.canReopen && <button type="button" className={`${d.btn} ${inq.btnPrimary}`} onClick={() => setReopening(true)}><RotateCcw size={18} aria-hidden /> Reopen Ticket</button>}
      </div>

      <section className={d.card} aria-label="Ticket summary">
        <dl className={t.summary}>
          <div className={t.summaryItem}>
            <dt>Ticket ID</dt>
            <dd>
              <span className={t.reference}>{ref}
                <button type="button" className={t.copyBtn} onClick={() => void copyReference()} aria-label={`Copy ticket ID ${ref}`}><Copy size={16} aria-hidden /></button>
              </span>
            </dd>
          </div>
          <div className={t.summaryItem}><dt>Subject</dt><dd>{overview.subject}</dd></div>
          <div className={t.summaryItem}><dt>Category</dt><dd><span className={styles.catTag}>{overview.category.label}</span></dd></div>
          <div className={t.summaryItem}><dt>Status</dt><dd><SupportTicketStatusBadge label={overview.statusLabel} group={overview.statusGroup} status={overview.status} /></dd></div>
          <div className={t.summaryItem}><dt>Created On</dt><dd><time dateTime={overview.createdAt}>{overview.createdLabel}</time></dd></div>
          <div className={t.summaryItem}><dt>Last Updated</dt><dd><time dateTime={overview.updatedAt}>{overview.updatedLabel}</time></dd></div>
        </dl>
      </section>

      <div className={t.layout}>
        <div className={t.col}>
          <section className={d.card} aria-label="Ticket conversation, timeline, files and related details">
            <div className={d.tabList} role="tablist" aria-label="Ticket sections">
              {TICKET_TABS.map((item, i) => (
                <button
                  key={item.key}
                  ref={(el) => { tabRefs.current[i] = el; }}
                  id={`${id}-${item.key}-tab`}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.key}
                  aria-controls={`${id}-${item.key}-panel`}
                  tabIndex={tab === item.key ? 0 : -1}
                  className={clsx(d.tab, tab === item.key && d.tabActive)}
                  onClick={() => chooseTab(item.key)}
                  onKeyDown={(e) => onTabKey(e, i)}
                >
                  <item.icon size={18} aria-hidden /> {item.label}
                </button>
              ))}
            </div>

            <div id={`${id}-conversation-panel`} role="tabpanel" aria-labelledby={`${id}-conversation-tab`} hidden={tab !== "conversation"} className={d.panel}>
              <SupportConversation messages={messages} hasMore={meta.hasMore} loadingOlder={loadingOlder} error={messagesError} hasSupportReply={overview.hasSupportReply || (messages?.some((m) => m.sender === "support") ?? false)} buyerName={buyerName} refreshing={refreshing} onLoadOlder={() => void loadOlder()} onRefresh={() => void refreshAll()} />
              {cap.canReply ? (
                <SupportReplyComposer reference={ref} limits={overview.limits} text={draft} files={draftFiles} onText={setDraft} onFiles={setDraftFiles} onSent={onSent} />
              ) : (
                <div className={t.composer}>
                  <p className={t.notice} role="status">{overview.reasons.reply ?? "You cannot reply to this ticket."}</p>
                  {cap.canReopen ? (
                    <div><button type="button" className={`${inq.btn} ${inq.btnPrimary}`} onClick={() => setReopening(true)}><RotateCcw size={16} aria-hidden /> Reopen Ticket</button></div>
                  ) : overview.reasons.reopen ? (
                    <p className={t.notice}>{overview.reasons.reopen}</p>
                  ) : null}
                </div>
              )}
            </div>

            <div id={`${id}-timeline-panel`} role="tabpanel" aria-labelledby={`${id}-timeline-tab`} hidden={tab !== "timeline"} className={d.panel}>
              <SupportTicketTimeline state={timeline} />
            </div>

            <div id={`${id}-attachments-panel`} role="tabpanel" aria-labelledby={`${id}-attachments-tab`} hidden={tab !== "attachments"} className={d.panel}>
              <SupportAttachmentList state={files} />
            </div>

            <div id={`${id}-related-panel`} role="tabpanel" aria-labelledby={`${id}-related-tab`} hidden={tab !== "related"} className={d.panel}>
              <SupportRelatedDetails related={initialRelated} />
            </div>
          </section>
        </div>

        <aside className={t.col} aria-label="Ticket information">
          <section className={d.card} aria-labelledby={`${id}-info`}>
            <h2 id={`${id}-info`} className={d.cardTitle}>Ticket Information</h2>
            <dl className={t.info}>
              <div className={t.infoRow}><dt>Ticket ID</dt><dd>{ref}</dd></div>
              <div className={t.infoRow}><dt>Status</dt><dd><SupportTicketStatusBadge label={overview.statusLabel} group={overview.statusGroup} status={overview.status} /></dd></div>
              <div className={t.infoRow}><dt>Category</dt><dd>{overview.category.label}</dd></div>
              {overview.related && (
                <div className={t.infoRow}>
                  <dt>Related To</dt>
                  <dd>{overview.related.typeLabel}: {overview.related.href ? <Link href={overview.related.href} className={d.link}>{overview.related.reference}</Link> : overview.related.reference}</dd>
                </div>
              )}
              <div className={t.infoRow}><dt>Created On</dt><dd>{overview.createdLabel}</dd></div>
              <div className={t.infoRow}><dt>Last Updated</dt><dd>{overview.updatedLabel}</dd></div>
              {overview.resolvedLabel && <div className={t.infoRow}><dt>{overview.status === "CLOSED" ? "Closed On" : "Resolved On"}</dt><dd>{overview.resolvedLabel}</dd></div>}
              {overview.reopenCount > 0 && <div className={t.infoRow}><dt>Reopened</dt><dd>{overview.reopenCount} {overview.reopenCount === 1 ? "time" : "times"}</dd></div>}
            </dl>
          </section>

          {overview.related && (
            <section className={d.card} aria-labelledby={`${id}-related`}>
              <h2 id={`${id}-related`} className={d.cardTitle}>Related {overview.related.typeLabel}</h2>
              <SupportRelatedDetails related={initialRelated} compact />
            </section>
          )}

          {(cap.canSubmitFeedback || overview.feedback.submitted) && (
            <section className={d.card} aria-labelledby={`${id}-feedback`}>
              <h2 id={`${id}-feedback`} className={d.cardTitle}><Star size={20} aria-hidden /> Was your issue resolved?</h2>
              {overview.feedback.submitted ? (
                <p role="status">Thank you. You rated this ticket {overview.feedback.rating} out of 5{overview.feedback.submittedLabel ? ` on ${overview.feedback.submittedLabel}` : ""}.</p>
              ) : (
                <>
                  <p className={inq.muted}>Share your feedback about the support you received.</p>
                  <SupportFeedbackForm reference={ref} onSaved={(rating, submittedLabel) => { setOverview((o) => ({ ...o, feedback: { submitted: true, rating, submittedLabel: submittedLabel || null }, capabilities: { ...o.capabilities, canSubmitFeedback: false } })); setVersion((v) => v + 1); void reloadOverview(); flashToast("success", "Thank you. Your feedback was saved."); }} />
                </>
              )}
            </section>
          )}
          {resolvedish && !cap.canSubmitFeedback && !overview.feedback.submitted && overview.reasons.feedback && <p className={inq.muted}>{overview.reasons.feedback}</p>}
        </aside>
      </div>

      {reopening && (
        <ReopenTicketModal
          reference={ref}
          onClose={() => setReopening(false)}
          onDone={(message) => {
            setReopening(false);
            flashToast("success", message);
            void refreshAll(true);
          }}
        />
      )}
    </>
  );
}
