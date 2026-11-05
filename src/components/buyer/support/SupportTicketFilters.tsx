"use client";

import { FormEvent, useId, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { DATE_RANGES, RELATED_TYPES, STATUS_LABEL, SUPPORT_CATEGORIES, TICKET_STATUSES } from "@/lib/support/ticketRules";
import styles from "../inquiries/Inquiries.module.css";

export interface TicketFilterValues {
  status: string;
  categoryId: string;
  relatedEntityType: string;
  range: string;
  dateFrom: string;
  dateTo: string;
}

interface Props {
  values: TicketFilterValues;
  today: string;
  onApply: (values: TicketFilterValues) => void;
  onClear: () => void;
  onClose: () => void;
}

/** The ticket filters in one accessible dialog (a side panel on wide screens, a bottom sheet on phones). Nothing is applied until Apply. */
export function SupportTicketFilters({ values, today, onApply, onClear, onClose }: Props) {
  const id = useId();
  const [draft, setDraft] = useState<TicketFilterValues>(values);
  const [error, setError] = useState("");
  const set = (key: keyof TicketFilterValues, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.range === "custom") {
      if (!draft.dateFrom || !draft.dateTo) return setError("Choose both a start date and an end date.");
      if (draft.dateFrom > draft.dateTo) return setError("The start date must not be after the end date.");
      if (draft.dateTo > today) return setError("The end date cannot be in the future.");
    }
    onApply(draft.range === "custom" ? draft : { ...draft, dateFrom: "", dateTo: "" });
  }

  return (
    <Modal title="Filter tickets" onClose={onClose} variant="drawer">
      <form className={styles.filterForm} onSubmit={submit} noValidate>
        <div className={styles.field}>
          <label htmlFor={`${id}-status`} className={styles.fieldLabel}>Status</label>
          <select id={`${id}-status`} className={styles.select} value={draft.status} onChange={(e) => set("status", e.target.value)}>
            <option value="all">All statuses</option>
            {TICKET_STATUSES.map((s) => <option key={s} value={s.toLowerCase()}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-cat`} className={styles.fieldLabel}>Category</label>
          <select id={`${id}-cat`} className={styles.select} value={draft.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            <option value="">All categories</option>
            {SUPPORT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-rel`} className={styles.fieldLabel}>Related module</label>
          <select id={`${id}-rel`} className={styles.select} value={draft.relatedEntityType} onChange={(e) => set("relatedEntityType", e.target.value)}>
            <option value="">Any (or none)</option>
            {RELATED_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-range`} className={styles.fieldLabel}>Created</label>
          <select id={`${id}-range`} className={styles.select} value={draft.range} onChange={(e) => { set("range", e.target.value); setError(""); }}>
            <option value="">Any time</option>
            {DATE_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <p className={styles.fieldHint}>Days are counted in India time.</p>
        </div>
        {draft.range === "custom" && (
          <div className={styles.dateRow}>
            <div className={styles.field}>
              <label htmlFor={`${id}-from`} className={styles.fieldLabel}>From</label>
              <input id={`${id}-from`} type="date" className={styles.select} value={draft.dateFrom} max={today} onChange={(e) => { set("dateFrom", e.target.value); setError(""); }} />
            </div>
            <div className={styles.field}>
              <label htmlFor={`${id}-to`} className={styles.fieldLabel}>To</label>
              <input id={`${id}-to`} type="date" className={styles.select} value={draft.dateTo} max={today} onChange={(e) => { set("dateTo", e.target.value); setError(""); }} />
            </div>
          </div>
        )}
        {error && <p className={styles.fieldError} role="alert">{error}</p>}
        <div className={styles.dialogActions}>
          <button type="button" className={styles.btn} onClick={onClear}>Clear All</button>
          <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`}>Apply</button>
        </div>
      </form>
    </Modal>
  );
}
