"use client";

import { FormEvent, useId, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { VERIFICATION_FILTERS } from "@/lib/wishlist/savedSuppliersRules";
import type { SavedSupplierFacets } from "@/lib/wishlist/savedSuppliers";
import styles from "../inquiries/Inquiries.module.css";

export interface SupplierFilterValues {
  category: string;
  state: string;
  city: string;
  type: string;
  verification: string;
}

interface Props {
  values: SupplierFilterValues;
  facets: SavedSupplierFacets | null;
  onApply: (values: SupplierFilterValues) => void;
  onClear: () => void;
  onClose: () => void;
}

/** The filters in one accessible dialog (a side panel on wide screens, a bottom sheet on phones). Every choice comes from what the buyer really saved. */
export function SavedSupplierFiltersDialog({ values, facets, onApply, onClear, onClose }: Props) {
  const id = useId();
  const [draft, setDraft] = useState<SupplierFilterValues>(values);
  const set = (key: keyof SupplierFilterValues, value: string) => setDraft((d) => ({ ...d, [key]: value, ...(key === "state" ? { city: "" } : {}) }));
  const cities = facets?.cities.filter((c) => !draft.state || c.stateId === draft.state) ?? [];

  function submit(event: FormEvent) {
    event.preventDefault();
    onApply(draft);
  }

  return (
    <Modal title="Filters" onClose={onClose} variant="drawer">
      <form className={styles.filterForm} onSubmit={submit} noValidate>
        <div className={styles.field}>
          <label htmlFor={`${id}-cat`} className={styles.fieldLabel}>Product Category</label>
          <select id={`${id}-cat`} className={styles.select} value={draft.category} onChange={(e) => set("category", e.target.value)} disabled={!facets || facets.categories.length === 0}>
            <option value="">All categories</option>
            {facets?.categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.count})</option>)}
          </select>
          <p className={styles.fieldHint}>A supplier in several categories appears under each of them.</p>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-state`} className={styles.fieldLabel}>State</label>
          <select id={`${id}-state`} className={styles.select} value={draft.state} onChange={(e) => set("state", e.target.value)} disabled={!facets || facets.states.length === 0}>
            <option value="">All states</option>
            {facets?.states.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.count})</option>)}
          </select>
          <p className={styles.fieldHint}>Supplier records hold a city and a state, not a country, so there is no country filter.</p>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-city`} className={styles.fieldLabel}>City</label>
          <select id={`${id}-city`} className={styles.select} value={draft.city} onChange={(e) => set("city", e.target.value)} disabled={cities.length === 0}>
            <option value="">All cities</option>
            {cities.map((c) => <option key={`${c.stateId}/${c.id}`} value={c.id}>{c.name} ({c.count})</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-type`} className={styles.fieldLabel}>Supplier Type</label>
          <select id={`${id}-type`} className={styles.select} value={draft.type} onChange={(e) => set("type", e.target.value)} disabled={!facets || facets.types.length === 0}>
            <option value="">All types</option>
            {facets?.types.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.count})</option>)}
          </select>
          <p className={styles.fieldHint}>Only some supplier records state a type; the others are listed as Not specified.</p>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-ver`} className={styles.fieldLabel}>Verification</label>
          <select id={`${id}-ver`} className={styles.select} value={draft.verification} onChange={(e) => set("verification", e.target.value)}>
            <option value="">All suppliers</option>
            {VERIFICATION_FILTERS.map((v) => <option key={v.value} value={v.value}>{v.label}{facets ? ` (${facets.verification[v.value === "verified" ? "verified" : "unverified"]})` : ""}</option>)}
          </select>
          <p className={styles.fieldHint}>Verified only where the supplier&apos;s own record says so. Pending and rejected states do not exist: there is no verification workflow.</p>
        </div>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.btn} onClick={onClear}>Clear All</button>
          <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`}>Apply</button>
        </div>
      </form>
    </Modal>
  );
}
