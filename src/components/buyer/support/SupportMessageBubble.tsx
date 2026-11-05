import clsx from "clsx";
import { Download, FileText, Headphones, Image as ImageIcon } from "lucide-react";
import type { MessageDto } from "@/lib/support/conversationService";
import t from "./TicketDetails.module.css";

export const fileSize = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "B";

/**
 * One persisted message. The text is rendered as text (React escapes it; line breaks are kept by CSS), never as HTML. The sender label
 * comes from the server's role for the message, not from anything typed. There is no "seen" or "delivered" label: read receipts are not
 * recorded, so none is shown.
 */
export function SupportMessageBubble({ message: m, buyerName }: { message: MessageDto; buyerName: string }) {
  const support = m.sender === "support";
  const name = support ? m.senderLabel : `${buyerName} (You)`;
  return (
    <li className={t.message}>
      <span className={clsx(t.avatar, support && t.avatarSupport)} aria-hidden>{support ? <Headphones size={20} /> : initials(buyerName)}</span>
      <article aria-label={`${name}, ${m.atLabel}`}>
        <div className={t.messageHead}>
          <span className={t.sender}>{name}</span>
          <time className={t.when} dateTime={m.at}>{m.atLabel}</time>
        </div>
        <div className={clsx(t.bubble, support && t.bubbleSupport)}>
          {m.kind === "reopen" && <p className={t.bubbleNote}>Reason for reopening this ticket</p>}
          {m.kind === "original" && <p className={t.bubbleNote}>Original ticket description</p>}
          {m.body}
        </div>
        {m.attachments.length > 0 && (
          <ul className={t.chips} aria-label="Attached files">
            {m.attachments.map((a) => (
              <li key={a.id}>
                <a className={t.chip} href={a.href} download aria-label={`Download ${a.name} (${fileSize(a.size)})`}>
                  {a.mime.startsWith("image/") ? <ImageIcon size={16} aria-hidden /> : <FileText size={16} aria-hidden />}
                  <span>{a.name} ({fileSize(a.size)})</span>
                  <Download size={16} aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        )}
      </article>
    </li>
  );
}
