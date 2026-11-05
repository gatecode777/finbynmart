"use client";

import { FormEvent, ReactNode, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { CheckCircle2, CircleAlert, Save, UserRound } from "lucide-react";
import { PHONE_COUNTRIES } from "@/lib/inquiries/rules";
import { validatePersonalUpdate } from "@/lib/buyer/profileRules";
import type { ProfileDto } from "@/lib/buyer/profile";
import auth from "@/components/auth/Auth.module.css";
import dash from "../Dashboard.module.css";
import { useDirty } from "./dirty";
import styles from "./Profile.module.css";

const initialOf = (p: ProfileDto) => ({ name: p.name, designation: p.designation ?? "", countryCode: p.alternatePhone?.countryCode ?? "+91", number: p.alternatePhone?.number ?? "", alternateEmail: p.alternateEmail ?? "" });

/**
 * Personal details. The primary email and mobile number are shown read-only with their verification state: changing them needs
 * a verification process that is not available yet (no SMS service, no email change flow), and that is said, not hidden.
 * A save is shown as done only after the server confirmed it; a stale form (saved elsewhere meanwhile) gets a clear conflict.
 */
export function PersonalForm({ profile }: { profile: ProfileDto }) {
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

  const set = (key: keyof typeof values) => (value: string) => setValues((current) => ({ ...current, [key]: value }));
  const payload = () => ({ name: values.name, designation: values.designation, alternatePhone: { countryCode: values.countryCode, number: values.number }, alternateEmail: values.alternateEmail, version });
  const err = (field: string): ReactNode => (errors[field] ? <span id={`${id}-${field}-e`} className={auth.error} role="alert">{errors[field]}</span> : null);
  const describe = (field: string) => (errors[field] ? `${id}-${field}-e` : undefined);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !dirty) return;
    setBanner(null);
    const check = validatePersonalUpdate(payload(), profile.email);
    if (!check.ok) return setErrors(check.fields);
    setErrors({});
    setBusy(true);
    const response = await fetch("/api/buyer/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    if (response?.ok && data.ok) {
      const next = initialOf(data.data.profile as ProfileDto);
      setSaved(next);
      setValues(next);
      setVersion((data.data.profile as ProfileDto).version);
      setBanner({ ok: true, text: "Your details were saved." });
      router.refresh();
      return;
    }
    setErrors(data.fields ?? {});
    setBanner({ ok: false, text: response ? (data.message ?? "Your details could not be saved.") : "Could not reach the server. Your changes are still here: try again." });
  }

  return (
    <section className={dash.card} aria-labelledby="personal-title">
      <h2 id="personal-title" className={dash.cardTitle}>
        <UserRound size={20} aria-hidden /> Personal Details
      </h2>
      <p className={dash.legendNote}>Update your basic personal information. Fields marked * are required.</p>
      {banner && (
        <p className={clsx(styles.banner, banner.ok ? styles.bannerOk : styles.bannerError)} role={banner.ok ? "status" : "alert"}>
          {banner.text}
        </p>
      )}
      <form onSubmit={submit} noValidate aria-label="Personal details">
        <div className={styles.formGrid}>
          <div className={auth.field}>
            <label htmlFor={`${id}-name`} className={auth.label}>Full Name <span aria-hidden>*</span></label>
            <input id={`${id}-name`} className={clsx(auth.control, errors.name && auth.invalid)} value={values.name} onChange={(e) => set("name")(e.target.value)} autoComplete="name" maxLength={120} aria-invalid={Boolean(errors.name)} aria-describedby={describe("name")} />
            {err("name")}
          </div>
          <div className={auth.field}>
            <label htmlFor={`${id}-designation`} className={auth.label}>Designation</label>
            <input id={`${id}-designation`} className={clsx(auth.control, errors.designation && auth.invalid)} value={values.designation} onChange={(e) => set("designation")(e.target.value)} autoComplete="organization-title" maxLength={110} aria-invalid={Boolean(errors.designation)} aria-describedby={describe("designation")} />
            {err("designation")}
          </div>
          <div className={auth.field}>
            <span className={auth.label}>Primary Mobile Number</span>
            <div className={styles.readOnlyValue}>
              {profile.primaryPhone.display ?? "None"} {profile.primaryPhone.display && (profile.phoneVerified ? <span className={dash.badgeOk}><CheckCircle2 size={14} aria-hidden /> Confirmed</span> : <span className={dash.badgeWarn}><CircleAlert size={14} aria-hidden /> Not confirmed</span>)}
            </div>
            <span className={auth.hint}>Changing your mobile number needs a verification code, which is not available yet.</span>
          </div>
          <div className={auth.field}>
            <span className={auth.label}>Primary Email Address</span>
            <div className={styles.readOnlyValue}>
              {profile.email} {profile.emailVerified ? <span className={dash.badgeOk}><CheckCircle2 size={14} aria-hidden /> Confirmed</span> : <span className={dash.badgeWarn}><CircleAlert size={14} aria-hidden /> Not confirmed</span>}
            </div>
            <span className={auth.hint}>Your sign-in email changes only through a verification process, which is not available yet.</span>
          </div>
          <div className={auth.field}>
            <label htmlFor={`${id}-alt-phone`} className={auth.label}>Alternate Mobile (optional)</label>
            <div className={clsx(auth.phone, errors.alternatePhone && auth.invalid)}>
              <select aria-label="Country code" className={auth.dial} value={values.countryCode} onChange={(e) => set("countryCode")(e.target.value)}>
                {PHONE_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
              <input id={`${id}-alt-phone`} className={auth.phoneInput} type="tel" inputMode="tel" autoComplete="tel-national" value={values.number} onChange={(e) => set("number")(e.target.value)} placeholder="Enter alternate number" aria-invalid={Boolean(errors.alternatePhone)} aria-describedby={describe("alternatePhone")} />
            </div>
            {err("alternatePhone")}
            <span className={auth.hint}>Saved as typed. It is not verified and is not used to sign in.</span>
          </div>
          <div className={auth.field}>
            <label htmlFor={`${id}-alt-email`} className={auth.label}>Alternate Email (optional)</label>
            <input id={`${id}-alt-email`} className={clsx(auth.control, errors.alternateEmail && auth.invalid)} type="email" inputMode="email" value={values.alternateEmail} onChange={(e) => set("alternateEmail")(e.target.value)} placeholder="Enter alternate email" aria-invalid={Boolean(errors.alternateEmail)} aria-describedby={describe("alternateEmail")} />
            {err("alternateEmail")}
            <span className={auth.hint}>Saved as typed. It is not verified and is not used to sign in.</span>
          </div>
        </div>
        {errors.version && <p className={clsx(styles.banner, styles.bannerError)} role="alert">{errors.version}</p>}
        <div className={styles.actions}>
          <button type="submit" className={styles.primaryButton} disabled={busy || !dirty}>
            <Save size={18} aria-hidden /> {busy ? "Saving..." : "Save Changes"}
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
