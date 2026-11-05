"use client";

import { useId, useRef, useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import { FileText, Mail, MessagesSquare } from "lucide-react";
import type { InquiryQuotationItem } from "@/lib/quotations/service";
import styles from "./InquiryDetail.module.css";

const TABS = [
  { key: "responses", label: "Supplier Responses", icon: MessagesSquare, title: "No supplier response", text: "Supplier replies are not connected yet: a supplier is not notified automatically and has no place to answer, so nothing can appear here. Nothing is shown in its place." },
  { key: "quotations", label: "Quotations", icon: FileText, title: "No quotation received", text: "No quotation has been received for this inquiry. Suppliers cannot send quotations through Finbyn Mart yet, so none can appear here until that is connected. Nothing is shown in its place." },
  { key: "messages", label: "Messages", icon: Mail, title: "Messaging is not available yet", text: "There is no buyer-supplier messaging yet, so there is no conversation for this inquiry. Your original message is in Requirement Details." },
] as const;

/** Three sections: quotations are the buyer's real ones (null = could not be read); responses and messages say honestly they do not exist yet. Standard tab keyboard behaviour: arrow keys move, Home and End jump. */
export function InquiryTabs({ quotations }: { quotations: InquiryQuotationItem[] | null }) {
  const id = useId();
  const [active, setActive] = useState<(typeof TABS)[number]["key"]>("responses");
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    setActive(TABS[next].key);
    refs.current[next]?.focus();
  }

  const current = TABS.find((t) => t.key === active)!;
  return (
    <section className={styles.card} aria-label="Responses, quotations and messages">
      <div className={styles.tabList} role="tablist" aria-label="Inquiry activity">
        {TABS.map((tab, i) => (
          <button
            key={tab.key}
            ref={(el) => { refs.current[i] = el; }}
            id={`${id}-${tab.key}-tab`}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            aria-controls={`${id}-panel`}
            tabIndex={active === tab.key ? 0 : -1}
            className={clsx(styles.tab, active === tab.key && styles.tabActive)}
            onClick={() => setActive(tab.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <tab.icon size={18} aria-hidden /> {tab.label}
          </button>
        ))}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${active}-tab`} className={styles.panel}>
        {current.key === "quotations" && quotations === null ? (
          <>
            <h3 className={styles.emptyTitle}>Quotations could not be loaded</h3>
            <p className={styles.muted}>Nothing was changed. Reload the page to try again.</p>
          </>
        ) : current.key === "quotations" && quotations && quotations.length > 0 ? (
          <>
            <ul className={styles.quoteList}>
              {quotations.map((q) => (
                <li key={q.reference}>
                  <Link href={q.href} className={styles.link}>{q.reference}</Link> <span className={styles.muted}>V{q.version}</span> - {q.supplierName}
                  <br />{q.unitPrice}{q.total ? <> · Total {q.total}</> : null} · {q.statusLabel} · {q.validLabel}
                </li>
              ))}
            </ul>
            {quotations.length > 1 && <p><Link href={`/buyer/quotations/compare?refs=${quotations.slice(0, 4).map((q) => q.reference).join(",")}`} className={styles.link}>Compare these quotations</Link></p>}
          </>
        ) : (
          <>
            <h3 className={styles.emptyTitle}>{current.title}</h3>
            <p className={styles.muted}>{current.text}</p>
          </>
        )}
      </div>
    </section>
  );
}
