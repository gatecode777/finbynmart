"use client";

import { FormEvent, ReactNode, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, Check, LogIn, MessageSquare, Minus, Package, Plus, Send, UserRound } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { MAX_QUANTITY } from "@/lib/catalog/quantity";
import { INQUIRY_LIMITS, INQUIRY_TYPES, INQUIRY_UNITS, PHONE_COUNTRIES, type InquiryType } from "@/lib/inquiries/rules";
import { AddressSelector } from "@/components/buyer/AddressSelector";
import { locationText } from "@/lib/buyer/addressRules";
import { validateInquiry } from "@/lib/inquiries/validate";
import styles from "./InquiryWorkspace.module.css";

export interface ProductOption {
  id: string;
  slug: string;
  name: string;
  /** The unit the product is sold in; the quantity unit follows it. */
  unit: string;
  moq?: number;
  moqUnit?: string;
  priceText: string;
  estimated: boolean;
  imageSrc?: string;
  imageRemote: boolean;
}

export type Viewer = { kind: "guest" } | { kind: "buyer"; name: string; email: string };

interface Props {
  supplier: { slug: string; name: string; url: string };
  products: ProductOption[];
  /** True when the supplier has more products than the list holds. */
  moreProducts: boolean;
  initialProductId?: string;
  /** Said when the product in the address could not be used (nothing else is substituted). */
  productNotice?: string;
  viewer: Viewer;
  supplierCard: ReactNode;
  aside: ReactNode;
}

type Mode = "product" | "general";
type Fields = Record<string, string>;

