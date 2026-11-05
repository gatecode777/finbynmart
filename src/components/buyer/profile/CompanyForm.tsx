"use client";

import { FormEvent, ReactNode, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Building2, Save } from "lucide-react";
import { BUSINESS_TYPES, COUNTRIES, validateCompany } from "@/lib/buyer/profileRules";
import type { CompanyDto } from "@/lib/buyer/profile";
import auth from "@/components/auth/Auth.module.css";
import dash from "../Dashboard.module.css";
import { useDirty } from "./dirty";
import styles from "./Profile.module.css";

type Values = { legalName: string; displayName: string; businessType: string; industry: string; description: string; website: string; yearEstablished: string; companyEmail: string; country: string; state: string; city: string; postalCode: string; registeredAddress: string; operatingAddress: string };

const toValues = (c: CompanyDto | null, suggestedName: string): Values => ({ legalName: c?.legalName ?? suggestedName, displayName: c?.displayName ?? "", businessType: c?.businessType ?? "", industry: c?.industry ?? "", description: c?.description ?? "", website: c?.website ?? "", yearEstablished: c?.yearEstablished ? String(c.yearEstablished) : "", companyEmail: c?.companyEmail ?? "", country: c?.country ?? "India", state: c?.state ?? "", city: c?.city ?? "", postalCode: c?.postalCode ?? "", registeredAddress: c?.registeredAddress ?? "", operatingAddress: c?.operatingAddress ?? "" });

/**
 * Company details. With no company the form creates one (the name typed at registration is offered as a suggestion, nothing
 * is created until the buyer saves). The company's verification state is shown but cannot be edited here. A company name
 * that another company already holds is refused: companies are not claimable from this page.
 */
