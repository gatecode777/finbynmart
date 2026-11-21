"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Search, Send } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SignInPrompt } from "@/components/ui/SignInPrompt";
import { flashToast } from "@/components/ui/Toast";
import { REQUIREMENT_LIMITS, validatePostRequirement, type PostRequirementErrors, type PostRequirementValues } from "@/lib/validations/requirement";
import { submitRequirement } from "@/lib/api/requirements";
import styles from "./RequirementForm.module.css";

interface Picked { id: string; name: string; category: string; colour?: string; unit: string }
interface Found extends Picked { supplier: string }
interface SpecAttr { id: string; label: string; type: "enum" | "number" | "text"; required: boolean; options?: { value: string; label: string }[]; units?: { code: string; label: string }[]; maxLength?: number; value: string; unit: string }
interface Spec { supported: boolean; editable?: boolean; reason?: string; category?: string; attributes: SpecAttr[] }
const DRAFT_KEY = "finbyn-requirement-draft";
const newKey = () => crypto.randomUUID().replace(/-/g, "");
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Post Your Requirement. The buyer picks ONE catalogue product that best describes the need (searched on the server, 10 at a time, never the whole catalogue);
 * that product's own category, name and colour are the specification used to find matching suppliers, so nothing is guessed from free text. Matching is
 * mandatory (there is no switch). On success the real reference and distribution state are shown; the lead is not claimed as delivered. Attachments are not
 * offered (they do not exist). A draft survives the sign-in detour (values only, in this tab).
 */
