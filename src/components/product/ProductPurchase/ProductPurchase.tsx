"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Minus, MessageSquare, Percent, Plus, ShoppingBag, Star } from "lucide-react";
import clsx from "clsx";
import { ProductQuoteForm } from "@/components/product/ProductQuoteForm";
import { ShareButton } from "@/components/ui/ShareButton";
import { CompareButton } from "@/components/ui/CompareButton";
import { WishlistButton } from "@/components/ui/WishlistButton";
import { MAX_QUANTITY, validateQuantity } from "@/lib/catalog/quantity";
import { unitLabel, unitKey } from "@/lib/catalog/listingQuery";
import { formatCount, formatInr } from "@/lib/utils/format";
import type { ProductDetail } from "@/lib/catalog/productDetail";
import styles from "./ProductPurchase.module.css";

type PanelMode = "quote" | "inquiry";

interface ProductPurchaseProps {
  product: Pick<ProductDetail, "id" | "name" | "url" | "shortDescription" | "pricing" | "moq" | "rating" | "category" | "subcategory" | "source">;
}

/**
 * Centre column of the product page: title, rating, share and wishlist, price, MOQ, quantity selector and the
 * three actions. The quantity is validated here for instant feedback (against the product's own MOQ and unit)
 * and again on the server. Nothing is shown as sent until the server has stored it.
 */
export function ProductPurchase({ product }: ProductPurchaseProps) {
  const { pricing, moq } = product;
  const quantityId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [quantity, setQuantity] = useState(String(moq?.quantity ?? 1));
  const [touched, setTouched] = useState(false);
  const [panel, setPanel] = useState<PanelMode | null>(null);

  // The unit the product is sold in: its MOQ unit, else the unit its price is quoted per.
  const unit = moq?.unit ?? pricing.unit;
  const rules = { moq: moq ?? undefined, unit: pricing.unit };
  const check = validateQuantity(quantity, unit, rules);
  const quantityError = check.ok ? "" : check.message;
  const checkQuantity = () => (check.ok ? null : check.message);

  // Links such as /products/<slug>#get-best-quote open the matching panel.
  useEffect(() => {
    const open = (hash: string) => {
      if (hash === "#get-best-quote") setPanel("quote");
      else if (hash === "#send-inquiry") setPanel("inquiry");
      else return;
      requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    };
    open(window.location.hash);
    const onHash = () => open(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const step = (delta: number) => {
    const current = Number(quantity);
    const floor = moq?.quantity ?? 1;
    const base = Number.isFinite(current) && current >= 1 ? current : floor;
    setQuantity(String(Math.min(MAX_QUANTITY, Math.max(floor, base + delta))));
    setTouched(true);
  };

  const choose = (mode: PanelMode) => {
    setTouched(true);
    setPanel((current) => (current === mode ? null : mode));
  };

  const bulk = new URLSearchParams({ product: product.name, category: product.category.name });
  if (product.subcategory) bulk.set("subcategory", product.subcategory.name);
  if (check.ok) {
    bulk.set("quantity", String(check.quantity));
    bulk.set("unit", unit);
  }

  const price =
    pricing.max && pricing.max !== pricing.min ? `${formatInr(pricing.min)} – ${formatInr(pricing.max)}` : formatInr(pricing.min);

  return (
    <div className={styles.purchase}>
      <h1 className={styles.name}>{product.name}</h1>
      {product.shortDescription && <p className={styles.short}>{product.shortDescription}</p>}

      <div className={styles.metaRow}>
        {product.rating && (
          <span className={styles.rating}>
            <Star size={15} fill="currentColor" strokeWidth={0} aria-hidden />
            {product.rating.value.toFixed(1)}
            {product.rating.count ? ` (${formatCount(product.rating.count)} ratings)` : ""}
          </span>
        )}
        <ShareButton title={product.name} path={product.url} />
        <span className={styles.wish}>
          <WishlistButton productId={product.id} productName={product.name} />
        </span>
      </div>
      <div className={styles.compareRow}>
        <CompareButton productId={product.id} productName={product.name} />
      </div>

      <div className={styles.priceBlock}>
        <span className={styles.price}>
          {pricing.type === "estimated" && <span className={styles.estimate}>Est. </span>}
          {price}
          <span className={styles.unit}> / {pricing.unit}</span>
        </span>
        {pricing.type === "estimated" && <span className={styles.note}>Estimated price: confirm the final price with the supplier.</span>}
      </div>

      <p className={styles.moq}>
        {moq ? (
          <>
            MOQ: <strong>{formatCount(moq.quantity)} {moq.unit}</strong>
          </>
        ) : (
          <>MOQ: <strong>not specified by the supplier</strong></>
        )}
      </p>

      <div className={styles.quantity}>
        <label htmlFor={quantityId} className={styles.quantityLabel}>
          Quantity:
        </label>
        <div className={styles.stepper}>
          <button type="button" onClick={() => step(-1)} aria-label="Decrease quantity" disabled={Number(quantity) <= (moq?.quantity ?? 1)}>
            <Minus size={16} aria-hidden />
          </button>
          <input
            id={quantityId}
            inputMode="numeric"
            value={quantity}
            onChange={(event) => {
              setQuantity(event.target.value.replace(/[^\d]/g, "").slice(0, 7));
              setTouched(true);
            }}
            aria-invalid={touched && Boolean(quantityError)}
            aria-describedby={`${quantityId}-help`}
          />
          <button type="button" onClick={() => step(1)} aria-label="Increase quantity" disabled={Number(quantity) >= MAX_QUANTITY}>
            <Plus size={16} aria-hidden />
          </button>
        </div>
        <span className={styles.unitText}>{unitLabel(unitKey(unit), Number(quantity) || 2)}</span>
      </div>
      <p id={`${quantityId}-help`} className={clsx(styles.help, touched && quantityError && styles.helpError)} aria-live="polite">
        {touched && quantityError
          ? quantityError
          : moq
            ? `Minimum order: ${formatCount(moq.quantity)} ${moq.unit.toLowerCase()}`
            : "No minimum order is listed for this product."}
      </p>

      <div className={styles.actions}>
        <button type="button" className={clsx(styles.action, styles.primary)} onClick={() => choose("quote")} aria-expanded={panel === "quote"} aria-controls="get-best-quote">
          <ShoppingBag size={18} aria-hidden />
          Get Best Quote
        </button>
        <button type="button" className={clsx(styles.action, styles.accent)} onClick={() => choose("inquiry")} aria-expanded={panel === "inquiry"} aria-controls="get-best-quote">
          <MessageSquare size={18} aria-hidden />
          Send Inquiry
        </button>
        <Link href={`/post-requirement?${bulk}`} className={clsx(styles.action, styles.outline, styles.wide)}>
          <Percent size={18} aria-hidden />
          Request Bulk Price
        </Link>
      </div>

      <div id="get-best-quote" ref={panelRef} className={styles.panel} hidden={!panel}>
        {panel && (
          <>
            <h2 className={styles.panelTitle}>{panel === "inquiry" ? `Send an inquiry about ${product.name}` : `Get the best quote for ${product.name}`}</h2>
            <p className={styles.panelText}>Your request goes to this product&apos;s supplier. You need a free account to send it.</p>
            <ProductQuoteForm
              key={panel}
              productId={product.id}
              productName={product.name}
              mode={panel}
              quantity={quantity}
              unit={unit}
              checkQuantity={() => {
                setTouched(true);
                return checkQuantity();
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
