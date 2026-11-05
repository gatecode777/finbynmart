"use client";

import { RefreshCw } from "lucide-react";
import type { MessageDto } from "@/lib/support/conversationService";
import inq from "../inquiries/Inquiries.module.css";
import { SupportMessageBubble } from "./SupportMessageBubble";
import t from "./TicketDetails.module.css";

interface Props {
  messages: MessageDto[] | null;
  hasMore: boolean;
  loadingOlder: boolean;
  error: string | null;
  hasSupportReply: boolean;
  buyerName: string;
  refreshing: boolean;
  onLoadOlder: () => void;
  onRefresh: () => void;
}

/**
 * The persisted, buyer-visible messages, oldest first. A long conversation is read a page at a time: "Show earlier messages" walks
 * back. Nothing fills an empty space: until support has really replied the page says so. A failure here does not affect the other tabs.
 */
export function SupportConversation({ messages, hasMore, loadingOlder, error, hasSupportReply, buyerName, refreshing, onLoadOlder, onRefresh }: Props) {
  return (
    <div>
      <div className={t.tools}>
        {hasMore ? (
          <button type="button" className={t.linkBtn} onClick={onLoadOlder} disabled={loadingOlder}>{loadingOlder ? "Loading earlier messages..." : "Show earlier messages"}</button>
        ) : (
          <span />
        )}
        <button type="button" className={inq.btn} onClick={onRefresh} disabled={refreshing}><RefreshCw size={16} aria-hidden /> {refreshing ? "Refreshing..." : "Refresh"}</button>
      </div>

      {error && <p className={t.notice} role="alert">{error}</p>}
      {messages === null && !error && (
        <div className={t.skeletonList} aria-busy="true" aria-label="Loading the conversation">
          <div className={t.skeleton} />
          <div className={t.skeleton} />
        </div>
      )}
      {messages && messages.length === 0 && <p className={t.notice}>There are no messages yet.</p>}
      {messages && messages.length > 0 && (
        <ol className={t.messages} aria-label="Conversation">
          {messages.map((m) => <SupportMessageBubble key={m.id} message={m} buyerName={buyerName} />)}
        </ol>
      )}
      {messages && !hasSupportReply && (
        <p className={t.notice} style={{ marginTop: "var(--space-4)" }}>
          No reply from Finbyn Mart Support yet. A reply will appear here once one is recorded; no support team can answer through this site yet, so nothing is shown in its place.
        </p>
      )}
    </div>
  );
}
