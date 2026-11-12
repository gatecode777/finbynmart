"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { AlertTriangle, Building2, ChevronDown, ChevronUp, Eye, FileText, MapPin, Plus, Trash2, Upload } from "lucide-react";
import { formatDecimal, parseMoney } from "@/lib/quotations/decimal";
import { LINE_SOURCES, LINE_SOURCE_LABEL, MAX_VALIDITY_DAYS, computeQuote, emptyLine, istDateText, type LineSource, type QuoteInput, type QuoteLine } from "@/lib/quotations/quoteRules";
import type { Capabilities, InquiryView, PreviewView, ProductChoice, quoteOptions } from "@/lib/supplier/quoteService";
import dash from "../../dashboard/SupplierDashboard.module.css";
import quotes from "../SupplierQuotations.module.css";
import styles from "./QuoteBuilder.module.css";
import { ProductSearch } from "./ProductSearch";
import { ReviewDialog } from "./ReviewDialog";
import { fieldId, showMoney } from "./format";
import { newIdempotencyKey } from "../../idempotencyKey";

export interface BuilderProps {
  inquiry: InquiryView;
  options: ReturnType<typeof quoteOptions>;
  supplier: { name: string; city: string | null };
  capabilities: Capabilities;
  eligible: boolean;
  ineligibleReason: string | null;
  initialInput: QuoteInput;
  draft: { reference: string; revision: number; savedLabel: string | null; version?: number; revisionOf?: number | null; revisionReason?: string | null } | null;
}

type Banner = { tone: "ok" | "error"; text: string; retry?: boolean } | null;
const DAY = 86_400_000;
const json = { "Content-Type": "application/json" };
const newKey = newIdempotencyKey;

/** A labelled field with its hint and its linked error message. Defined at module level on purpose: a component created inside another one is a new type on every render, which would remount the input and drop keyboard focus while typing. */
function Field({ k, label, hint, error, children }: { k: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={fieldId(k)}>{label}</label>
      {children}
      {hint && <p className={styles.hint}>{hint}</p>}
      {error && <p id={`${fieldId(k)}-err`} className={styles.error}>{error}</p>}
    </div>
  );
}

/**
 * The create / edit quotation form. The numbers on screen are previews from the SAME calculation the server uses (quoteRules.computeQuote); what is stored
 * and what the buyer sees is always the server's own recalculation. Nothing is held in browser storage: a draft exists only once the server saved it.
 * A save names the revision it started from; a stale one is refused by the server and the supplier chooses what to do (nothing is overwritten silently).
 */
