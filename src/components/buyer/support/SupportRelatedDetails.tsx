import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { RelatedDetails } from "@/lib/support/relatedDetails";
import inq from "../inquiries/Inquiries.module.css";
import t from "./TicketDetails.module.css";

/** The record the ticket is about, as it is now. `null` means the ticket is not linked to one; `undefined` means it could not be read. */
export function SupportRelatedDetails({ related, compact = false }: { related: RelatedDetails | null | undefined; compact?: boolean }) {
  if (related === undefined) return <p className={t.notice} role="alert">The related details could not be loaded. The ticket itself is not affected. Reload the page to try again.</p>;
  if (related === null) return <p className={t.notice}>This ticket is not linked to an inquiry, quotation, order or product.</p>;
  if (!related.available) return <p className={t.notice}>{related.typeLabel} {related.reference}: {related.message}</p>;
  return (
    <div>
      <p className={inq.muted}>{related.typeLabel} · {related.reference}</p>
      <p style={{ margin: "var(--space-1) 0 0", fontWeight: "var(--fw-bold)", overflowWrap: "anywhere" }}>{related.title}</p>
      <dl className={`${t.info} ${t.relatedLines}`}>
        {related.lines.map((l) => (
          <div key={l.label} className={t.infoRow}>
            <dt>{l.label}</dt>
            <dd>{l.value}</dd>
          </div>
        ))}
      </dl>
      {related.href && <Link href={related.href} className={inq.btn}><ExternalLink size={16} aria-hidden /> View {related.typeLabel}</Link>}
      {compact ? null : <p className={inq.muted}>Read again just now; it is shown only while it is still yours.</p>}
    </div>
  );
}
