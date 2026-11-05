"use client";

import { FormEvent, useId, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { DATE_RANGES } from "@/lib/inquiries/buyerListRules";
import { INQUIRY_TYPES } from "@/lib/inquiries/rules";
import type { InquiryFacets } from "@/lib/inquiries/buyerList";
import styles from "./Inquiries.module.css";

export interface FilterValues {
  inquiryType: string;
  supplierId: string;
  categoryId: string;
  range: string;
  dateFrom: string;
  dateTo: string;
}

interface Props {
  values: FilterValues;
  facets: InquiryFacets | null;
  today: string;
  onApply: (values: FilterValues) => void;
  onClear: () => void;
  onClose: () => void;
}

/** All the advanced filters in one accessible dialog (a side panel on wide screens, a bottom sheet on phones). Nothing is applied until Apply. */
export function InquiryFiltersDialog({ values, facets, today, onApply, onClear, onClose }: Props) {
  const id = useId();
  const [draft, setDraft] = useState<FilterValues>(values);
  const [error, setError] = useState("");
  const set = (key: keyof FilterValues, value: string) => setDraft((current) => ({ ...current, [key]: value }));

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
    <Modal title="Filters" onClose={onClose} variant="drawer">
      <form className={styles.filterForm} onSubmit={submit} noValidate>
        <div className={styles.field}>
          <label htmlFor={`${id}-type`} className={styles.fieldLabel}>Inquiry Type</label>
          <select id={`${id}-type`} className={styles.select} value={draft.inquiryType} onChange={(e) => set("inquiryType", e.target.value)}>
            <option value="">All types</option>
            {INQUIRY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-supplier`} className={styles.fieldLabel}>Supplier</label>
          <select id={`${id}-supplier`} className={styles.select} value={draft.supplierId} onChange={(e) => set("supplierId", e.target.value)} disabled={!facets || facets.suppliers.length === 0}>
            <option value="">All suppliers</option>
            {facets?.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.count})</option>)}
          </select>
          <p className={styles.fieldHint}>{facets ? "Only suppliers you have sent an inquiry to." : "The supplier list could not be loaded."}</p>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-category`} className={styles.fieldLabel}>Product Category</label>
          <select id={`${id}-category`} className={styles.select} value={draft.categoryId} onChange={(e) => set("categoryId", e.target.value)} disabled={!facets || facets.categories.length === 0}>
            <option value="">All categories</option>
            {facets?.categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.count})</option>)}
          </select>
          <p className={styles.fieldHint}>{facets && facets.categories.length === 0 ? "None of your inquiries has a product category yet (general inquiries have none)." : "The category of the product an inquiry was about."}</p>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-range`} className={styles.fieldLabel}>Submitted</label>
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