const TYPES_BY_MODE: Record<Mode, InquiryType[]> = {
  product: ["GET_BEST_QUOTE", "PRODUCT_INQUIRY", "BULK_REQUIREMENT"],
  general: ["GET_BEST_QUOTE", "GENERAL_INQUIRY", "BULK_REQUIREMENT"],
};

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`);

interface Done {
  reference: string;
  message: string;
  trackingUrl: string | null;
  replay: boolean;
}

/**
 * The Contact Supplier page body: supplier card and selected product on the left, the form in the middle, benefits on
 * the right. The form runs the same validation as the server (validateInquiry) before sending, but only the server's
 * answer counts: the confirmation is shown after it saved the inquiry, and it repeats what has NOT happened (no
 * supplier notification, no email). A retry after a network error reuses the same key, so it can never save twice.
 */
export function InquiryWorkspace({ supplier, products, moreProducts, initialProductId, productNotice, viewer, supplierCard, aside }: Props) {
  const id = useId();
  const router = useRouter();
  const productRef = useRef<HTMLSelectElement>(null);
  const signedIn = viewer.kind === "buyer";
  const startProduct = products.find((product) => product.id === initialProductId);

  const [mode, setMode] = useState<Mode>(startProduct ? "product" : "general");
  const [productId, setProductId] = useState(startProduct?.id ?? "");
  const [inquiryType, setInquiryType] = useState<InquiryType>("GET_BEST_QUOTE");
  const [quantity, setQuantity] = useState(startProduct?.moq ? String(startProduct.moq) : "1");
  const [unit, setUnit] = useState(startProduct?.unit ?? "Piece");
  const [location, setLocation] = useState("");
  const [message, setMessage] = useState("");
  const [guest, setGuest] = useState({ name: "", company: "", dial: "+91", phone: "", email: "" });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Fields>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [banner, setBanner] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [key, setKey] = useState(newKey);

  const product = mode === "product" ? products.find((item) => item.id === productId) : undefined;
  const minimum = product?.moq ?? 1;
  const nextPath = `/inquiry/${supplier.slug}${product ? `?product=${product.slug}` : startProduct ? `?product=${startProduct.slug}` : ""}`;
  const signInHref = `/sign-in?next=${encodeURIComponent(nextPath)}`;

  function chooseMode(next: Mode) {
    setMode(next);
    setErrors({});
    if (!TYPES_BY_MODE[next].includes(inquiryType)) setInquiryType("GET_BEST_QUOTE");
    if (next === "general") setUnit((current) => (INQUIRY_UNITS.some((item) => item.label === current) ? current : "Piece"));
  }

  function chooseProduct(next: string) {
    setProductId(next);
    const chosen = products.find((item) => item.id === next);
    if (chosen) {
      setUnit(chosen.unit);
      // The product's minimum order is offered as the starting quantity, never forced.
      setQuantity((current) => (chosen.moq && (!current || Number(current) < chosen.moq) ? String(chosen.moq) : current));
    }
  }

  function step(delta: number) {
    const current = /^\d{1,12}$/.test(quantity) ? Number(quantity) : minimum;
    setQuantity(String(Math.min(MAX_QUANTITY, Math.max(1, current + delta))));
  }

  function payload() {
    return {
      supplierSlug: supplier.slug,
      productId: product?.id,
      inquiryType,
      quantity,
      quantityUnit: unit,
      deliveryLocation: location,
      message,
      guestDetails: signedIn ? undefined : { name: guest.name, email: guest.email, phone: guest.phone, countryCode: guest.dial, companyName: guest.company },
      consent,
      idempotencyKey: key,
    };
  }

  function check(): Fields {
    const result = validateInquiry(payload(), {
      signedIn,
      product: product ? { moq: product.moq && product.moqUnit ? { quantity: product.moq, unit: product.moqUnit } : undefined, unit: product.unit } : undefined,
      productError: mode === "product" && !product ? "Choose the product you are asking about." : undefined,
    });
    return result.ok ? {} : result.fields;
  }

  async function send(track: boolean) {
    if (status === "submitting") return;
    setNeedsSignIn(false);
    if (track && !signedIn) {
      setBanner("Sign in to save and track an inquiry. A guest inquiry gets a reference number but cannot be tracked online yet.");
      setNeedsSignIn(true);
      setStatus("error");
      return;
    }
    const found = check();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setStatus("error");
      setBanner("Check the highlighted fields.");
      return;
    }
    setStatus("submitting");
    setBanner("");
    try {
      const response = await fetch("/api/public/inquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok) {
        setDone({ reference: data.reference, message: data.message, trackingUrl: data.tracking?.url ?? null, replay: Boolean(data.replay) });
        setStatus("idle");
        // The saved inquiry has its own confirmation page; the database, not this form, is what it shows.
        if (track && data.tracking?.url) window.location.assign(data.tracking.url);
        else if (data.confirmationUrl) router.push(data.confirmationUrl);
        return;
      }
      setStatus("error");
      setBanner(data.message ?? "Something went wrong. Please try again.");
      if (data.fields) setErrors(data.fields);
      if (response.status === 403 && viewer.kind === "buyer") setNeedsSignIn(false);
    } catch {
      setStatus("error");
      setBanner("Couldn't reach the server. Nothing was sent. Check your connection and try again: your inquiry is kept here.");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(false);
  }

  function sendAnother() {
    setDone(null);
    setMessage("");
    setConsent(false);
    setErrors({});
    setBanner("");
    setStatus("idle");
    setKey(newKey());
  }

  const describe = (field: string) => (errors[field] ? `${id}-${field}-error` : undefined);
  const err = (field: string) =>
    errors[field] ? (
      <p id={`${id}-${field}-error`} className={styles.error}>
        {errors[field]}
      </p>
    ) : null;
  const units = product ? [{ label: product.unit, key: product.unit }] : INQUIRY_UNITS.map((item) => ({ label: item.label, key: item.key }));

  return (
    <div className={styles.workspace}>
      <div className={styles.left}>
        {supplierCard}
        {product && (
          <section className={styles.product} aria-labelledby={`${id}-selected`}>
            <h2 id={`${id}-selected`} className={styles.productHeading}>
              Your Selected Product
            </h2>
            <div className={styles.productBody}>
              <span className={styles.productImage}>
                {product.imageSrc ? <Image src={product.imageSrc} alt={product.name} fill sizes="120px" unoptimized={product.imageRemote} className={styles.productImg} /> : <Package size={36} strokeWidth={1.5} aria-hidden />}
              </span>
              <div className={styles.productInfo}>
                <p className={styles.productName}>{product.name}</p>
                <p className={styles.productPrice}>
                  {product.priceText} <span className={styles.perUnit}>/ {product.unit}</span>
                </p>
                {product.estimated && <p className={styles.productNote}>Estimated price</p>}
                {product.moq && (
                  <p className={styles.productNote}>
                    MOQ: {product.moq.toLocaleString("en-IN")} {product.moqUnit ?? product.unit}
                  </p>
                )}
              </div>
            </div>
            <button type="button" className={styles.change} onClick={() => productRef.current?.focus()}>
              Change Product
            </button>
          </section>
        )}
      </div>

      <div className={styles.main}>
        {done ? (
          <section className={styles.done} aria-labelledby={`${id}-done`} role="status">
            <span className={styles.doneIcon} aria-hidden>
              <Check size={32} strokeWidth={2.5} />
            </span>
            <h2 id={`${id}-done`} className={styles.doneTitle}>
              {done.replay ? "This inquiry was already saved" : "Your inquiry is saved"}
            </h2>
            <p className={styles.reference}>
              Reference <strong>{done.reference}</strong>
            </p>
            <p className={styles.doneText}>{done.message}</p>
            <div className={styles.doneActions}>
              {done.trackingUrl && (
                <Link href={done.trackingUrl} className={styles.primaryLink}>
                  View my inquiries
                </Link>
              )}
              <Button type="button" variant="secondary" onClick={sendAnother}>
                Send another inquiry
              </Button>
              <Link href={supplier.url} className={styles.textLink}>
                Back to {supplier.name}
              </Link>
            </div>
          </section>
        ) : (
          <form className={styles.form} onSubmit={submit} noValidate aria-labelledby={`${id}-title`}>
            <div className={styles.formHead}>
              <h2 id={`${id}-title`} className={styles.formTitle}>
                Inquiry Details
              </h2>
              <div className={styles.modes} role="group" aria-label="What is your inquiry about?">
                <button type="button" className={clsx(styles.mode, mode === "product" && styles.modeOn)} aria-pressed={mode === "product"} disabled={products.length === 0} onClick={() => chooseMode("product")}>
                  <Package size={18} strokeWidth={1.9} aria-hidden />
                  Product Inquiry
                </button>
                <button type="button" className={clsx(styles.mode, mode === "general" && styles.modeOn)} aria-pressed={mode === "general"} onClick={() => chooseMode("general")}>
                  <MessageSquare size={18} strokeWidth={1.9} aria-hidden />
                  General Inquiry
                </button>
              </div>
            </div>

            {productNotice && (
              <p className={styles.notice} role="status">
                {productNotice}
              </p>
            )}

            {banner && (
              <p className={clsx(styles.banner, needsSignIn && styles.bannerInfo)} role="alert">
                {banner}{" "}
                {needsSignIn && (
                  <Link href={signInHref} className={styles.inline}>
                    Sign in
                  </Link>
                )}
              </p>
            )}

            <div className={styles.grid}>
              {mode === "product" && (
                <div className={clsx(styles.field, styles.span2)}>
                  <label htmlFor={`${id}-product`} className={styles.label}>
                    Product / Requirement <span aria-hidden>*</span>
                  </label>
                  <select id={`${id}-product`} ref={productRef} className={clsx(styles.control, errors.product && styles.invalid)} value={productId} onChange={(event) => chooseProduct(event.target.value)} aria-invalid={Boolean(errors.product)} aria-describedby={describe("product")}>
                    <option value="">Choose a product of {supplier.name}</option>
                    {products.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  {moreProducts && <p className={styles.hint}>Showing the first {products.length} products. Choose General Inquiry to ask about any other.</p>}
                  {err("product")}
                </div>
              )}

              <div className={styles.field}>
                <span className={styles.label} id={`${id}-qty-label`}>
                  Quantity <span aria-hidden>*</span>
                </span>
                <div className={clsx(styles.stepper, errors.quantity && styles.invalid)} role="group" aria-labelledby={`${id}-qty-label`}>
                  <button type="button" className={styles.stepButton} onClick={() => step(-1)} aria-label="Decrease quantity" disabled={/^\d{1,12}$/.test(quantity) && Number(quantity) <= 1}>
                    <Minus size={16} aria-hidden />
                  </button>
                  <input className={styles.qty} inputMode="numeric" autoComplete="off" value={quantity} onChange={(event) => setQuantity(event.target.value.trim())} aria-label="Quantity" aria-invalid={Boolean(errors.quantity)} aria-describedby={describe("quantity")} />
                  <button type="button" className={styles.stepButton} onClick={() => step(1)} aria-label="Increase quantity">
                    <Plus size={16} aria-hidden />
                  </button>
                </div>
                {err("quantity")}
              </div>

              <div className={styles.field}>
                <label htmlFor={`${id}-unit`} className={styles.label}>
                  Unit <span aria-hidden>*</span>
                </label>
                <select id={`${id}-unit`} className={clsx(styles.control, errors.unit && styles.invalid)} value={unit} onChange={(event) => setUnit(event.target.value)} disabled={Boolean(product)} aria-invalid={Boolean(errors.unit)} aria-describedby={describe("unit")}>
                  {units.map((item) => (
                    <option key={item.key} value={item.label}>
                      {item.label}
                    </option>
                  ))}
                </select>
                {err("unit")}
              </div>

              <div className={styles.field}>
                <label htmlFor={`${id}-type`} className={styles.label}>
                  Inquiry Type <span aria-hidden>*</span>
                </label>
                <select id={`${id}-type`} className={clsx(styles.control, errors.inquiryType && styles.invalid)} value={inquiryType} onChange={(event) => setInquiryType(event.target.value as InquiryType)} aria-invalid={Boolean(errors.inquiryType)} aria-describedby={describe("inquiryType")}>
                  {INQUIRY_TYPES.filter((type) => TYPES_BY_MODE[mode].includes(type.value)).map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                {err("inquiryType")}
              </div>

              <div className={styles.field}>
                <label htmlFor={`${id}-location`} className={styles.label}>
                  Expected Delivery Location
                </label>
                <input id={`${id}-location`} className={clsx(styles.control, errors.deliveryLocation && styles.invalid)} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Enter city, state or PIN code" autoComplete="off" maxLength={INQUIRY_LIMITS.locationMax + 20} aria-invalid={Boolean(errors.deliveryLocation)} aria-describedby={describe("deliveryLocation")} />
                {err("deliveryLocation")}
                {signedIn && <AddressSelector purpose="delivery" label="Use one of my saved delivery addresses" onSelect={(address) => address && setLocation(locationText(address))} />}
              </div>

              <div className={clsx(styles.field, styles.span2)}>
                <label htmlFor={`${id}-message`} className={styles.label}>
                  Your Requirement / Message <span aria-hidden>*</span>
                </label>
                <textarea id={`${id}-message`} className={clsx(styles.control, styles.textarea, errors.message && styles.invalid)} value={message} onChange={(event) => setMessage(event.target.value)} rows={5} placeholder="Please share your requirement, preferred brand (if any), technical specifications, delivery timeline and any other details." aria-invalid={Boolean(errors.message)} aria-describedby={`${id}-message-count${errors.message ? ` ${id}-message-error` : ""}`} />
                <p id={`${id}-message-count`} className={styles.count}>
                  {message.trim().length.toLocaleString("en-IN")} / {INQUIRY_LIMITS.messageMax.toLocaleString("en-IN")}
                </p>
                {err("message")}
              </div>
            </div>

            <fieldset className={styles.contact}>
              <legend className={styles.contactTitle}>Your Contact Information</legend>
              {signedIn ? (
                <p className={styles.signedIn}>
                  <UserRound size={18} aria-hidden />
                  <span>
                    <strong>I am a Registered Buyer.</strong> Signed in as {viewer.name} ({viewer.email}). Your account is linked to this inquiry.
                  </span>
                </p>
              ) : (
                <>
                  <div className={styles.identity} role="radiogroup" aria-label="How are you contacting the supplier?">
                    <Link href={signInHref} className={styles.identityOption}>
                      <span className={styles.radioDot} aria-hidden />
                      I am a Registered Buyer (Sign in for faster response)
                      <LogIn size={16} aria-hidden />
                    </Link>
                    <span className={clsx(styles.identityOption, styles.identityOn)}>
                      <span className={clsx(styles.radioDot, styles.radioOn)} aria-hidden />
                      Continue as Guest (provide your details)
                    </span>
                  </div>
                  <div className={styles.grid}>
                    <div className={styles.field}>
                      <label htmlFor={`${id}-name`} className={styles.label}>
                        Full Name <span aria-hidden>*</span>
                      </label>
                      <input id={`${id}-name`} className={clsx(styles.control, errors.name && styles.invalid)} value={guest.name} onChange={(event) => setGuest({ ...guest, name: event.target.value })} placeholder="Enter your full name" autoComplete="name" aria-invalid={Boolean(errors.name)} aria-describedby={describe("name")} />
                      {err("name")}
                    </div>
                    <div className={styles.field}>
                      <label htmlFor={`${id}-company`} className={styles.label}>
                        Company Name
                      </label>
                      <input id={`${id}-company`} className={clsx(styles.control, errors.companyName && styles.invalid)} value={guest.company} onChange={(event) => setGuest({ ...guest, company: event.target.value })} placeholder="Enter your company name (optional)" autoComplete="organization" aria-invalid={Boolean(errors.companyName)} aria-describedby={describe("companyName")} />
                      {err("companyName")}
                    </div>
                    <div className={styles.field}>
                      <label htmlFor={`${id}-phone`} className={styles.label}>
                        Phone Number <span aria-hidden>*</span>
                      </label>
                      <div className={clsx(styles.phone, errors.phone && styles.invalid)}>
                        <select aria-label="Country code" className={styles.dial} value={guest.dial} onChange={(event) => setGuest({ ...guest, dial: event.target.value })}>
                          {PHONE_COUNTRIES.map((country) => (
                            <option key={country.code} value={country.code}>
                              {country.code}
                            </option>
                          ))}
                        </select>
                        <input id={`${id}-phone`} className={styles.phoneInput} type="tel" inputMode="tel" autoComplete="tel-national" value={guest.phone} onChange={(event) => setGuest({ ...guest, phone: event.target.value })} placeholder="Enter mobile number" aria-invalid={Boolean(errors.phone)} aria-describedby={describe("phone")} />
                      </div>
                      {err("phone")}
                    </div>
                    <div className={styles.field}>
                      <label htmlFor={`${id}-email`} className={styles.label}>
                        Email Address <span aria-hidden>*</span>
                      </label>
                      <input id={`${id}-email`} className={clsx(styles.control, errors.email && styles.invalid)} type="email" inputMode="email" autoComplete="email" value={guest.email} onChange={(event) => setGuest({ ...guest, email: event.target.value })} placeholder="Enter your email address" aria-invalid={Boolean(errors.email)} aria-describedby={describe("email")} />
                      {err("email")}
                    </div>
                  </div>
                </>
              )}
            </fieldset>

            <div className={styles.consent}>
              <label className={styles.consentLabel}>
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} aria-invalid={Boolean(errors.consent)} aria-describedby={describe("consent")} />
                <span>
                  I agree to the{" "}
                  <Link href="/terms-and-conditions" target="_blank" rel="noopener noreferrer">
                    Terms of Use
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy-policy" target="_blank" rel="noopener noreferrer">
                    Privacy Policy
                  </Link>{" "}
                  and allow Finbyn Mart to share my inquiry details with this supplier. <span aria-hidden>*</span>
                </span>
              </label>
              {err("consent")}
            </div>

            <div className={styles.actions}>
              <Button type="submit" disabled={status === "submitting"} className={styles.send}>
                <Send size={18} aria-hidden />
                {status === "submitting" ? "Sending..." : "Send Inquiry to Supplier"}
              </Button>
              <Button type="button" variant="secondary" disabled={status === "submitting"} onClick={() => void send(true)} className={styles.send}>
                <Bookmark size={18} aria-hidden />
                Save &amp; Track Inquiry
              </Button>
            </div>
          </form>
        )}
      </div>

      <div className={styles.right}>{aside}</div>
    </div>
  );
}