export function RequirementPostForm({ defaultQuery = "", defaultQuantity = "", defaultCity = "" }: { defaultQuery?: string; defaultQuantity?: string; defaultCity?: string }) {
  const uid = useId();
  const [query, setQuery] = useState(defaultQuery);
  const [results, setResults] = useState<Found[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [spec, setSpec] = useState<Spec | null>(null);
  const [specError, setSpecError] = useState("");
  const [attrs, setAttrs] = useState<Record<string, { value: string; unit: string }>>({});
  const [attrErrors, setAttrErrors] = useState<Record<string, string>>({});
  const [v, setV] = useState({ quantity: defaultQuantity, city: defaultCity, requiredBy: "", description: "" });
  const [errors, setErrors] = useState<PostRequirementErrors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [done, setDone] = useState<{ reference: string; href: string; label: string | null } | null>(null);
  const key = useRef(newKey());
  const abort = useRef<AbortController | null>(null);
  const specAbort = useRef<AbortController | null>(null);

  // restore a draft saved before the sign-in detour (never the request key)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as { picked: Picked | null; v: typeof v; attrs?: typeof attrs };
      if (d.picked?.id) setPicked(d.picked);
      if (d.v) setV((prev) => ({ ...prev, ...d.v }));
      if (d.attrs) setAttrs(d.attrs);
      sessionStorage.removeItem(DRAFT_KEY);
    } catch { /* no storage: the form simply starts empty */ }
  }, []);

  // debounced, cancellable product search
  useEffect(() => {
    if (picked) return;
    const q = query.trim();
    if (q.length < 2) { setResults(null); setSearchError(""); return; }
    const t = setTimeout(async () => {
      abort.current?.abort();
      const ctl = (abort.current = new AbortController());
      setSearching(true);
      setSearchError("");
      const res = await fetch(`/api/public/products?${new URLSearchParams({ q, limit: "12", category: "apparel-fashion" })}`, { signal: ctl.signal }).catch(() => null);
      if (ctl.signal.aborted) return;
      const json = res ? await res.json().catch(() => null) : null;
      setSearching(false);
      if (!res?.ok || !json?.ok) { setResults(null); setSearchError("Could not search products. Check your connection and try again."); return; }
      // catalogue products and approved supplier products can describe a requirement; the server decides whether the category is supported
      const items: Found[] = (json.data.products as { id: string; name: string; source: string; category: { name: string }; colour?: string; price: { unit: string }; supplier: { name: string } }[])
        .filter((p) => p.source === "catalog" || p.source === "supplier")
        .map((p) => ({ id: p.id, name: p.name, category: p.category.name, colour: p.colour, unit: p.price.unit, supplier: p.supplier.name }));
      setResults(items.slice(0, 10));
    }, 300);
    return () => clearTimeout(t);
  }, [query, picked]);

  // what the buyer may state about the chosen product (editable attributes for a supplier product, the read-only colour for a catalogue one)
  useEffect(() => {
    specAbort.current?.abort();
    setSpec(null);
    setSpecError("");
    if (!picked) return;
    const ctl = (specAbort.current = new AbortController());
    void (async () => {
      const res = await fetch(`/api/public/requirement-spec?product=${encodeURIComponent(picked.id)}`, { signal: ctl.signal }).catch(() => null);
      if (ctl.signal.aborted) return;
      const json = res ? await res.json().catch(() => null) : null;
      if (!res?.ok || !json?.ok) { setSpecError(res?.status === 429 ? "Too many requests. Wait a moment and choose the product again." : "Could not load the product's specifications. Choose the product again to retry."); return; }
      const data = json.data as Spec;
      setSpec(data);
      // keep values restored from a draft; otherwise start from the product's own
      setAttrs((prev) => (Object.keys(prev).length ? prev : Object.fromEntries(data.attributes.map((a) => [a.id, { value: a.value, unit: a.unit }]))));
    })();
    return () => ctl.abort();
  }, [picked]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    const values: PostRequirementValues = { productId: picked?.id ?? "", quantity: v.quantity, city: v.city, requiredBy: v.requiredBy, description: v.description };
    const found = validatePostRequirement(values, today());
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setStatus("submitting");
    setNeedsSignIn(false);
    if (!spec || spec.supported === false) { setStatus("error"); setMessage(spec?.reason ?? "The product's specifications are not loaded yet. Please wait a moment and try again."); return; }
    const r = await submitRequirement(values, picked!.unit, key.current, spec.editable ? attrs : undefined);
    if (r.status === "ok") {
      setStatus("ok");
      setDone({ reference: r.reference, href: r.href, label: r.distribution?.label ?? null });
      flashToast("success", `Requirement ${r.reference} saved.`);
      key.current = newKey();
      return;
    }
    setStatus("error");
    setMessage(r.message);
    setNeedsSignIn(Boolean(r.needsSignIn));
    if (r.fields) {
      setErrors(r.fields as PostRequirementErrors);
      setAttrErrors(Object.fromEntries(Object.entries(r.fields).filter(([k]) => k.startsWith("attr.")).map(([k, m]) => [k.slice(5), m])));
    }
    if (r.needsSignIn) { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ picked, v, attrs })); } catch { /* ignore */ } }
    flashToast("error", "Your requirement was not submitted.");
  }

  if (done) {
    return (
      <div className={styles.form} role="status">
        <p className={`${styles.status} ${styles.statusOk}`}>
          <strong>Your requirement was saved. Reference: {done.reference}.</strong> Matching suppliers: <strong>{done.label ?? "Processing"}</strong>. Suppliers are identified automatically; no number of replies or quotations is promised. Follow it, read replies and compare quotations under My Inquiries.
        </p>
        <div className={styles.actions}>
          <Link href={done.href}>View requirement {done.reference}</Link>
          <button type="button" className={styles.linkButton} onClick={() => { setDone(null); setStatus("idle"); setPicked(null); setQuery(""); setV({ quantity: "", city: v.city, requiredBy: "", description: "" }); }}>Post another requirement</button>
        </div>
      </div>
    );
  }

  return (
    <form className={styles.postForm} onSubmit={submit} noValidate aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`} className="visually-hidden">Post your requirement</h2>
      <p className={styles.notice}>
        <strong>Select the product that best describes your requirement.</strong> Your requirement will be shared with eligible matching suppliers. Suppliers are matched on that product&apos;s category, name and colour, never on free text alone.
      </p>

      <div className={styles.field}>
        <label htmlFor={`${uid}-product`} className={styles.label}>Product</label>
        {picked ? (
          <div className={styles.picked}>
            <p><strong>{picked.name}</strong><br /><span className={styles.muted}>{picked.category}{picked.colour ? ` · Colour: ${picked.colour}` : ""} · Unit: {picked.unit}</span></p>
            <button type="button" className={styles.linkButton} onClick={() => { setPicked(null); setAttrs({}); setAttrErrors({}); setErrors((e) => ({ ...e, productId: undefined })); }}>Change product</button>
          </div>
        ) : (
          <>
            <div className={styles.searchBox}>
              <Search size={16} aria-hidden />
              <input id={`${uid}-product`} className={styles.search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the product catalogue..." autoComplete="off" aria-invalid={Boolean(errors.productId)} aria-describedby={`${uid}-product-help${errors.productId ? ` ${uid}-product-err` : ""}`} />
            </div>
            <p id={`${uid}-product-help`} className={styles.muted}>Type at least two letters. Pick the closest product. Requirements can be posted for Apparel &amp; Fashion products; other categories have no specification definitions yet, so they cannot be matched.</p>
            {searching && <p className={styles.muted} role="status">Searching...</p>}
            {searchError && <p className={styles.errorText} role="alert">{searchError}</p>}
            {results && results.length > 0 && (
              <ul className={styles.results} aria-label="Matching catalogue products">
                {results.map((p) => (
                  <li key={p.id}>
                    <button type="button" className={styles.result} onClick={() => { setAttrs({}); setAttrErrors({}); setPicked(p); setErrors((e) => ({ ...e, productId: undefined })); }}>
                      <strong>{p.name}</strong>
                      <span className={styles.muted}>{p.category}{p.colour ? ` · ${p.colour}` : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {results && results.length === 0 && !searching && (
              <p className={styles.muted} role="status">
                No matching product available for &ldquo;{query.trim()}&rdquo;. Try another word, <Link href="/products">browse products</Link>, <Link href="/categories">browse categories</Link> or <Link href="/contact-us">contact us</Link>. Nothing is saved without a product.
              </p>
            )}
          </>
        )}
        {errors.productId && <span id={`${uid}-product-err`} className={styles.errorText} role="alert">{errors.productId}</span>}
      </div>

      {picked && specError && <p className={styles.errorText} role="alert">{specError}</p>}
      {picked && spec && spec.supported === false && <p className={styles.errorText} role="alert">{spec.reason}</p>}
      {picked && spec && spec.supported !== false && spec.attributes.length > 0 && (
        <fieldset className={styles.field} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className={styles.label}>Specifications used to find suppliers</legend>
          <p className={styles.muted}>{spec.editable ? "These start from the product you chose. Change any value that differs from what you need; suppliers must match what is stated here." : "The catalogue records only this specification for the product you chose. To need a different colour, choose that product."}</p>
          <div className={styles.specGrid}>
            {spec.attributes.map((a) => (
              <div key={a.id} className={styles.field}>
                <label htmlFor={`${uid}-attr-${a.id}`} className={styles.label}>{a.label}{a.required ? " *" : ""}</label>
                {!spec.editable ? (
                  <p id={`${uid}-attr-${a.id}`} className={styles.muted}>{a.value}</p>
                ) : a.type === "enum" ? (
                  <select id={`${uid}-attr-${a.id}`} className={styles.search} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "0 var(--space-3)" }} value={attrs[a.id]?.value ?? ""} onChange={(e) => setAttrs({ ...attrs, [a.id]: { value: e.target.value, unit: "" } })} aria-invalid={Boolean(attrErrors[a.id])} aria-describedby={attrErrors[a.id] ? `${uid}-attr-${a.id}-err` : undefined}>
                    <option value="">Not specified</option>
                    {a.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <div style={{ display: "flex", gap: "var(--space-2)" }}>
                    <input id={`${uid}-attr-${a.id}`} className={styles.search} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "0 var(--space-3)" }} inputMode={a.type === "number" ? "decimal" : undefined} maxLength={a.maxLength} value={attrs[a.id]?.value ?? ""} onChange={(e) => setAttrs({ ...attrs, [a.id]: { value: e.target.value, unit: attrs[a.id]?.unit ?? a.unit } })} aria-invalid={Boolean(attrErrors[a.id])} aria-describedby={attrErrors[a.id] ? `${uid}-attr-${a.id}-err` : undefined} />
                    {a.type === "number" && a.units && (a.units.length > 1 ? (
                      <select aria-label={`${a.label} unit`} value={attrs[a.id]?.unit || a.units[0].code} onChange={(e) => setAttrs({ ...attrs, [a.id]: { value: attrs[a.id]?.value ?? "", unit: e.target.value } })}>
                        {a.units.map((u) => <option key={u.code} value={u.code}>{u.label}</option>)}
                      </select>
                    ) : <span className={styles.muted}>{a.units[0].label}</span>)}
                  </div>
                )}
                {attrErrors[a.id] && <span id={`${uid}-attr-${a.id}-err`} className={styles.errorText} role="alert">{attrErrors[a.id]}</span>}
              </div>
            ))}
          </div>
        </fieldset>
      )}

      <Input label="Quantity" inputMode="numeric" placeholder={picked ? `Quantity in ${picked.unit.toLowerCase()}` : "Quantity"} value={v.quantity} onChange={(e) => setV({ ...v, quantity: e.target.value })} error={errors.quantity} />
      <Input label="Delivery city" placeholder="Where should it be delivered?" maxLength={REQUIREMENT_LIMITS.cityMax} value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} error={errors.city} />
      <Input label="Required by (optional)" type="date" min={today()} value={v.requiredBy} onChange={(e) => setV({ ...v, requiredBy: e.target.value })} error={errors.requiredBy} />
      <div className={styles.field}>
        <label htmlFor={`${uid}-desc`} className={styles.label}>Additional details (optional)</label>
        <textarea id={`${uid}-desc`} className={styles.textarea} rows={4} maxLength={REQUIREMENT_LIMITS.descriptionMax} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} aria-invalid={Boolean(errors.description)} aria-describedby={`${uid}-desc-help${errors.description ? ` ${uid}-desc-err` : ""}`} />
        <p id={`${uid}-desc-help`} className={styles.muted}>Matching suppliers can read this. Do not include phone numbers, e-mail or your address. Files cannot be attached yet.</p>
        {errors.description && <span id={`${uid}-desc-err`} className={styles.errorText} role="alert">{errors.description}</span>}
      </div>

      <Button type="submit" className={styles.submit} disabled={status === "submitting"}>
        <Send size={16} strokeWidth={2} aria-hidden />
        {status === "submitting" ? "Sending..." : "Send Requirement"}
      </Button>
      {status === "error" && <p className={`${styles.status} ${styles.statusError}`} role="alert">{message}</p>}
      {needsSignIn && <SignInPrompt className={styles.status} />}
    </form>
  );
}
