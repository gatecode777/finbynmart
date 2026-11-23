"use client";

import { useId, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronDown, Search, X } from "lucide-react";
import { SEARCH_MAX, filterFaqs } from "@/lib/support/faqSearch";
import styles from "./HelpFaq.module.css";

export interface HelpFaqItem { id: string; category: string; question: string; answer: string; links?: { label: string; href: string }[] }

/**
 * Local search and topic filter over a small static FAQ set. Every answer is in the server-rendered HTML (all items show before JavaScript runs), the text is only ever compared as plain
 * text and rendered by React (never as markup), nothing is sent anywhere and nothing about what was opened or searched is stored. Native details/summary give keyboard operation and the
 * expanded state.
 */
export function HelpFaq({ faqs, topics }: { faqs: HelpFaqItem[]; topics: { value: string; label: string; count: number }[] }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<string>("all");
  const shown = filterFaqs(faqs, query, topic);
  const filtered = query.trim() !== "" || topic !== "all";
  const reset = () => { setQuery(""); setTopic("all"); };
  const status = !filtered ? `${faqs.length} questions` : shown.length === 0 ? "No questions match." : `${shown.length} ${shown.length === 1 ? "question matches" : "questions match"}.`;

  return (
    <div>
      <form className={styles.search} role="search" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor={`${id}-q`} className={styles.label}>Search help topics</label>
        <div className={styles.field}>
          <Search size={18} aria-hidden className={styles.icon} />
          <input id={`${id}-q`} className={styles.input} type="search" value={query} maxLength={SEARCH_MAX} autoComplete="off" placeholder="Search questions and answers" onChange={(e) => setQuery(e.target.value)} />
          {query && (
            <button type="button" className={styles.clear} aria-label="Clear search" onClick={() => setQuery("")}><X size={16} aria-hidden /></button>
          )}
        </div>
      </form>

      <div className={styles.topics} role="group" aria-label="Topics">
        <button type="button" className={clsx(styles.topic, topic === "all" && styles.topicOn)} aria-pressed={topic === "all"} onClick={() => setTopic("all")}>All topics ({faqs.length})</button>
        {topics.map((t) => (
          <button key={t.value} type="button" className={clsx(styles.topic, topic === t.value && styles.topicOn)} aria-pressed={topic === t.value} onClick={() => setTopic(t.value)}>{t.label} ({t.count})</button>
        ))}
      </div>

      <div className={styles.statusRow}>
        <p className={styles.status} role="status" aria-live="polite">{status}</p>
        {filtered && <button type="button" className={styles.reset} onClick={reset}>Reset search and topic</button>}
      </div>

      {shown.length === 0 ? (
        <p className={styles.empty}>No help topic matches your search. Try fewer or different words, or <button type="button" className={styles.inlineReset} onClick={reset}>reset the search</button>, or use the Contact Us form below.</p>
      ) : (
        <ul className={styles.list}>
          {shown.map((faq) => (
            <li key={faq.id}>
              <details className={styles.item}>
                <summary className={styles.summary}>
                  <span className={styles.question}>{faq.question}</span>
                  <ChevronDown size={20} aria-hidden className={styles.chevron} />
                </summary>
                <div className={styles.answer}>
                  <p>{faq.answer}</p>
                  {faq.links && faq.links.length > 0 && (
                    <ul className={styles.links}>
                      {faq.links.map((l) => <li key={l.href}><Link prefetch={false} href={l.href}>{l.label}</Link></li>)}
                    </ul>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