export function CompanyForm({ company, suggestedName }: { company: CompanyDto | null; suggestedName: string }) {
  const router = useRouter();
  const id = useId();
  const { setDirty } = useDirty();
  const [saved, setSaved] = useState(() => toValues(company, suggestedName));
  const [values, setValues] = useState(saved);
  const [version, setVersion] = useState(company?.version ?? 0);
  const [exists, setExists] = useState(Boolean(company));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  useEffect(() => setDirty(dirty), [dirty, setDirty]);
  useEffect(() => () => setDirty(false), [setDirty]);

  const set = (key: keyof Values) => (value: string) => setValues((current) => ({ ...current, [key]: value }));
  const err = (field: string): ReactNode => (errors[field] ? <span id={`${id}-${field}-e`} className={auth.error} role="alert">{errors[field]}</span> : null);
  const describe = (field: string) => (errors[field] ? `${id}-${field}-e` : undefined);
  const input = (field: keyof Values, label: string, extra: { required?: boolean; type?: string; max?: number; hint?: string; auto?: string } = {}) => (
    <div className={auth.field}>
      <label htmlFor={`${id}-${field}`} className={auth.label}>{label} {extra.required && <span aria-hidden>*</span>}</label>
      <input id={`${id}-${field}`} className={clsx(auth.control, errors[field] && auth.invalid)} type={extra.type ?? "text"} inputMode={extra.type === "number" ? "numeric" : undefined} value={values[field]} onChange={(e) => set(field)(e.target.value)} maxLength={extra.max} autoComplete={extra.auto} aria-invalid={Boolean(errors[field])} aria-describedby={describe(field)} />
      {extra.hint && <span className={auth.hint}>{extra.hint}</span>}
      {err(field)}
    </div>
  );

  const payload = () => ({ ...values, ...(exists ? { version } : {}) });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || (exists && !dirty)) return;
    setBanner(null);
    const check = validateCompany(payload(), exists ? "update" : "create");
    if (!check.ok) return setErrors(check.fields);
    setErrors({});
    setBusy(true);
    const response = await fetch("/api/buyer/company", { method: exists ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    if (response?.ok && data.ok) {
      const next = toValues(data.data.company as CompanyDto, "");
      setSaved(next);
      setValues(next);
      setVersion((data.data.company as CompanyDto).version);
      setExists(true);
      setBanner({ ok: true, text: data.message as string });
      router.refresh();
      return;
    }
    setErrors(data.fields ?? {});
    setBanner({ ok: false, text: response ? (data.message ?? "Your company could not be saved.") : "Could not reach the server. Your changes are still here: try again." });
  }

  return (
    <section className={dash.card} aria-labelledby="company-title">
      <h2 id="company-title" className={dash.cardTitle}>
        <Building2 size={20} aria-hidden /> Company Details
      </h2>
      {!exists && <p className={clsx(styles.banner, styles.bannerInfo)}>You have not added a company yet. Add your legal company name and business type to begin; nothing is saved until you press the button.</p>}
      <p className={dash.legendNote}>Everything here is saved as you type it. Finbyn Mart does not verify it, and the company stays &quot;Unverified&quot;: there is no company review process yet.</p>
      {banner && <p className={clsx(styles.banner, banner.ok ? styles.bannerOk : styles.bannerError)} role={banner.ok ? "status" : "alert"}>{banner.text}</p>}
      <form onSubmit={submit} noValidate aria-label="Company details">
        <div className={styles.formGrid}>
          {input("legalName", "Legal Company Name", { required: true, max: 160, auto: "organization" })}
          {input("displayName", "Display Company Name", { max: 160 })}
          <div className={auth.field}>
            <label htmlFor={`${id}-businessType`} className={auth.label}>Business Type <span aria-hidden>*</span></label>
            <select id={`${id}-businessType`} className={clsx(auth.control, errors.businessType && auth.invalid)} value={values.businessType} onChange={(e) => set("businessType")(e.target.value)} aria-invalid={Boolean(errors.businessType)} aria-describedby={describe("businessType")}>
              <option value="">Select business type</option>
              {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {err("businessType")}
          </div>
          {input("industry", "Industry", { max: 110 })}
          <div className={clsx(auth.field, styles.span2)}>
            <label htmlFor={`${id}-description`} className={auth.label}>Business Description</label>
            <textarea id={`${id}-description`} className={clsx(auth.control, auth.textarea, errors.description && auth.invalid)} rows={4} maxLength={1010} value={values.description} onChange={(e) => set("description")(e.target.value)} aria-invalid={Boolean(errors.description)} aria-describedby={describe("description")} />
            <span className={auth.hint}>{values.description.length} / 1000</span>
            {err("description")}
          </div>
          {input("website", "Website", { max: 200, hint: "For example www.example.com", auto: "url" })}
          {input("yearEstablished", "Year Established", { type: "number", max: 4 })}
          {input("companyEmail", "Company Email", { type: "email", max: 254 })}
          <div className={auth.field}>
            <label htmlFor={`${id}-country`} className={auth.label}>Country</label>
            <select id={`${id}-country`} className={clsx(auth.control, errors.country && auth.invalid)} value={values.country} onChange={(e) => set("country")(e.target.value)}>
              {COUNTRIES.map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}
            </select>
            {err("country")}
          </div>
          {input("state", "State / Province", { max: 65, auto: "address-level1" })}
          {input("city", "City", { max: 85, auto: "address-level2" })}
          {input("postalCode", values.country === "India" ? "PIN Code" : "Postal Code", { max: 12, auto: "postal-code", hint: values.country === "India" ? "Six digits, not starting with 0." : undefined })}
          <div className={clsx(auth.field, styles.span2)}>
            <label htmlFor={`${id}-registered`} className={auth.label}>Registered Address</label>
            <textarea id={`${id}-registered`} className={clsx(auth.control, auth.textarea, errors.registeredAddress && auth.invalid)} rows={2} maxLength={210} value={values.registeredAddress} onChange={(e) => set("registeredAddress")(e.target.value)} aria-invalid={Boolean(errors.registeredAddress)} aria-describedby={describe("registeredAddress")} />
            {err("registeredAddress")}
          </div>
          <div className={clsx(auth.field, styles.span2)}>
            <label htmlFor={`${id}-operating`} className={auth.label}>Operating Address</label>
            <textarea id={`${id}-operating`} className={clsx(auth.control, auth.textarea, errors.operatingAddress && auth.invalid)} rows={2} maxLength={210} value={values.operatingAddress} onChange={(e) => set("operatingAddress")(e.target.value)} aria-invalid={Boolean(errors.operatingAddress)} aria-describedby={describe("operatingAddress")} />
            {err("operatingAddress")}
          </div>
        </div>
        {errors.version && <p className={clsx(styles.banner, styles.bannerError)} role="alert">{errors.version}</p>}
        <div className={styles.actions}>
          <button type="submit" className={styles.primaryButton} disabled={busy || (exists && !dirty)}>
            <Save size={18} aria-hidden /> {busy ? "Saving..." : exists ? "Save Changes" : "Save Company"}
          </button>
          <button type="button" className={styles.secondaryButton} disabled={busy || !dirty} onClick={() => { setValues(saved); setErrors({}); setBanner(null); }}>
            Cancel
          </button>
        </div>
        {dirty && <p className={styles.dirty} role="status">You have unsaved changes.</p>}
      </form>
    </section>
  );
}
