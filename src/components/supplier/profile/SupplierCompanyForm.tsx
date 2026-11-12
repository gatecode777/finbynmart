"use client";

import { FormEvent, ReactNode, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Building2, Globe, MapPin, Save } from "lucide-react";
import type { SupplierCompanyProfileDto } from "@/lib/supplier/profileService";
import { SUPPLIER_BUSINESS_TYPES, validateSupplierCompany } from "@/lib/supplier/profileRules";
import auth from "@/components/auth/Auth.module.css";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import { useDirty } from "@/components/buyer/profile/dirty";
import styles from "./SupplierProfile.module.css";

const initialOf = (c: SupplierCompanyProfileDto) => ({
  businessName: c.businessName ?? "",
  displayName: c.displayName ?? "",
  businessType: c.businessType ?? "Manufacturer",
  industry: c.industry ?? "",
  description: c.description ?? "",
  website: c.website ?? "",
  yearEstablished: c.yearEstablished ? String(c.yearEstablished) : "",
  country: c.country ?? "India",
  state: c.state ?? "",
  city: c.city ?? "",
  postalCode: c.postalCode ?? "",
  registeredAddress: c.registeredAddress ?? "",
  operatingAddress: c.operatingAddress ?? "",
});

export function SupplierCompanyForm({ company }: { company: SupplierCompanyProfileDto }) {
  const router = useRouter();
  const id = useId();
  const { setDirty } = useDirty();
  const [saved, setSaved] = useState(initialOf(company));
  const [values, setValues] = useState(saved);
  const [version, setVersion] = useState(company.version);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  useEffect(() => setDirty(dirty), [dirty, setDirty]);
  useEffect(() => () => setDirty(false), [setDirty]);

  const set = (key: keyof typeof values) => (value: string) => setValues((c) => ({ ...c, [key]: value }));

  const payload = () => ({
    businessName: values.businessName,
    displayName: values.displayName || null,
    businessType: values.businessType,
    industry: values.industry || null,
    description: values.description || null,
    website: values.website || null,
    yearEstablished: values.yearEstablished ? Number(values.yearEstablished) : null,
    country: values.country,
    state: values.state || null,
    city: values.city || null,
    postalCode: values.postalCode || null,
    registeredAddress: values.registeredAddress || null,
    operatingAddress: values.operatingAddress || null,
    version,
  });

  const err = (field: string): ReactNode =>
    errors[field] ? (
      <span id={`${id}-${field}-e`} className={auth.error} role="alert">
        {errors[field]}
      </span>
    ) : null;

  const describe = (field: string) => (errors[field] ? `${id}-${field}-e` : undefined);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !dirty) return;
    setBanner(null);

    const check = validateSupplierCompany(payload());
    if (!check.ok) return setErrors(check.fields);
    setErrors({});
    setBusy(true);

    const res = await fetch("/api/supplier/company", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload()),
    }).catch(() => null);

    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);

    if (res?.ok && data.ok) {
      const next = initialOf(data.data as SupplierCompanyProfileDto);
      setSaved(next);
      setValues(next);
      setVersion((data.data as SupplierCompanyProfileDto).version);
      setBanner({ ok: true, text: "Company details updated successfully." });
      router.refresh();
      return;
    }

    setErrors(data.fields ?? {});
    setBanner({
      ok: false,
      text: res ? data.message ?? "Could not update company details." : "Server unreachable. Try again.",
    });
  }

  return (
    <section className={dash.card} aria-labelledby="company-title">
      <h2 id="company-title" className={dash.cardTitle}>
        <Building2 size={20} aria-hidden /> Company &amp; Business Profile
      </h2>
      <p className={dash.legendNote}>
        Provide accurate business information. This is displayed to verified buyers across Finbyn Mart.
      </p>

      {banner && (
        <p className={clsx(styles.banner, banner.ok ? styles.bannerOk : styles.bannerError)} role={banner.ok ? "status" : "alert"}>
          {banner.text}
        </p>
      )}

      <form onSubmit={submit} noValidate aria-label="Company details form">
        <div className={styles.formGrid}>
          <div className={auth.field}>
            <label htmlFor={`${id}-bizname`} className={auth.label}>
              Legal / Registered Business Name <span aria-hidden>*</span>
            </label>
            <input
              id={`${id}-bizname`}
              className={clsx(auth.control, errors.businessName && auth.invalid)}
              value={values.businessName}
              onChange={(e) => set("businessName")(e.target.value)}
              maxLength={150}
              aria-invalid={Boolean(errors.businessName)}
              aria-describedby={describe("businessName")}
            />
            {err("businessName")}
          </div>

          <div className={auth.field}>
            <label htmlFor={`${id}-dispname`} className={auth.label}>
              Trading / Display Name
            </label>
            <input
              id={`${id}-dispname`}
              className={clsx(auth.control, errors.displayName && auth.invalid)}
              value={values.displayName}
              onChange={(e) => set("displayName")(e.target.value)}
              placeholder="Brand name if different from legal name"
              maxLength={150}
              aria-invalid={Boolean(errors.displayName)}
              aria-describedby={describe("displayName")}
            />
            {err("displayName")}
          </div>

          <div className={auth.field}>
            <label htmlFor={`${id}-biztype`} className={auth.label}>
              Business Type <span aria-hidden>*</span>
            </label>
            <select
              id={`${id}-biztype`}
              className={clsx(auth.control, errors.businessType && auth.invalid)}
              value={values.businessType}
              onChange={(e) => set("businessType")(e.target.value)}
            >
              {SUPPLIER_BUSINESS_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            {err("businessType")}
          </div>

          <div className={auth.field}>
            <label htmlFor={`${id}-industry`} className={auth.label}>
              Industry / Sector
            </label>
            <input
              id={`${id}-industry`}
              className={clsx(auth.control, errors.industry && auth.invalid)}
              value={values.industry}
              onChange={(e) => set("industry")(e.target.value)}
              placeholder="e.g. Industrial Supplies, Apparel & Textiles"
              maxLength={100}
              aria-invalid={Boolean(errors.industry)}
              aria-describedby={describe("industry")}
            />
            {err("industry")}
          </div>

          <div className={clsx(auth.field, styles.span2)}>
            <label htmlFor={`${id}-desc`} className={auth.label}>
              Company Overview &amp; Primary Offerings
            </label>
            <textarea
              id={`${id}-desc`}
              className={clsx(auth.control, errors.description && auth.invalid)}
              rows={4}
              value={values.description}
              onChange={(e) => set("description")(e.target.value)}
              placeholder="Describe your manufacturing capabilities, key products, certifications and quality standards..."
              maxLength={2000}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={describe("description")}
            />
            {err("description")}
          </div>

          <div className={auth.field}>
            <label htmlFor={`${id}-website`} className={auth.label}>
              <Globe size={14} aria-hidden /> Company Website
            </label>
            <input
              id={`${id}-website`}
              type="url"
              className={clsx(auth.control, errors.website && auth.invalid)}
              value={values.website}
              onChange={(e) => set("website")(e.target.value)}
              placeholder="https://www.yourcompany.com"
              maxLength={200}
              aria-invalid={Boolean(errors.website)}
              aria-describedby={describe("website")}
            />
            {err("website")}
          </div>

          <div className={auth.field}>
            <label htmlFor={`${id}-year`} className={auth.label}>
              Year Established
            </label>
            <input
              id={`${id}-year`}
              type="number"
              className={clsx(auth.control, errors.yearEstablished && auth.invalid)}
              value={values.yearEstablished}
              onChange={(e) => set("yearEstablished")(e.target.value)}
              placeholder="e.g. 2012"
              min={1800}
              max={new Date().getFullYear()}
              aria-invalid={Boolean(errors.yearEstablished)}
              aria-describedby={describe("yearEstablished")}
            />
            {err("yearEstablished")}
          </div>

          <div className={auth.field}>
            <label htmlFor={`${id}-city`} className={auth.label}>
              <MapPin size={14} aria-hidden /> City <span aria-hidden>*</span>
            </label>
            <input
              id={`${id}-city`}
              className={clsx(auth.control, errors.city && auth.invalid)}
              value={values.city}
              onChange={(e) => set("city")(e.target.value)}
              placeholder="e.g. Ahmedabad, Surat, Mumbai"
              maxLength={80}
              aria-invalid={Boolean(errors.city)}
              aria-describedby={describe("city")}
            />
            {err("city")}
          </div>

          <div className={auth.field}>
            <label htmlFor={`${id}-state`} className={auth.label}>
              State / Province
            </label>
            <input
              id={`${id}-state`}
              className={clsx(auth.control, errors.state && auth.invalid)}
              value={values.state}
              onChange={(e) => set("state")(e.target.value)}
              placeholder="e.g. Gujarat, Maharashtra"
              maxLength={80}
              aria-invalid={Boolean(errors.state)}
              aria-describedby={describe("state")}
            />
            {err("state")}
          </div>

          <div className={auth.field}>
            <label htmlFor={`${id}-pin`} className={auth.label}>
              PIN / Postal Code
            </label>
            <input
              id={`${id}-pin`}
              className={clsx(auth.control, errors.postalCode && auth.invalid)}
              value={values.postalCode}
              onChange={(e) => set("postalCode")(e.target.value)}
              placeholder="6-digit PIN code"
              maxLength={10}
              aria-invalid={Boolean(errors.postalCode)}
              aria-describedby={describe("postalCode")}
            />
            {err("postalCode")}
          </div>

          <div className={auth.field}>
            <label htmlFor={`${id}-country`} className={auth.label}>
              Country
            </label>
            <input
              id={`${id}-country`}
              className={auth.control}
              value={values.country}
              onChange={(e) => set("country")(e.target.value)}
              maxLength={60}
            />
          </div>

          <div className={clsx(auth.field, styles.span2)}>
            <label htmlFor={`${id}-regaddr`} className={auth.label}>
              Registered Office Address
            </label>
            <textarea
              id={`${id}-regaddr`}
              className={clsx(auth.control, errors.registeredAddress && auth.invalid)}
              rows={2}
              value={values.registeredAddress}
              onChange={(e) => set("registeredAddress")(e.target.value)}
              placeholder="Complete building, street, and area address"
              maxLength={500}
            />
          </div>
        </div>

        <div className={styles.actions}>
          <button type="submit" className={styles.btnGold} disabled={busy || !dirty}>
            <Save size={16} aria-hidden /> {busy ? "Updating..." : "Save Company Details"}
          </button>
        </div>
      </form>
    </section>
  );
}
