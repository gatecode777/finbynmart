"use client";

import { FormEvent, useId, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { DATE_RANGES, ORDER_STATUSES, STATUS_LABEL } from "@/lib/orders/orderRules";
import type { OrderFacets } from "@/lib/orders/service";
import styles from "../inquiries/Inquiries.module.css";

export interface OrderFilterValues {
  status: string;
  supplierId: string;
  currency: string;
  range: string;
  dateFrom: string;
  dateTo: string;
}

interface Props {
  values: OrderFilterValues;
  facets: OrderFacets | null;
  today: string;
  onApply: (values: OrderFilterValues) => void;
  onClear: () => void;
  onClose: () => void;
}

/** The advanced filters in one accessible dialog (a side panel on wide screens, a bottom sheet on phones). Nothing is applied until Apply. */
export function OrderFiltersDialog({ values, facets, today, onApply, onClear, onClose }: Props) {
  const id = useId();
  const [draft, setDraft] = useState<OrderFilterValues>(values);
  const [error, setError] = useState("");
  const set = (key: keyof OrderFilterValues, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.range === "custom") {
      if (!draft.dateFrom || !draft.dateTo) return setError("Choose both a start date and an end date.");
      if (draft.dateFrom > draft.dateTo) return setError("The start date must not be after the end date.");
      if (draft.dateTo > today) return setError("The end date cannot be in the future.");
    }
    onApply(draft.range === "custom" ? draft : { ...draft, dateFrom: "", dateTo: "" });
  }

  const exact = ORDER_STATUSES.map((s) => s.toLowerCase());
  return (
    <Modal title="Filters" onClose={onClose} variant="drawer">
      <form className={styles.filterForm} onSubmit={submit} noValidate>
        <div className={styles.field}>
          <label htmlFor={`${id}-status`} className={styles.fieldLabel}>Order Status</label>
          <select id={`${id}-status`} className={styles.select} value={exact.includes(draft.status) ? draft.status : ""} onChange={(e) => set("status", e.target.value || "all")}>
            <option value="">Any (use the tabs)</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s.toLowerCase()}>{STATUS_LABEL[s]}</option>)}
          </select>
          <p className={styles.fieldHint}>An exact status replaces the tab choice.</p>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-supplier`} className={styles.fieldLabel}>Supplier</label>
          <select id={`${id}-supplier`} className={styles.select} value={draft.supplierId} onChange={(e) => set("supplierId", e.target.value)} disabled={!facets || facets.suppliers.length === 0}>
            <option value="">All suppliers</option>
            {facets?.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.count})</option>)}
          </select>
          <p className={styles.fieldHint}>{facets ? "Only suppliers you have ordered from." : "The supplier list could not be loaded."}</p>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-currency`} className={styles.fieldLabel}>Currency</label>
          <select id={`${id}-currency`} className={styles.select} value={draft.currency} onChange={(e) => set("currency", e.target.value)} disabled={!facets || facets.currencies.length === 0}>
            <option value="">All currencies</option>
            {facets?.currencies.map((c) => <option key={c.id} value={c.id}>{c.id} ({c.count})</option>)}
          </select>
          <p className={styles.fieldHint}>Needed to sort by amount: amounts in different currencies are never ranked together.</p>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-range`} className={styles.fieldLabel}>Order Date</label>
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
