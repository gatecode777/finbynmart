"use client";

import { useId, useMemo, useState } from "react";
import clsx from "clsx";
import { ChevronDown, CircleHelp, Search } from "lucide-react";
import inq from "../inquiries/Inquiries.module.css";
import styles from "./Support.module.css";

export interface FaqItem {
  id: string;
  category: string;
  question: string;
  answer: string;
}

interface Props {
  faqs: FaqItem[];
  categories: { value: string; label: string; count: number }[];
}

/**
 * The published FAQs as an accessible accordion (a button per question controlling its answer), with a category choice and a text
 * search over the small published set. Answers are plain text (never HTML). With nothing published the section says so.
 */
export function SupportFAQAccordion({ faqs, categories }: Props) {
  const id = useId();
  const [open, setOpen] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => faqs.filter((f) => (!category || f.category === category) && (!needle || f.question.toLowerCase().includes(needle) || f.answer.toLowerCase().includes(needle))), [faqs, category, needle]);

  return (
    <section className={styles.panel} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.panelTitle}><CircleHelp size={22} aria-hidden /> Frequently Asked Questions (FAQs)</h2>
      {faqs.length === 0 ? (
        <p className={styles.panelIntro}>No FAQs are published yet.</p>
      ) : (
        <>
          <div className={styles.faqTools}>
            <div className={inq.search} role="search">
              <Search className={inq.searchIcon} size={18} aria-hidden />
              <label htmlFor={`${id}-q`} className="visually-hidden">Search the FAQs</label>
              <input id={`${id}-q`} type="search" className={inq.searchInput} placeholder="Search the FAQs..." value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
            </div>
            <label className="visually-hidden" htmlFor={`${id}-cat`}>FAQ category</label>
            <select id={`${id}-cat`} className={inq.select} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.value} value={c.value}>{c.label} ({c.count})</option>)}
            </select>
          </div>
          {shown.length === 0 ? (
            <p className={styles.panelIntro}>No FAQ matches that search.</p>
          ) : (
            <ul className={styles.faqList}>
              {shown.map((f) => {
                const isOpen = open === f.id;
                return (
                  <li key={f.id} className={styles.faqItem}>
                    <h3 className="visually-hidden">{f.question}</h3>
                    <button type="button" className={styles.faqQuestion} aria-expanded={isOpen} aria-controls={`${id}-${f.id}`} id={`${id}-${f.id}-q`} onClick={() => setOpen(isOpen ? null : f.id)}>
                      <span>{f.question}</span>
                      <ChevronDown size={18} aria-hidden className={clsx(isOpen && styles.faqOpen)} />
                    </button>
                    <div id={`${id}-${f.id}`} role="region" aria-labelledby={`${id}-${f.id}-q`} hidden={!isOpen}>
                      <p className={styles.faqAnswer}>{f.answer}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
