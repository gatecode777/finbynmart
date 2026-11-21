"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { attributeSetFor } from "@/lib/catalog/attributes";
import Image from "next/image";
import Link from "next/link";
import { flashToast } from "@/components/ui/Toast";
import { ArrowLeft, CheckCircle2, ChevronDown, Upload, CircleDashed, FileText, Info, Lock } from "lucide-react";
import auth from "@/components/auth/Auth.module.css";
import prof from "../profile/SupplierProfile.module.css";
import s from "./ProductDraftForm.module.css";
import { EMPTY_DRAFT, LIMITS, UNITS, formatPaise, parsePaise, reviewDraft, IMAGE_LIMITS, type DraftImage, type DraftInput, type Moderation, type FieldErrors, type Review } from "@/lib/supplier/productDraftRules";

interface Props {
  categories: { id: string; name: string; parentId: string | null }[];
  mode?: "new" | "edit";
  initial?: { reference: string; revision: number; updatedAt: string; input: DraftInput; images?: DraftImage[]; moderation?: Moderation | null } | null;
}

type Save = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: string } | { kind: "error"; message: string };

export function ProductDraftForm({ categories, initial, mode = "new" }: Props) {
  const [input, setInput] = useState<DraftInput>(initial?.input ?? EMPTY_DRAFT);
  const [ref, setRef] = useState(initial?.reference ?? "");
  const [revision, setRevision] = useState(initial?.revision ?? 0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [save, setSave] = useState<Save>(initial ? { kind: "saved", at: initial.updatedAt } : { kind: "idle" });
  const [baseline, setBaseline] = useState<DraftInput>(initial?.input ?? EMPTY_DRAFT);
  const [tab, setTab] = useState(0);
  const [images, setImages] = useState<DraftImage[]>(initial?.images ?? []);
  const [mod, setMod] = useState<Moderation | null>(initial?.moderation ?? null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgError, setImgError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [serverReview, setServerReview] = useState<Review | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const key = useRef("");
  const summary = useRef<HTMLDivElement>(null);

  useEffect(() => {
    key.current ||= crypto.randomUUID();
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const names = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    return categories.map((c) => ({ id: c.id, label: c.parentId && byId.get(c.parentId) ? `${byId.get(c.parentId)!.name} › ${c.name}` : c.name })).sort((a, b) => a.label.localeCompare(b.label));
  }, [categories]);

  const specSet = attributeSetFor(input.categoryId);
  const live = reviewDraft(input, !!input.categoryId, images.length);
  const review = serverReview ?? live;

  function setAttr(id: string, patch: Partial<{ value: string; unit: string }>) {
    setInput((p) => ({ ...p, attributes: { ...p.attributes, [id]: { value: p.attributes[id]?.value ?? "", unit: p.attributes[id]?.unit ?? "", ...patch } } }));
    setDirty(true);
    setServerReview(null);
    setErrors((p) => ({ ...p, [`attr.${id}`]: undefined }));
  }

  function set<K extends keyof DraftInput>(k: K, v: DraftInput[K]) {
    setInput((p) => ({ ...p, [k]: v }));
    setDirty(true);
    setServerReview(null);
    setErrors((p) => ({ ...p, [k]: undefined }));
  }

  async function persist(): Promise<string> {
    if (save.kind === "saving") return "";
    setSave({ kind: "saving" });
    setErrors({});
    setConflict(false);
    const sent = input;
    const body = ref ? { ...input, expectedRevision: revision } : { ...input, idempotencyKey: key.current };
    const res = await fetch(ref ? `/api/supplier/products/drafts/${ref}` : "/api/supplier/products/drafts", {
      method: ref ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok && data.ok) {
      setRef(data.data.reference);
      setRevision(data.data.revision);
      setMod(data.data.moderation ?? null);
      setServerReview(data.data.review);
      setDirty(false);
      setBaseline(sent);
      setSave({ kind: "saved", at: data.data.updatedAt });
      flashToast("success", "Draft saved.");
      if (!ref) window.history.replaceState(null, "", `/supplier/products/new?draft=${data.data.reference}`);
      return data.data.reference as string;
    }
    setConflict(res?.status === 409 && !!ref && !data.fields);
    setErrors(data.fields ?? {});
    flashToast("error", "Draft not saved. " + (res ? (data.message ?? "Please try again.") : "Network error."));
    setSave({ kind: "error", message: res ? (data.message ?? "Could not save the draft.") : "Network error. Your entries are kept; try again." });
    setTimeout(() => summary.current?.focus(), 0);
    return "";
  }

  function discard() {
    if (dirty && !window.confirm("Discard your unsaved changes? The saved draft is not deleted.")) return;
    setInput(baseline);
    setDirty(false);
    setErrors({});
    setServerReview(null);
  }

  const textKeys = Object.keys(LABELS) as (keyof typeof LABELS)[];
  const diffs: { k: string; from: string; to: string }[] = textKeys.filter((k) => input[k] !== baseline[k]).map((k) => ({ k, from: show(k, baseline[k]), to: show(k, input[k]) }));
  if (JSON.stringify(input.attributes) !== JSON.stringify(baseline.attributes)) diffs.push({ k: "attributes", from: "(saved specifications)", to: "(changed specifications)" });

  async function onReview() {
    setReviewing(true);
    const req = "This field is required.";
    const e: FieldErrors = {};
    if (!input.name.trim()) e.name = req;
    if (!input.categoryId) e.categoryId = "Select a category.";
    if (!input.description.trim()) e.description = req;
    if (input.pricingMode === "FIXED") {
      if (!input.price.trim()) e.price = req;
      if (!input.priceUnit) e.priceUnit = "Select a unit.";
    }
    if (!input.moq.trim()) e.moq = req;
    if (!input.quantityUnit) e.quantityUnit = "Select a unit.";
    if (input.pricingMode === "FIXED" && input.priceUnit && input.quantityUnit && input.priceUnit !== input.quantityUnit) e.quantityUnit = "Must match the price unit (no unit conversion is done).";
    const hasImg = images.length > 0;
    if (!hasImg) setImgError("Add at least one product image.");
    if (Object.keys(e).length || !hasImg) {
      setErrors(e);
      flashToast("error", "Not submitted. Complete the highlighted fields first.");
      setTimeout(() => summary.current?.focus(), 0);
      return;
    }
    if ((dirty || !ref) && !(await persist())) return;
    setServerReview(review);
    flashToast("info", "Not submitted. Your draft is saved, but publishing is not available yet.");
  }

  async function reviewAction(action: "submit" | "withdraw") {
    if (reviewBusy || !ref) return;
    setReviewBusy(true);
    const res = await fetch("/api/supplier/products/drafts/" + ref + "/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "submit" ? { action, expectedRevision: revision } : { action }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setReviewBusy(false);
    if (res?.ok && data.ok) {
      setMod(data.data.moderation ?? null);
      flashToast("success", data.message);
      return;
    }
    const msg = res ? (data.message ?? "Could not complete that.") : "Network error. Nothing was changed.";
    setSave({ kind: "error", message: msg });
    flashToast("error", (action === "submit" ? "Not submitted. " : "Not withdrawn. ") + msg);
  }

  async function onPick(file: File | undefined) {
    if (!file) return;
    setImgError("");
    if (file.size > IMAGE_LIMITS.maxBytes) return setImgError("Image must be 5 MB or smaller.");
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setImgError("Only JPG, PNG or WebP images are accepted.");
    if (images.length >= IMAGE_LIMITS.max) return setImgError("You can add at most " + IMAGE_LIMITS.max + " images.");
    setImgBusy(true);
    const target = ref || (await persist());
    if (!target) {
      setImgBusy(false);
      return setImgError("Enter the product name and save the draft before adding images.");
    }
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/supplier/products/drafts/" + target + "/images", { method: "POST", body: fd }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setImgBusy(false);
    if (res?.ok && data.ok) {
      setImages(data.data.images);
      setServerReview(null);
      flashToast("success", "Image added.");
    } else {
      setImgError(res ? (data.message ?? "Upload failed.") : "Network error. Try again.");
      flashToast("error", "Image not uploaded.");
    }
  }

  async function changeImage(fileId: string, action: "cover" | "remove" | "left" | "right") {
    setImgError("");
    const res = await fetch("/api/supplier/products/drafts/" + ref + "/images", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId, action }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok && data.ok) {
      setImages(data.data.images);
      setServerReview(null);
    } else setImgError(res ? (data.message ?? "Could not update images.") : "Network error. Try again.");
  }

  const paise = input.pricingMode === "FIXED" ? parsePaise(input.price) : null;
  const unit = UNITS.find((u) => u.code === input.priceUnit)?.label.toLowerCase();
  const qUnit = UNITS.find((u) => u.code === input.quantityUnit)?.label.toLowerCase();
  const fieldErr = (k: keyof DraftInput | `attr.${string}`) => (errors[k] ? <p id={`e-${k}`} className={s.err}>{errors[k]}</p> : null);
  const aria = (k: keyof DraftInput | `attr.${string}`) => ({ "aria-invalid": errors[k] ? true : undefined, "aria-describedby": errors[k] ? `e-${k}` : undefined });

  return (
    <>
      <p className={s.statusBadge} role="status" aria-live="polite">
        <FileText size={16} aria-hidden />
        {save.kind === "saving" ? "Saving…" : dirty ? "Unsaved draft" : save.kind === "saved" ? "Draft saved " + new Date(save.at).toLocaleString() : save.kind === "error" ? "Not saved" : "Unsaved draft"}
      </p>

      {(save.kind === "error" || Object.keys(errors).length > 0) && (
        <div ref={summary} tabIndex={-1} role="alert" className={s.summary}>
          <strong>{save.kind === "error" ? save.message : "Please fix the highlighted fields."}</strong>
          {conflict && <p><button type="button" className={prof.btnSecondary} onClick={() => window.location.reload()}>Reload latest (your unsaved entries will be lost)</button></p>}
          <ul>{Object.entries(errors).map(([k, m]) => <li key={k}><a href={`#f-${k}`}>{m}</a></li>)}</ul>
        </div>
      )}

      <div className={s.layout}>
        <div>
        {mode === "edit" && (
          <div role="tablist" aria-label="Product sections" className={s.tabs}>
            {["Basic details", "Images", "Pricing", "Specifications"].map((l, i) => (
              <button key={l} type="button" role="tab" id={"tab-" + i} aria-selected={tab === i} className={tab === i ? s.tabOn : s.tab} onClick={() => setTab(i)} onKeyDown={(e) => { if (e.key === "ArrowRight") setTab((i + 1) % 4); if (e.key === "ArrowLeft") setTab((i + 3) % 4); }}>{l}</button>
            ))}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); void persist(); }} noValidate>
          <details className={`${s.section} ${mode === "edit" && tab !== 0 ? s.off : ""}`} open>
            <summary className={s.sectionTitle}><span className={s.num}>1</span>Basic information<ChevronDown size={18} className={s.chev} aria-hidden /></summary>
            <div className={s.grid}>
              <div className={auth.field}>
                <label htmlFor="f-name" className={auth.label}>Product name</label>
                <input id="f-name" className={auth.control} value={input.name} maxLength={LIMITS.name} onChange={(e) => set("name", e.target.value)} {...aria("name")} />
                {fieldErr("name")}
              </div>
              <div className={auth.field}>
                <label htmlFor="f-categoryId" className={auth.label}>Category</label>
                <select id="f-categoryId" className={auth.control} value={input.categoryId} onChange={(e) => set("categoryId", e.target.value)} {...aria("categoryId")}>
                  <option value="">Select a category</option>
                  {names.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                {fieldErr("categoryId")}
              </div>
              <div className={auth.field}>
                <label htmlFor="f-sku" className={auth.label}>Supplier SKU (optional)</label>
                <input id="f-sku" className={auth.control} value={input.sku} maxLength={LIMITS.sku} onChange={(e) => set("sku", e.target.value)} {...aria("sku")} />
                <p className={s.hint}>Unique among your own products only.</p>
                {fieldErr("sku")}
              </div>
              <div className={`${auth.field} ${s.full}`}>
                <label htmlFor="f-description" className={auth.label}>Description (plain text)</label>
                <textarea id="f-description" className={auth.control} rows={4} value={input.description} maxLength={LIMITS.description} onChange={(e) => set("description", e.target.value)} {...aria("description")} />
                {fieldErr("description")}
              </div>
              {specSet ? (
                <fieldset className={auth.field} style={{ gridColumn: "1 / -1", border: 0, padding: 0, margin: 0 }}>
                  <legend className={auth.label}>Specifications</legend>
                  <p className={s.hint}>These are shown on the public product after approval and are used to match your product to buyer requirements. Fill in only what is true; an empty field stays empty.</p>
                  <div className={s.grid}>
                    {specSet.defs.map((d) => (
                      <div key={d.id} className={auth.field}>
                        <label htmlFor={`f-attr-${d.id}`} className={auth.label}>{d.label}{d.required ? " *" : ""}</label>
                        {d.type === "enum" ? (
                          <select id={`f-attr-${d.id}`} className={auth.control} value={input.attributes[d.id]?.value ?? ""} onChange={(e) => setAttr(d.id, { value: e.target.value })} {...aria(`attr.${d.id}`)}>
                            <option value="">Not specified</option>
                            {d.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        ) : d.type === "number" ? (
                          <div style={{ display: "flex", gap: "var(--space-2)" }}>
                            <input id={`f-attr-${d.id}`} className={auth.control} inputMode="decimal" value={input.attributes[d.id]?.value ?? ""} onChange={(e) => setAttr(d.id, { value: e.target.value })} {...aria(`attr.${d.id}`)} />
                            {d.units!.length > 1 ? (
                              <select aria-label={`${d.label} unit`} className={auth.control} value={input.attributes[d.id]?.unit || d.units![0].code} onChange={(e) => setAttr(d.id, { unit: e.target.value })}>
                                {d.units!.map((u) => <option key={u.code} value={u.code}>{u.label}</option>)}
                              </select>
                            ) : <span className={s.hint} style={{ alignSelf: "center" }}>{d.units![0].label}</span>}
                          </div>
                        ) : (
                          <input id={`f-attr-${d.id}`} className={auth.control} maxLength={d.textMax} value={input.attributes[d.id]?.value ?? ""} onChange={(e) => setAttr(d.id, { value: e.target.value })} {...aria(`attr.${d.id}`)} />
                        )}
                        {fieldErr(`attr.${d.id}`)}
                      </div>
                    ))}
                  </div>
                </fieldset>
              ) : input.categoryId ? (
                <p className={s.hint} style={{ gridColumn: "1 / -1" }}>This category has no specification fields yet, so this product cannot be matched to buyer requirements automatically.</p>
              ) : null}
            </div>
          </details>

          <details className={`${s.section} ${mode === "edit" && tab !== 1 ? s.off : ""}`} open>
            <summary className={s.sectionTitle}><span className={s.num}>2</span>Product images<ChevronDown size={18} className={s.chev} aria-hidden /></summary>
            <div className={s.tiles}>
              {images.map((im, i) => (
                <div key={im.fileId} className={s.imgCard}>
                  <div className={s.imgBox}>
                    <Image src={im.url} alt={im.name} fill sizes="160px" style={{ objectFit: "cover" }} />
                    {i === 0 && <span className={s.cover}>Cover</span>}
                  </div>
                  <div className={s.imgActions}>
                    {i > 0 && <button type="button" onClick={() => changeImage(im.fileId, "left")} aria-label={"Move " + im.name + " earlier"}>← Earlier</button>}
                    {i < images.length - 1 && <button type="button" onClick={() => changeImage(im.fileId, "right")} aria-label={"Move " + im.name + " later"}>Later →</button>}
                    {i > 0 && <button type="button" onClick={() => changeImage(im.fileId, "cover")} aria-label={"Make " + im.name + " the cover image"}>Make cover</button>}
                    <button type="button" onClick={() => changeImage(im.fileId, "remove")} aria-label={"Remove " + im.name}>Remove</button>
                  </div>
                </div>
              ))}
              {images.length < IMAGE_LIMITS.max && (
                <label className={s.tile} style={{ cursor: imgBusy ? "progress" : "pointer" }}>
                  <Upload size={18} aria-hidden />
                  {imgBusy ? "Uploading…" : "Upload image"}
                  <span className={s.hint}>JPG, PNG, WebP · max 5 MB</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={imgBusy} onChange={(e) => { void onPick(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              )}
              {imgError && <p id="e-images" role="alert" className={s.err} style={{ gridColumn: "1 / -1" }}>{imgError}</p>}
            </div>
          </details>

          <details className={`${s.section} ${mode === "edit" && tab !== 2 ? s.off : ""}`} open>
            <summary className={s.sectionTitle}><span className={s.num}>3</span>Pricing &amp; quantity<ChevronDown size={18} className={s.chev} aria-hidden /></summary>
            <div className={s.grid}>
              <div className={auth.field}>
                <label htmlFor="f-pricingMode" className={auth.label}>Pricing type</label>
                <select id="f-pricingMode" className={auth.control} value={input.pricingMode} onChange={(e) => set("pricingMode", e.target.value as DraftInput["pricingMode"])}>
                  <option value="FIXED">Fixed price</option>
                  <option value="ON_REQUEST">Price on request</option>
                </select>
                <p className={s.hint}>Price ranges and tier pricing are not supported yet.</p>
              </div>
              <div className={auth.field}>
                <span className={auth.label}>Currency</span>
                <input className={auth.control} value="INR" readOnly aria-label="Currency (INR only)" />
              </div>
              {input.pricingMode === "FIXED" && (
                <>
                  <div className={auth.field}>
                    <label htmlFor="f-price" className={auth.label}>Unit price (₹)</label>
                    <input id="f-price" className={auth.control} inputMode="decimal" value={input.price} onChange={(e) => set("price", e.target.value)} {...aria("price")} />
                    {fieldErr("price")}
                  </div>
                  <div className={auth.field}>
                    <label htmlFor="f-priceUnit" className={auth.label}>Price unit</label>
                    <select id="f-priceUnit" className={auth.control} value={input.priceUnit} onChange={(e) => set("priceUnit", e.target.value)} {...aria("priceUnit")}>
                      <option value="">Select</option>
                      {UNITS.map((u) => <option key={u.code} value={u.code}>{u.label}</option>)}
                    </select>
                    {fieldErr("priceUnit")}
                  </div>
                </>
              )}
              <div className={auth.field}>
                <label htmlFor="f-moq" className={auth.label}>Minimum order quantity</label>
                <input id="f-moq" className={auth.control} inputMode="numeric" value={input.moq} onChange={(e) => set("moq", e.target.value)} {...aria("moq")} />
                {fieldErr("moq")}
              </div>
              <div className={auth.field}>
                <label htmlFor="f-quantityUnit" className={auth.label}>Quantity unit</label>
                <select id="f-quantityUnit" className={auth.control} value={input.quantityUnit} onChange={(e) => set("quantityUnit", e.target.value)} {...aria("quantityUnit")}>
                  <option value="">Select</option>
                  {UNITS.map((u) => <option key={u.code} value={u.code}>{u.label}</option>)}
                </select>
                {fieldErr("quantityUnit")}
              </div>
            </div>
            <p className={s.hint}>Tax treatment is not stated: amounts are shown as entered. No unit conversion is done.</p>
          </details>

          <details className={`${s.section} ${mode === "edit" && tab !== 3 ? s.off : ""}`} open>
            <summary className={s.sectionTitle}><span className={s.num}>4</span>Specifications<ChevronDown size={18} className={s.chev} aria-hidden /></summary>
            <p className={s.hint}><Lock size={14} aria-hidden /> Category specification fields are not defined yet, so none are shown.</p>
          </details>

          <div className={s.bar}>
            <Link href="/supplier/products" className={prof.btnSecondary}><ArrowLeft size={16} aria-hidden /> Back to Products</Link>
            <div className={s.actions}>
              {mode === "edit" && <button type="button" className={prof.btnSecondary} onClick={discard} disabled={!dirty}>Discard local changes</button>}
              <button type="submit" className={prof.btnSecondary} disabled={save.kind === "saving"}>{save.kind === "saving" ? "Saving…" : "Save Draft"}</button>
              <button type="button" className={prof.btnGold} onClick={onReview} disabled={save.kind === "saving"}>{mode === "edit" ? "Review Changes" : "Review Listing"}</button>
            </div>
          </div>
        </form>
        </div>

        <aside className={s.side} aria-label="Listing preview and checklist">
          <section className={s.preview}>
            <h2 style={{ marginTop: 0, fontSize: "1.125rem" }}>Listing preview</h2>
            <div className={s.previewImg}>No image</div>
            <p style={{ fontWeight: 700, marginBottom: 4 }}>{input.name || "Product name not entered"} <span className={s.badge}>Draft</span></p>
            <p style={{ margin: "0 0 4px" }}>
              {input.pricingMode === "ON_REQUEST" ? "Price on request" : paise !== null && unit ? `₹${formatPaise(paise)} / ${unit}` : "Price not entered"}
            </p>
            <p style={{ margin: "0 0 8px" }}>{input.moq && qUnit ? `MOQ ${input.moq} ${qUnit}` : "MOQ not entered"}</p>
            <p className={s.hint}><Info size={14} aria-hidden /> Preview only · Not public.</p>
          </section>

          <section className={s.preview}>
            <h2 style={{ marginTop: 0, fontSize: "1.125rem" }}>Listing checklist</h2>
            <ul className={s.list}>
              {review.checklist.map((c) => (
                <li key={c.key}>
                  {c.state === "done" ? <CheckCircle2 size={18} color="#04534F" aria-label="Complete" /> : c.state === "blocked" ? <Lock size={18} aria-label="Not available yet" /> : <CircleDashed size={18} aria-label="Incomplete" />}
                  <span>{c.label}{c.detail ? <span className={s.hint}> — {c.detail}</span> : null}</span>
                </li>
              ))}
            </ul>
          </section>

          {mode === "edit" && (
            <>
              <section className={s.preview}>
                <h2 style={{ marginTop: 0 }}>Listing details</h2>
                <dl className={s.dl}>
                  <dt>Product reference</dt><dd>{ref}</dd>
                  <dt>Live status</dt><dd>Not published</dd>
                  <dt>Review status</dt><dd>Not available yet</dd>
                  <dt>Last saved</dt><dd>{save.kind === "saved" ? new Date(save.at).toLocaleString() : "—"}</dd>
                </dl>
              </section>
              <section className={s.preview} aria-live="polite">
                <h2 style={{ marginTop: 0 }}>Changes summary</h2>
                {diffs.length === 0 ? <p className={s.hint}>No unsaved changes.</p> : (
                  <ul className={s.list}>{diffs.map((d) => <li key={d.k}><span><strong>{d.k === "attributes" ? "Specifications" : LABELS[d.k as keyof typeof LABELS]}:</strong> {d.from} → {d.to}</span></li>)}</ul>
                )}
                <p className={s.hint}>Compared with your last saved draft. This product has no live version.</p>
              </section>
            </>
          )}

          {reviewing && (
            <section className={s.preview} aria-live="polite">
              <h2 style={{ marginTop: 0, fontSize: "1.125rem" }}>Review result</h2>
              {save.kind === "error" ? <p className={s.err}>Review needs a saved draft. Fix the errors above first.</p> : (
                <>
                  <p><strong>{mod?.state === "APPROVED" ? "This revision was approved." : mod?.state === "PENDING" ? "This revision is waiting for a reviewer." : "This listing is not public."}</strong></p>
                  {mod?.state === "REJECTED" && mod.reason && <p role="status" className={s.err}>Not approved: {mod.reason}</p>}
                  {review.missing.length > 0 && <><p className={s.hint}>You still need to complete:</p><ul>{review.missing.map((m) => <li key={m}>{m}</li>)}</ul></>}
                  <p className={s.hint}>Not supported by the platform yet:</p>
                  <ul>{review.blockers.map((m) => <li key={m}>{m}</li>)}</ul>
                  <p className={s.hint}>{mod?.state === "PENDING" ? "It cannot be edited while under review. Withdraw it to edit." : mod?.state === "APPROVED" ? "Approval makes this revision eligible for public discovery. It is not company verification." : "Your draft is saved and stays private until a reviewer approves a submitted revision."}</p>
                  {mod?.state === "PENDING" ? (
                    <button type="button" className={prof.btnSecondary} disabled={reviewBusy} onClick={() => void reviewAction("withdraw")}>Withdraw submission</button>
                  ) : mod?.state !== "APPROVED" && review.canSubmit && !dirty && ref ? (
                    <button type="button" className={prof.btnGold} disabled={reviewBusy} onClick={() => void reviewAction("submit")}>{reviewBusy ? "Submitting…" : mod?.state === "REJECTED" ? "Submit again for review" : "Submit for review"}</button>
                  ) : null}
                </>
              )}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

const LABELS: Record<Exclude<keyof DraftInput, "attributes">, string> = { name: "Name", categoryId: "Category", sku: "SKU", description: "Description", pricingMode: "Pricing type", price: "Unit price", priceUnit: "Price unit", moq: "MOQ", quantityUnit: "Quantity unit" };
const show = (_k: string, v: string) => (v === "" ? "(empty)" : v.length > 60 ? v.slice(0, 57) + "…" : v);