export function QuoteBuilder(props: BuilderProps) {
  const { inquiry, options, capabilities } = props;
  const router = useRouter();
  const [input, setInput] = useState<QuoteInput>(props.initialInput);
  const [reference, setReference] = useState<string | null>(props.draft?.reference ?? null);
  const [revision, setRevision] = useState(props.draft?.revision ?? 0);
  const [savedLabel, setSavedLabel] = useState<string | null>(props.draft?.savedLabel ?? null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<Banner>(null);
  const [conflict, setConflict] = useState(false);
  const [dialog, setDialog] = useState<{ mode: "preview" | "review"; preview: PreviewView } | null>(null);
  const [busy, setBusy] = useState<"preview" | "review" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [changedNotice, setChangedNotice] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const idemKey = useRef("");
  const reviewButton = useRef<HTMLButtonElement>(null);
  const previewButton = useRef<HTMLButtonElement>(null);

  const rule = useMemo(() => options.taxRules.find((r) => r.id === input.taxRuleId) ?? null, [options.taxRules, input.taxRuleId]);
  const calc = useMemo(() => computeQuote(input, rule), [input, rule]);
  const line = input.lines[0] ?? emptyLine();
  const today = useMemo(() => istDateText(Date.now()), []);
  const maxDate = useMemo(() => istDateText(Date.now() + MAX_VALIDITY_DAYS * DAY), []);
  const currency = input.currency || "INR";
  const canEdit = props.eligible || Boolean(props.draft);

  // ---------- unsaved changes ----------
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const errorKeys = Object.keys(errors);
  useEffect(() => {
    if (errorKeys.length > 0) summaryRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- move focus to the summary only when a new set of errors arrives
  }, [errors]);

  const touch = () => {
    setDirty(true);
    setBanner(null);
  };
  const setField = <K extends keyof QuoteInput>(key: K, value: QuoteInput[K], errorKey?: string) => {
    setInput((cur) => ({ ...cur, [key]: value }));
    if (errorKey || errors[key as string]) setErrors((e) => { const { [errorKey ?? (key as string)]: _removed, ...rest } = e; void _removed; return rest; });
    touch();
  };
  const setLine = (patch: Partial<QuoteLine>, errorKeys2: string[] = []) => {
    setInput((cur) => ({ ...cur, lines: [{ ...(cur.lines[0] ?? emptyLine()), ...patch }] }));
    if (errorKeys2.length) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !errorKeys2.includes(k))));
    touch();
  };
  const chooseSource = (source: LineSource) => {
    if (source === "INQUIRY") setLine({ source, productKey: "", name: inquiry.productName ?? "", unit: inquiry.unit ?? line.unit, moq: "" }, ["lines.0.name", "lines.0.productKey"]);
    else if (source === "CATALOGUE") setLine({ source, productKey: "", name: "", moq: "" }, ["lines.0.name", "lines.0.productKey"]);
    else setLine({ source, productKey: "" }, ["lines.0.productKey"]);
  };
  const pickProduct = (p: ProductChoice) => setLine({ source: "CATALOGUE", productKey: p.key, name: p.name, unit: inquiry.unit ?? p.unit, moq: p.moq ? String(p.moq.quantity) : "" }, ["lines.0.name", "lines.0.productKey", "lines.0.unit"]);

  // ---------- server calls ----------
  const detailHref = (ref: string) => `/supplier/quotations/${ref}`;

  async function save(): Promise<{ reference: string; revision: number } | null> {
    setSaving(true);
    setBanner(null);
    try {
      let ref = reference;
      let rev = revision;
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(ref ? `/api/supplier/quotations/${ref}` : "/api/supplier/quotations", { method: ref ? "PATCH" : "POST", headers: json, body: JSON.stringify(ref ? { expectedRevision: rev, input } : { inquiryReference: inquiry.reference, input }) });
        const body = await res.json().catch(() => null);
        if (res.ok && body?.ok) {
          const d = body.data;
          setReference(d.reference);
          setRevision(d.revision);
          setSavedLabel(d.savedLabel);
          if (!ref) window.history.replaceState(window.history.state, "", `/supplier/quotations/create?reference=${d.reference}`);
          if (d.created === false) {
            // a draft for this inquiry already existed (another tab or person): apply this form to it as an edit
            ref = d.reference;
            rev = d.revision;
            continue;
          }
          setDirty(false);
          setErrors({});
          setBanner({ tone: "ok", text: "Draft saved." });
          return { reference: d.reference, revision: d.revision };
        }
        if (res.status === 422 && body?.fields) {
          setErrors(body.fields);
          setBanner({ tone: "error", text: "The draft was not saved. Check the highlighted fields." });
          return null;
        }
        if (res.status === 409 && body?.code === "STALE_REVISION") {
          setConflict(true);
          return null;
        }
        if (res.status === 409 && (body?.code === "NOT_A_DRAFT" || body?.code === "ALREADY_QUOTED")) {
          router.push(detailHref(body?.data?.reference ?? ref ?? ""));
          return null;
        }
        setBanner({ tone: "error", text: body?.message ?? "The draft was not saved. Check your connection.", retry: true });
        return null;
      }
      return null;
    } catch {
      setBanner({ tone: "error", text: "We could not reach the server, so the draft was not saved. Your changes are still on this page.", retry: true });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function reloadLatest() {
    if (!reference) return;
    const res = await fetch(`/api/supplier/quotations/${reference}/draft`, { cache: "no-store" }).catch(() => null);
    const body = res ? await res.json().catch(() => null) : null;
    if (res?.ok && body?.ok) {
      setInput(body.data.input);
      setRevision(body.data.revision);
      setSavedLabel(body.data.savedLabel);
      setConflict(false);
      setDirty(false);
      setErrors({});
      setBanner({ tone: "ok", text: "Loaded the latest saved version. Your unsaved changes were replaced." });
    } else setBanner({ tone: "error", text: "We could not load the latest version. Try again.", retry: false });
  }

  async function openDialog(mode: "preview" | "review") {
    setBusy(mode);
    try {
      const saved = dirty || !reference ? await save() : { reference: reference!, revision };
      if (!saved) return;
      const res = await fetch(`/api/supplier/quotations/${saved.reference}/preview`, { method: "POST", headers: json, body: JSON.stringify({ input, expectedRevision: saved.revision }) });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        if (res.status === 422 && body?.fields) setErrors(body.fields);
        setBanner({ tone: "error", text: body?.message ?? "We could not prepare the preview." });
        return;
      }
      const preview = body.data as PreviewView;
      if (mode === "review" && !preview.canSubmit) {
        // what blocks submission is shown against the fields, so it can be fixed
        setErrors(preview.blocking);
        setBanner({ tone: "error", text: "This quotation cannot be submitted yet. Fix the items listed above." });
        return;
      }
      idemKey.current = newKey();
      setChangedNotice(null);
      setSubmitError(null);
      setErrors({});
      setDialog({ mode, preview });
    } catch {
      setBanner({ tone: "error", text: "We could not reach the server. Nothing was submitted." });
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    if (!dialog || !reference || !dialog.preview.calculation.total || !dialog.preview.taxRule) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/supplier/quotations/${reference}/submit`, {
        method: "POST",
        headers: json,
        body: JSON.stringify({ confirm: true, expectedRevision: dialog.preview.revision, expectedTotal: dialog.preview.calculation.total, expectedTaxRuleVersion: dialog.preview.taxRule.version, idempotencyKey: idemKey.current }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        setDirty(false);
        router.push(`${body.data.href}?submitted=1`);
        return;
      }
      const code = body?.code as string | undefined;
      if (res.status === 409 && (code === "TOTAL_CHANGED" || code === "TAX_POLICY_CHANGED") && body?.data?.calculation) {
        // never submit a different amount silently: show the new calculation and ask again (a new key, because the reviewed content changed)
        idemKey.current = newKey();
        setChangedNotice(body.message);
        setDialog((d) => (d ? { ...d, preview: { ...d.preview, calculation: body.data.calculation, taxRule: body.data.taxRule ?? d.preview.taxRule } } : d));
        return;
      }
      if (res.status === 409 && code === "NOT_A_DRAFT") {
        router.push(detailHref(reference));
        return;
      }
      if (res.status === 409 && code === "STALE_REVISION") {
        setDialog(null);
        setConflict(true);
        return;
      }
      if (res.status === 422) {
        setDialog(null);
        setErrors(body?.fields ?? {});
        setBanner({ tone: "error", text: body?.message ?? "The quotation cannot be submitted yet." });
        return;
      }
      setSubmitError(body?.message ?? "The quotation was not submitted.");
    } catch {
      // the answer was lost: the same key is kept, so retrying cannot send a second quotation
      setSubmitError("We could not confirm the result (the connection was lost). Press Submit again: retrying is safe and cannot create a second quotation.");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- small render helpers ----------
  const err = (key: string) => (errors[key] ? <p id={`${fieldId(key)}-err`} className={styles.error}>{errors[key]}</p> : null);
  const ip = (key: string) => ({ id: fieldId(key), "aria-invalid": errors[key] ? (true as const) : undefined, "aria-describedby": errors[key] ? `${fieldId(key)}-err` : undefined });
  const ic = (key: string) => clsx(styles.input, errors[key] && styles.invalid);
  const sc = (key: string) => clsx(styles.select, errors[key] && styles.invalid);

  const leaveHref = "/supplier/quotations";
  const leave = (e: React.MouseEvent) => {
    if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) e.preventDefault();
  };
  const noRules = options.taxRules.length === 0;
  const lineAmount = calc.taxable ?? null;

  return (
    <>
      <div className={dash.header}>
        <div>
          <h1 className={dash.title}>Create Quotation</h1>
          <p className={dash.welcome}>Prepare your offer for the buyer</p>
        </div>
        <span className={styles.draftBadge}>Draft</span>
      </div>

      <section className={styles.context} aria-label="Inquiry being quoted">
        <div className={styles.contextItem}><FileText size={22} aria-hidden /><div><span className={styles.contextLabel}>Inquiry {inquiry.statusLabel ? `· ${inquiry.statusLabel}` : ""}</span><span className={styles.contextValue}><Link href={`/supplier/inquiries/${inquiry.reference}`} className={styles.errorLink} style={{ color: "inherit" }}>{inquiry.reference}</Link></span><span className={styles.contextLabel}>{inquiry.productName ?? "General inquiry"}{inquiry.category ? ` · ${inquiry.category}` : ""}</span></div></div>
        <div className={styles.contextItem}><Building2 size={22} aria-hidden /><div><span className={styles.contextLabel}>Buyer</span><span className={styles.contextValue}>{inquiry.buyer}</span></div></div>
        <div className={styles.contextItem}><MapPin size={22} aria-hidden /><div><span className={styles.contextLabel}>Requested</span><span className={styles.contextValue}>{inquiry.quantity.toLocaleString("en-IN")}{inquiry.unit ? ` ${inquiry.unit}` : ""}</span><span className={styles.contextLabel}>{inquiry.deliveryLocation ?? "Delivery location not stated"}</span></div></div>
      </section>
      <p className={styles.hint}>This is the buyer&apos;s original requirement as recorded. You cannot change it; if you offer something different, mark the item as a manual item / substitution. Target price, required-by date and buyer attachments are not captured on inquiries.</p>

      {props.draft?.revisionOf ? (
        <p className={clsx(styles.banner, styles.bannerInfo)} role="note">
          You are editing a revision: version {props.draft.version}, copied from version {props.draft.revisionOf}{props.draft.revisionReason ? ` (reason: ${props.draft.revisionReason})` : ""}. The buyer still sees version {props.draft.revisionOf} until you submit this one; then version {props.draft.revisionOf} becomes a previous version and is never changed. Check the price, tax treatment and validity before submitting.
        </p>
      ) : null}

      {!props.eligible && (
        <p className={clsx(styles.banner, styles.bannerError)} role="alert"><AlertTriangle size={18} aria-hidden /> {props.ineligibleReason} {props.draft ? "You can keep this draft but it cannot be submitted." : ""}</p>
      )}

      {errorKeys.length > 0 && (
        <div ref={summaryRef} tabIndex={-1} className={styles.errorSummary} role="alert" aria-labelledby="err-title">
          <h2 id="err-title">Please fix {errorKeys.length === 1 ? "this item" : `these ${errorKeys.length} items`}</h2>
          <ul>
            {errorKeys.map((k) => (
              <li key={k}>{document.getElementById(fieldId(k)) ? <a className={styles.errorLink} href={`#${fieldId(k)}`} onClick={(e) => { e.preventDefault(); document.getElementById(fieldId(k))?.focus(); }}>{errors[k]}</a> : errors[k]}</li>
            ))}
          </ul>
        </div>
      )}

      {banner && (
        <p className={clsx(styles.banner, banner.tone === "error" && styles.bannerError)} role={banner.tone === "error" ? "alert" : "status"}>
          {banner.text}
          {banner.retry && <button type="button" className={styles.btnLink} onClick={() => void save()}>Try again</button>}
        </p>
      )}

      {conflict && (
        <div className={clsx(styles.banner, styles.bannerError)} role="alert" style={{ display: "block" }}>
          <strong>This draft was changed somewhere else.</strong> Another person or another tab saved a newer version, so your save was refused and nothing was overwritten.
          <div style={{ marginTop: "var(--space-2)" }} className={styles.lineActions}>
            <button type="button" className={dash.btn} onClick={() => void reloadLatest()}>Load the latest version (discards my unsaved changes)</button>
            <button type="button" className={styles.btnLink} onClick={() => setConflict(false)}>Keep editing</button>
          </div>
        </div>
      )}

      {!canEdit ? null : (
        <div className={styles.layout}>
          <div className={styles.main}>
            <section className={styles.section} aria-labelledby="s1">
              <h2 id="s1" className={styles.sectionTitle}><span className={styles.step} aria-hidden>1</span> Quotation details</h2>
              <div className={styles.fields}>
                <Field k="currency" error={errors["currency"]} label="Currency">
                  <select {...ip("currency")} className={sc("currency")} value={input.currency} onChange={(e) => setField("currency", e.target.value)}>
                    {options.currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field k="validUntil" error={errors["validUntil"]} label="Valid until" hint={`The last day this offer is valid. It ends at 11:59 pm India time (UTC+05:30); the server checks the date, not your device clock. Up to ${MAX_VALIDITY_DAYS} days.`}>
                  <input {...ip("validUntil")} type="date" className={ic("validUntil")} value={input.validUntil} min={today} max={maxDate} onChange={(e) => setField("validUntil", e.target.value)} />
                </Field>
                <div className={styles.field}>
                  <span className={styles.label}>Supplier</span>
                  <p className={styles.hint} style={{ color: "var(--text-primary)", fontSize: "var(--fs-sm)" }}>{props.supplier.name}{props.supplier.city ? `, ${props.supplier.city}` : ""}<br /><span className={styles.hint}>Address details are not captured yet.</span></p>
                </div>
              </div>
            </section>

            <section className={styles.section} aria-labelledby="s2">
              <h2 id="s2" className={styles.sectionTitle}><span className={styles.step} aria-hidden>2</span> Products &amp; pricing</h2>
              {err("lines")}
              <div className={styles.line}>
                <div className={styles.lineGrid}>
                  <div className={clsx(styles.field, styles.span2)}>
                    <label className={styles.label} htmlFor={fieldId("lines.0.source")}>Item source</label>
                    <select id={fieldId("lines.0.source")} className={styles.select} value={line.source} onChange={(e) => chooseSource(e.target.value as LineSource)}>
                      {LINE_SOURCES.map((s) => <option key={s} value={s}>{LINE_SOURCE_LABEL[s]}</option>)}
                    </select>
                  </div>
                  {line.source === "CATALOGUE" && (
                    <div className={styles.span2} style={{ gridColumn: "span 2" }}>
                      <ProductSearch inputId="product-search" onPick={pickProduct} />
                      {err("lines.0.productKey")}
                    </div>
                  )}
                  <div className={clsx(styles.field, styles.span2)}>
                    <label className={styles.label} htmlFor={fieldId("lines.0.name")}>Product / item name</label>
                    <input {...ip("lines.0.name")} className={ic("lines.0.name")} value={line.name} readOnly={line.source !== "MANUAL"} maxLength={120} onChange={(e) => setLine({ name: e.target.value }, ["lines.0.name"])} />
                    {line.source === "MANUAL" && <p className={styles.hint}>Labelled as a manual item / substitution for the buyer. It does not change what the buyer asked for.</p>}
                    {err("lines.0.name")}
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={fieldId("lines.0.quantity")}>Quantity</label>
                    <input {...ip("lines.0.quantity")} className={ic("lines.0.quantity")} inputMode="numeric" value={line.quantity} onChange={(e) => setLine({ quantity: e.target.value }, ["lines.0.quantity"])} />
                    <p className={styles.hint}>Whole numbers only.</p>
                    {err("lines.0.quantity")}
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={fieldId("lines.0.unit")}>Unit</label>
                    <input {...ip("lines.0.unit")} className={ic("lines.0.unit")} value={line.unit} readOnly={Boolean(inquiry.unit)} maxLength={20} onChange={(e) => setLine({ unit: e.target.value }, ["lines.0.unit"])} />
                    {inquiry.unit && <p className={styles.hint}>Same as the buyer&apos;s. Units are never converted.</p>}
                    {err("lines.0.unit")}
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={fieldId("lines.0.unitPrice")}>Unit price ({currency})</label>
                    <input {...ip("lines.0.unitPrice")} className={ic("lines.0.unitPrice")} inputMode="decimal" placeholder="0.00" value={line.unitPrice} onChange={(e) => setLine({ unitPrice: e.target.value }, ["lines.0.unitPrice"])} />
                    {err("lines.0.unitPrice")}
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={fieldId("lines.0.moq")}>MOQ (optional)</label>
                    <input {...ip("lines.0.moq")} className={ic("lines.0.moq")} inputMode="numeric" value={line.moq} onChange={(e) => setLine({ moq: e.target.value }, ["lines.0.moq", "lines.0.quantity"])} />
                    {err("lines.0.moq")}
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={fieldId("lines.0.discountKind")}>Discount</label>
                    <select id={fieldId("lines.0.discountKind")} className={styles.select} value={line.discountKind} onChange={(e) => setLine({ discountKind: e.target.value as QuoteLine["discountKind"], discountValue: "" }, ["lines.0.discountValue"])}>
                      <option value="NONE">No discount</option>
                      <option value="PERCENT">Percent (%)</option>
                      <option value="AMOUNT">Amount ({currency})</option>
                    </select>
                  </div>
                  {line.discountKind !== "NONE" && (
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor={fieldId("lines.0.discountValue")}>Discount {line.discountKind === "PERCENT" ? "(%)" : `(${currency})`}</label>
                      <input {...ip("lines.0.discountValue")} className={ic("lines.0.discountValue")} inputMode="decimal" value={line.discountValue} onChange={(e) => setLine({ discountValue: e.target.value }, ["lines.0.discountValue"])} />
                      {err("lines.0.discountValue")}
                    </div>
                  )}
                </div>
                <p className={styles.lineAmount} aria-live="polite"><span>Line amount (after discount)</span><span>{showMoney(lineAmount, currency)}</span></p>
                <div className={styles.lineActions}>
                  <button type="button" className={styles.btnLink} disabled aria-describedby="line-limit"><Plus size={16} aria-hidden /> Add line item</button>
                  <button type="button" className={styles.btnLink} disabled aria-label="Remove line item (a quotation needs one line)"><Trash2 size={16} aria-hidden /> Remove</button>
                  <p id="line-limit" className={styles.hint}>{capabilities.multiLine.reason}</p>
                </div>
              </div>
              <div className={styles.fields} style={{ marginTop: "var(--space-4)" }}>
                <Field k="taxRuleId" error={errors["taxRuleId"]} label="Approved tax treatment" hint={noRules ? undefined : "Only treatments approved by the platform are listed. No rate is assumed."}>
                  <select {...ip("taxRuleId")} className={sc("taxRuleId")} value={input.taxRuleId} disabled={noRules} onChange={(e) => setField("taxRuleId", e.target.value)}>
                    <option value="">Not selected</option>
                    {options.taxRules.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                  {noRules && <p className={styles.hint}>No tax treatment is configured on this platform yet, so the quotation can be saved as a draft but not submitted.</p>}
                </Field>
              </div>
            </section>

            <section className={styles.section} aria-labelledby="s3">
              <h2 id="s3" className={styles.sectionTitle}><span className={styles.step} aria-hidden>3</span> Delivery &amp; payment</h2>
              <div className={styles.fields}>
                <Field k="leadTimeDays" error={errors["leadTimeDays"]} label="Lead time (days)">
                  <input {...ip("leadTimeDays")} className={ic("leadTimeDays")} inputMode="numeric" value={input.leadTimeDays} onChange={(e) => setField("leadTimeDays", e.target.value)} />
                </Field>
                <Field k="deliveryTerms" error={errors["deliveryTerms"]} label="Delivery terms">
                  <select {...ip("deliveryTerms")} className={sc("deliveryTerms")} value={input.deliveryTerms} onChange={(e) => setField("deliveryTerms", e.target.value)}>
                    <option value="">Select</option>
                    {options.deliveryTerms.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </Field>
                <div className={styles.field}>
                  <span className={styles.label}>Delivery destination</span>
                  <p className={styles.hint} style={{ color: "var(--text-primary)", fontSize: "var(--fs-sm)" }}>{inquiry.deliveryLocation ?? "Not stated by the buyer"}<br /><span className={styles.hint}>Set by the buyer; you cannot change it.</span></p>
                </div>
                <Field k="paymentType" error={errors["paymentType"]} label="Payment terms">
                  <select {...ip("paymentType")} className={sc("paymentType")} value={input.paymentType} onChange={(e) => setField("paymentType", e.target.value)}>
                    <option value="">Select</option>
                    {options.paymentTypes.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </Field>
                {input.paymentType === "ADVANCE" && (
                  <Field k="advancePercent" error={errors["advancePercent"]} label="Advance (%)">
                    <input {...ip("advancePercent")} className={ic("advancePercent")} inputMode="decimal" value={input.advancePercent} onChange={(e) => setField("advancePercent", e.target.value)} />
                  </Field>
                )}
                {input.paymentType === "NET_DAYS" && (
                  <Field k="netDays" error={errors["netDays"]} label="Days to pay">
                    <input {...ip("netDays")} className={ic("netDays")} inputMode="numeric" value={input.netDays} onChange={(e) => setField("netDays", e.target.value)} />
                  </Field>
                )}
                <Field k="freight" error={errors["freight"]} label={`Freight (${currency})`} hint="Added after tax; it is not taxed in this calculation.">
                  <input {...ip("freight")} className={ic("freight")} inputMode="decimal" placeholder="0.00" value={input.freight} onChange={(e) => setField("freight", e.target.value)} />
                </Field>
              </div>
              {input.charges.map((c, i) => (
                <div key={i} className={styles.chargeRow} style={{ marginTop: "var(--space-3)" }}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={fieldId(`charges.${i}.label`)}>Additional charge name</label>
                    <input {...ip(`charges.${i}.label`)} className={ic(`charges.${i}.label`)} value={c.label} maxLength={40} onChange={(e) => { setInput((cur) => ({ ...cur, charges: cur.charges.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })); touch(); }} />
                    {err(`charges.${i}.label`)}
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={fieldId(`charges.${i}.amount`)}>Amount ({currency})</label>
                    <input {...ip(`charges.${i}.amount`)} className={ic(`charges.${i}.amount`)} inputMode="decimal" value={c.amount} onChange={(e) => { setInput((cur) => ({ ...cur, charges: cur.charges.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })); touch(); }} />
                    {err(`charges.${i}.amount`)}
                  </div>
                  <button type="button" className={styles.btnLink} aria-label={`Remove charge ${i + 1}`} onClick={() => { setInput((cur) => ({ ...cur, charges: cur.charges.filter((_, j) => j !== i) })); touch(); }}><Trash2 size={16} aria-hidden /></button>
                </div>
              ))}
              {input.charges.length < options.limits.maxExtraCharges && (
                <button type="button" className={styles.btnLink} onClick={() => { setInput((cur) => ({ ...cur, charges: [...cur.charges, { label: "", amount: "" }] })); touch(); }}><Plus size={16} aria-hidden /> Add an approved additional charge</button>
              )}
            </section>

            <section className={styles.section} aria-labelledby="s4">
              <h2 id="s4" className={styles.sectionTitle}><span className={styles.step} aria-hidden>4</span> Notes &amp; attachments</h2>
              <div className={styles.fields}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={fieldId("notes")}>Notes (optional, plain text)</label>
                  <textarea {...ip("notes")} className={clsx(styles.textarea, errors.notes && styles.invalid)} value={input.notes} maxLength={500} onChange={(e) => setField("notes", e.target.value)} placeholder="Add any important information for the buyer..." />
                  <span className={styles.counter}>{input.notes.length} / 500</span>
                  {err("notes")}
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Attachments</span>
                  <div className={styles.dropzone} role="note"><Upload size={22} aria-hidden /><strong>Attachments are not available yet</strong><span>{capabilities.attachments.reason}</span></div>
                </div>
              </div>
            </section>
          </div>

          <aside className={clsx(styles.summary, !summaryOpen && styles.collapsed)} aria-label="Quotation summary">
            <button type="button" className={styles.summaryToggle} aria-expanded={summaryOpen} aria-controls="summary-body" onClick={() => setSummaryOpen((o) => !o)}>
              Quotation summary {summaryOpen ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
            </button>
            <div id="summary-body" className={styles.summaryBody}>
              <dl className={styles.rows} aria-live="polite">
                <div className={styles.row}><dt>Items</dt><dd>{showMoney(calc.subtotal, currency)}</dd></div>
                <div className={styles.row}><dt>Discount</dt><dd>{calc.discount && calc.discount !== "0.00" ? `- ${showMoney(calc.discount, currency)}` : showMoney(calc.discount ?? "0.00", currency)}</dd></div>
                <div className={styles.row}><dt>Taxable amount</dt><dd>{showMoney(calc.taxable, currency)}</dd></div>
                <div className={styles.row}><dt>{rule ? rule.label : "Tax"}</dt><dd>{calc.tax !== null ? showMoney(calc.tax, currency) : <span className={styles.pending}>Pending selection</span>}</dd></div>
                <div className={styles.row}><dt>Freight</dt><dd>{showMoney(calc.freight, currency)}</dd></div>
                {calc.otherCharges !== "0.00" && <div className={styles.row}><dt>Other charges</dt><dd>{showMoney(calc.otherCharges, currency)}</dd></div>}
                <div className={clsx(styles.row, styles.totalRow)}><dt>Total</dt><dd>{calc.total ? showMoney(calc.total, currency) : <span className={styles.pending}>Pending tax review</span>}</dd></div>
              </dl>
              {!calc.total && calc.provisional && <p className={styles.hint} style={{ marginTop: "var(--space-2)" }}>Provisional amount before tax: {showMoney(calc.provisional, currency)}. This is not the final total.</p>}
              <div className={styles.warn} role="note">
                <AlertTriangle size={18} aria-hidden />
                <div>
                  Review pricing and terms before submitting. The server recalculates every amount.
                  {(calc.issues.length > 0 || capabilities.submit.reasons.length > 0) && (
                    <ul className={styles.warnList}>
                      {calc.issues.map((m, i) => <li key={`i${i}`}>{m}</li>)}
                      {capabilities.submit.reasons.map((m, i) => <li key={`r${i}`}>{m}</li>)}
                    </ul>
                  )}
                </div>
              </div>
              <p className={styles.hint} style={{ marginTop: "var(--space-3)" }}>{capabilities.pdf.reason}</p>
              <button ref={previewButton} type="button" className={dash.btn} style={{ width: "100%", marginTop: "var(--space-3)" }} onClick={() => void openDialog("preview")} disabled={busy !== null || saving} aria-busy={busy === "preview"}>
                <Eye size={18} aria-hidden /> {busy === "preview" ? "Preparing..." : "Preview"}
              </button>
            </div>
          </aside>
        </div>
      )}

      {canEdit && (
        <div className={styles.footer}>
          <p className={styles.footerStatus} role="status" aria-live="polite">
            {saving ? "Saving..." : dirty ? "Unsaved changes" : savedLabel ? `Draft saved ${savedLabel}` : "Draft not saved"}
            {reference ? ` · ${reference}` : ""}
          </p>
          <div className={styles.footerButtons}>
            <Link href={leaveHref} className={dash.btn} onClick={leave}>Back to quotations</Link>
            <button type="button" className={dash.btn} onClick={() => void save()} disabled={saving || busy !== null} aria-busy={saving}>{saving ? "Saving..." : "Save Draft"}</button>
            <button ref={reviewButton} type="button" className={clsx(dash.btn, quotes.primaryBtn)} onClick={() => void openDialog("review")} disabled={saving || busy !== null || !props.eligible} aria-busy={busy === "review"}>{busy === "review" ? "Preparing..." : "Review & Submit"}</button>
          </div>
        </div>
      )}

      {dialog && (
        <ReviewDialog
          mode={dialog.mode}
          preview={dialog.preview}
          inquiry={inquiry}
          currency={currency}
          reference={reference}
          open
          onClose={() => {
            setDialog(null);
            (dialog.mode === "review" ? reviewButton : previewButton).current?.focus();
          }}
          submitting={submitting}
          submitError={submitError}
          changedNotice={changedNotice}
          onSubmit={() => void submit()}
        />
      )}
    </>
  );
}

// the only place a decimal amount is normalised for display purposes outside the shared rules (kept here so the parity test can import the same helpers)
export const normaliseAmountText = (text: string): string | null => {
  const p = parseMoney(text);
  return p.ok ? formatDecimal(p.value) : null;
};
