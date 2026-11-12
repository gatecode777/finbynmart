"use client";

import { FormEvent, ReactNode, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { CheckCircle2, CircleAlert, Save, UserRound } from "lucide-react";
import type { SupplierPersonalProfileDto } from "@/lib/supplier/profileService";
import { validateSupplierPersonalUpdate } from "@/lib/supplier/profileRules";
import auth from "@/components/auth/Auth.module.css";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import { useDirty } from "@/components/buyer/profile/dirty";
import styles from "./SupplierProfile.module.css";

const initialOf = (p: SupplierPersonalProfileDto) => ({
  name: p.name,
  designation: p.designation ?? "",
  countryCode: p.alternatePhone?.countryCode ?? "+91",
  number: p.alternatePhone?.number ?? "",
  alternateEmail: p.alternateEmail ?? "",
});

export function SupplierPersonalForm({ profile }: { profile: SupplierPersonalProfileDto }) {
  const router = useRouter();
  const id = useId();
  const { setDirty } = useDirty();
  const [saved, setSaved] = useState(initialOf(profile));
  const [values, setValues] = useState(saved);
  const [version, setVersion] = useState(profile.version);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  useEffect(() => setDirty(dirty), [dirty, setDirty]);
  useEffect(() => () => setDirty(false), [setDirty]);

  const set = (key: keyof typeof values) => (value: string) => setValues((c) => ({ ...c, [key]: value }));
  const payload = () => ({
    name: values.name,
    designation: values.designation,
    alternatePhone: { countryCode: values.countryCode, number: values.number },
    alternateEmail: values.alternateEmail,
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

    const check = validateSupplierPersonalUpdate(payload(), profile.email);
    if (!check.ok) return setErrors(check.fields);
    setErrors({});
    setBusy(true);

    const res = await fetch("/api/supplier/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload()),
    }).catch(() => null);

    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);

    if (res?.ok && data.ok) {
      const next = initialOf(data.data as SupplierPersonalProfileDto);
      setSaved(next);
      setValues(next);
      setVersion((data.data as SupplierPersonalProfileDto).version);
      setBanner({ ok: true, text: "Contact details saved successfully." });
      router.refresh();
      return;
    }

    setErrors(data.fields ?? {});
    setBanner({
      ok: false,
      text: res ? data.message ?? "Failed to save details." : "Network connection error. Please try again.",
    });
  }

  return (
    <section className={dash.card} aria-labelledby="contact-title">
      <h2 id="contact-title" className={dash.cardTitle}>
        <UserRound size={20} aria-hidden /> Contact Person Details
      </h2>
      <p className={dash.legendNote}>Update the primary representative details for this supplier account.</p>

      {banner && (
        <p className={clsx(styles.banner, banner.ok ? styles.bannerOk : styles.bannerError)} role={banner.ok ? "status" : "alert"}>
          {banner.text}
        </p>
      )}

      <form onSubmit={submit} noValidate aria-label="Contact person details">
        <div className={styles.formGrid}>
          <div className={auth.field}>
            <label htmlFor={`${id}-name`} className={auth.label}>
              Full Name <span aria-hidden>*</span>
            </label>
            <input
              id={`${id}-name`}
              className={clsx(auth.control, errors.name && auth.invalid)}
              value={values.name}
              onChange={(e) => set("name")(e.target.value)}
              autoComplete="name"
              maxLength={120}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={describe("name")}
            />
            {err("name")}
          </div>

          <div className={auth.field}>
            <label htmlFor={`${id}-designation`} className={auth.label}>
              Designation / Role
            </label>
            <input
              id={`${id}-designation`}
              className={clsx(auth.control, errors.designation && auth.invalid)}
              value={values.designation}
              onChange={(e) => set("designation")(e.target.value)}
              placeholder="e.g. Director, Sales Manager"
              maxLength={100}
              aria-invalid={Boolean(errors.designation)}
              aria-describedby={describe("designation")}
            />
            {err("designation")}
          </div>

          <div className={auth.field}>
            <span className={auth.label}>Primary Mobile Number</span>
            <div className={styles.readOnlyValue}>
              {profile.phone ?? "None registered"}
              {profile.phone && (
                profile.phoneVerified ? (
                  <span className={dash.badgeOk}><CheckCircle2 size={13} aria-hidden /> Confirmed</span>
                ) : (
                  <span className={dash.badgeWarn}><CircleAlert size={13} aria-hidden /> Not confirmed</span>
                )
              )}
            </div>
            <span className={auth.hint}>Primary phone change requires OTP verification (in development).</span>
          </div>

          <div className={auth.field}>
            <span className={auth.label}>Primary Email Address</span>
            <div className={styles.readOnlyValue}>
              {profile.email}
              {profile.emailVerified ? (
                <span className={dash.badgeOk}><CheckCircle2 size={13} aria-hidden /> Confirmed</span>
              ) : (
                <span className={dash.badgeWarn}><CircleAlert size={13} aria-hidden /> Not confirmed</span>
              )}
            </div>
            <span className={auth.hint}>Primary email is tied to account credentials.</span>
          </div>

          <div className={auth.field}>
            <label htmlFor={`${id}-alt-phone`} className={auth.label}>
              Alternate Phone Number
            </label>
            <input
              id={`${id}-alt-phone`}
              className={clsx(auth.control, errors.alternatePhone && auth.invalid)}
              value={values.number}
              onChange={(e) => set("number")(e.target.value)}
              placeholder="e.g. 9876543210"
              maxLength={15}
              aria-invalid={Boolean(errors.alternatePhone)}
              aria-describedby={describe("alternatePhone")}
            />
            {err("alternatePhone")}
          </div>

          <div className={auth.field}>
            <label htmlFor={`${id}-alt-email`} className={auth.label}>
              Alternate Email Address
            </label>
            <input
              id={`${id}-alt-email`}
              type="email"
              className={clsx(auth.control, errors.alternateEmail && auth.invalid)}
              value={values.alternateEmail}
              onChange={(e) => set("alternateEmail")(e.target.value)}
              placeholder="alternate@example.com"
              maxLength={120}
              aria-invalid={Boolean(errors.alternateEmail)}
              aria-describedby={describe("alternateEmail")}
            />
            {err("alternateEmail")}
          </div>
        </div>

        <div className={styles.actions}>
          <button type="submit" className={styles.btnPrimary} disabled={busy || !dirty}>
            <Save size={16} aria-hidden /> {busy ? "Saving..." : "Save Details"}
          </button>
        </div>
      </form>
    </section>
  );
}
