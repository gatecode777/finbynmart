"use client";

import { FormEvent, ReactNode, useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import { Save, X } from "lucide-react";
import { PHONE_COUNTRIES } from "@/lib/inquiries/rules";
import { ADDRESS_PURPOSES, validateAddress, type AddressPurpose } from "@/lib/buyer/addressRules";
import { COUNTRIES } from "@/lib/buyer/profileRules";
import type { AddressDto } from "@/lib/buyer/addresses";
import auth from "@/components/auth/Auth.module.css";
import { ConfirmDialog } from "@/components/ui/Modal";
import dash from "../Dashboard.module.css";
import profile from "../profile/Profile.module.css";
import styles from "./Addresses.module.css";

interface Props {
  /** The address being edited, or null to add a new one. */
  address: AddressDto | null;
  hasCompany: boolean;
  onClose: (saved: boolean) => void;
}

interface Values {
  label: string;
  purposes: AddressPurpose[];
  contactPerson: string;
  companyName: string;
  countryCode: string;
  number: string;
  addressLine1: string;
  addressLine2: string;
  landmark: string;
  country: string;
  state: string;
  city: string;
  postalCode: string;
  isDefaultBilling: boolean;
  isDefaultDelivery: boolean;
  forCompany: boolean;
}

const start = (a: AddressDto | null): Values => ({ label: a?.label ?? "", purposes: a?.purposes ?? [], contactPerson: a?.contactPerson ?? "", companyName: a?.companyName ?? "", countryCode: a?.phone?.countryCode ?? "+91", number: a?.phone?.number ?? "", addressLine1: a?.addressLine1 ?? "", addressLine2: a?.addressLine2 ?? "", landmark: a?.landmark ?? "", country: a?.country ?? "India", state: a?.state ?? "", city: a?.city ?? "", postalCode: a?.postalCode ?? "", isDefaultBilling: a?.isDefaultBilling ?? false, isDefaultDelivery: a?.isDefaultDelivery ?? false, forCompany: a?.forCompany ?? false });

/**
 * Create or edit one address, in an accessible dialog (focus moves in, Tab stays inside, Escape asks before discarding changes,
 * focus returns to the button that opened it). The same validation as the server runs first; a save is reported only after the
 * server confirmed it. A default is a separate choice for billing and for delivery and needs the matching purpose.
 */
export function AddressFormDialog({ address, hasCompany, onClose }: Props) {
  const id = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const initial = useRef(start(address));
  const [values, setValues] = useState<Values>(initial.current);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [discardAsk, setDiscardAsk] = useState(false);
  const [message, setMessage] = useState("");
  const dirty = JSON.stringify(values) !== JSON.stringify(initial.current);

  useEffect(() => {
    opener.current = document.activeElement;
    dialog.current?.querySelector<HTMLElement>("input, select, textarea")?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  function requestClose() {
    if (busy) return;
    if (dirty) return setDiscardAsk(true);
    onClose(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") return requestClose();
    if (event.key !== "Tab") return;
    const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>("input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])") ?? [])];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((current) => ({ ...current, [key]: value }));
  const togglePurpose = (purpose: AddressPurpose) =>
    setValues((current) => {
      const has = current.purposes.includes(purpose);
      const purposes = has ? current.purposes.filter((p) => p !== purpose) : [...current.purposes, purpose];
      // a default needs its purpose: removing the purpose clears the matching default choice here too
      return { ...current, purposes, isDefaultBilling: purposes.includes("BILLING") ? current.isDefaultBilling : false, isDefaultDelivery: purposes.includes("DELIVERY") ? current.isDefaultDelivery : false };
    });
  const err = (field: string): ReactNode => (errors[field] ? <span id={`${id}-${field}-e`} className={auth.error} role="alert">{errors[field]}</span> : null);
  const describe = (field: string) => (errors[field] ? `${id}-${field}-e` : undefined);
  const text = (field: keyof Values, label: string, opts: { required?: boolean; max?: number; auto?: string; hint?: string } = {}) => (
    <div className={auth.field}>
      <label htmlFor={`${id}-${field}`} className={auth.label}>{label} {opts.required && <span aria-hidden>*</span>}</label>
      <input id={`${id}-${field}`} className={clsx(auth.control, errors[field] && auth.invalid)} value={values[field] as string} onChange={(e) => set(field, e.target.value as never)} maxLength={opts.max} autoComplete={opts.auto} aria-invalid={Boolean(errors[field])} aria-describedby={describe(field)} />
      {opts.hint && <span className={auth.hint}>{opts.hint}</span>}
      {err(field)}
    </div>
  );

  const payload = () => ({
    label: values.label,
    purposes: values.purposes,
    contactPerson: values.contactPerson,
    companyName: values.companyName,
    phone: { countryCode: values.countryCode, number: values.number },
    addressLine1: values.addressLine1,
    addressLine2: values.addressLine2,
    landmark: values.landmark,
    country: values.country,
    state: values.state,
    city: values.city,
    postalCode: values.postalCode,
    isDefaultBilling: values.isDefaultBilling,
    isDefaultDelivery: values.isDefaultDelivery,
    forCompany: values.forCompany,
    ...(address ? { version: address.version } : {}),
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setMessage("");
    const check = validateAddress(payload(), address ? "update" : "create");
    if (!check.ok) {
      setErrors(check.fields);
      requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    setErrors({});
    setBusy(true);
    const response = await fetch(address ? `/api/buyer/addresses/${address.id}` : "/api/buyer/addresses", { method: address ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    if (response?.ok && data.ok) return onClose(true);
    setErrors(data.fields ?? {});
    setMessage(response ? (data.message ?? "The address could not be saved.") : "Could not reach the server. Your changes are still here: try again.");
  }

  const wantsContact = values.purposes.includes("DELIVERY") || values.purposes.includes("GOODS_RECEIVING");
  return (
    <>
    <div className={styles.backdrop} role="presentation" onMouseDown={(e) => e.target === e.currentTarget && requestClose()} onKeyDown={onKeyDown}>
      <div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <div className={styles.dialogHead}>
          <h2 id={`${id}-title`} className={dash.cardTitle}>{address ? "Edit Address" : "Add New Address"}</h2>
          <button type="button" className={styles.cardButton} onClick={requestClose} aria-label="Close dialog"><X size={16} aria-hidden /></button>
        </div>
        {message && <p className={clsx(profile.banner, profile.bannerError)} role="alert">{message}</p>}
        <form onSubmit={submit} noValidate aria-label={address ? "Edit address" : "Add a new address"}>
          <div className={profile.formGrid}>
            {text("label", "Address Label", { required: true, max: 65, hint: "For example Head Office or Warehouse." })}
            <fieldset className={clsx(styles.purposes, profile.span2)} aria-describedby={describe("purposes")}>
              <legend>Address Purposes <span aria-hidden>*</span></legend>
              {ADDRESS_PURPOSES.map((p) => (
                <label key={p.value} className={styles.check}>
                  <input type="checkbox" checked={values.purposes.includes(p.value)} onChange={() => togglePurpose(p.value)} />
                  {p.label}
                </label>
              ))}
            </fieldset>
            {errors.purposes && <div className={profile.span2}>{err("purposes")}</div>}
            {text("contactPerson", wantsContact ? "Contact Person *" : "Contact Person", { max: 105, auto: "name" })}
            {text("companyName", "Company Name", { max: 155, auto: "organization" })}
            <div className={auth.field}>
              <label htmlFor={`${id}-phone`} className={auth.label}>{wantsContact ? "Contact Phone *" : "Contact Phone"}</label>
              <div className={clsx(auth.phone, errors.phone && auth.invalid)}>
                <select aria-label="Country code" className={auth.dial} value={values.countryCode} onChange={(e) => set("countryCode", e.target.value)}>
                  {PHONE_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                </select>
                <input id={`${id}-phone`} className={auth.phoneInput} type="tel" inputMode="tel" autoComplete="tel-national" value={values.number} onChange={(e) => set("number", e.target.value)} aria-invalid={Boolean(errors.phone)} aria-describedby={describe("phone")} />
              </div>
              {err("phone")}
            </div>
            <div className={profile.span2}>{text("addressLine1", "Address Line 1", { required: true, max: 155, auto: "address-line1" })}</div>
            <div className={profile.span2}>{text("addressLine2", "Address Line 2", { max: 155, auto: "address-line2" })}</div>
            {text("landmark", "Landmark", { max: 105 })}
            <div className={auth.field}>
              <label htmlFor={`${id}-country`} className={auth.label}>Country <span aria-hidden>*</span></label>
              <select id={`${id}-country`} className={clsx(auth.control, errors.country && auth.invalid)} value={values.country} onChange={(e) => set("country", e.target.value)} aria-invalid={Boolean(errors.country)} aria-describedby={describe("country")}>
                {COUNTRIES.map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}
              </select>
              {err("country")}
            </div>
            {text("state", "State / Province", { required: true, max: 65, auto: "address-level1" })}
            {text("city", "City", { required: true, max: 85, auto: "address-level2" })}
            {text("postalCode", values.country === "India" ? "PIN Code" : "Postal Code", { required: true, max: 12, auto: "postal-code", hint: values.country === "India" ? "Six digits, not starting with 0." : undefined })}
            <div className={clsx(auth.field, profile.span2)}>
              <label className={clsx(styles.check, !values.purposes.includes("BILLING") && styles.checkDisabled)}>
                <input type="checkbox" checked={values.isDefaultBilling} disabled={!values.purposes.includes("BILLING")} onChange={(e) => set("isDefaultBilling", e.target.checked)} />
                Set as Default Billing Address
              </label>
              <label className={clsx(styles.check, !values.purposes.includes("DELIVERY") && styles.checkDisabled)}>
                <input type="checkbox" checked={values.isDefaultDelivery} disabled={!values.purposes.includes("DELIVERY")} onChange={(e) => set("isDefaultDelivery", e.target.checked)} />
                Set as Default Delivery Address
              </label>
              {err("isDefaultBilling")}
              {err("isDefaultDelivery")}
              <span className={auth.hint}>The two defaults are separate. A default needs the matching purpose (Billing or Delivery); setting a new one replaces the old one.</span>
              {hasCompany && (
                <label className={styles.check}>
                  <input type="checkbox" checked={values.forCompany} onChange={(e) => set("forCompany", e.target.checked)} />
                  This is an address of my company
                </label>
              )}
            </div>
          </div>
          <div className={profile.actions}>
            <button type="submit" className={profile.primaryButton} disabled={busy}>
              <Save size={18} aria-hidden /> {busy ? "Saving..." : address ? "Save Changes" : "Save Address"}
            </button>
            <button type="button" className={profile.secondaryButton} onClick={requestClose} disabled={busy}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
    {discardAsk && <ConfirmDialog title="Discard your changes?" message="You have unsaved changes to this address. If you close now they will be lost." confirmLabel="Discard changes" cancelLabel="Keep editing" tone="danger" onConfirm={() => { setDiscardAsk(false); onClose(false); }} onCancel={() => setDiscardAsk(false)} />}
    </>
  );
}
