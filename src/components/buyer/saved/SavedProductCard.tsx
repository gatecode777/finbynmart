"use client";

import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, FileText, Heart, Package } from "lucide-react";
import { CompareButton } from "@/components/ui/CompareButton";
import type { SavedProductItem } from "@/lib/wishlist/savedProducts";
import inquiries from "../inquiries/Inquiries.module.css";
import styles from "./Saved.module.css";

/**
 * One saved product, the same card in the grid and the list view. The heart removes it (after a confirmation). "Get Quote" opens the
 * existing inquiry form of this product's supplier; it is not offered when that supplier has no public page. A product that has left
 * the catalogue is shown as unavailable with its saved name, and can only be removed. "Compare" adds it to the buyer's comparison list.
 */
export function SavedProductCard({ item, onRemove }: { item: SavedProductItem; onRemove: (item: SavedProductItem) => void }) {
  return (
    <li className={`${styles.card} ${item.available ? "" : styles.gone}`}>
      <span className={styles.image} aria-hidden>
        {item.imageSrc ? <Image src={item.imageSrc} alt="" width={320} height={240} unoptimized={item.imageRemote} /> : <Package size={40} />}
      </span>
      <button type="button" className={styles.heart} aria-label={`Remove ${item.name} from saved products`} onClick={() => onRemove(item)}>
        <Heart size={20} fill="currentColor" aria-hidden />
      </button>
      {item.category && <span className={styles.categoryTag}>{item.category.name}</span>}
      <h3 className={styles.name}>{item.url ? <Link href={item.url}>{item.name}</Link> : item.name}</h3>
      {item.available ? (
        <>
          {item.shortDescription && <p className={styles.desc}>{item.shortDescription}</p>}
          {item.supplier && (
            <p className={styles.supplier}>
              By {item.supplier.url ? <Link href={item.supplier.url}>{item.supplier.name}</Link> : item.supplier.name}
              {item.supplier.verified && (
                <span className={styles.verified}>
                  <BadgeCheck size={14} aria-hidden /> Verified
                </span>
              )}
            </p>
          )}
          {item.price && (
            <p className={styles.price}>
              {item.price.text} <span className={styles.unit}>/ {item.price.unit}</span>
            </p>
          )}
          <div className={styles.actions}>
            {item.supplier?.inquiryHref && (
              <Link href={item.supplier.inquiryHref} className={`${inquiries.btn} ${inquiries.btnPrimary}`}>
                <FileText size={16} aria-hidden /> Get Quote
              </Link>
            )}
            {item.url && (
              <Link href={item.url} className={inquiries.btn}>
                View Product
              </Link>
            )}
            <CompareButton productId={item.key} productName={item.name} />
          </div>
        </>
      ) : (
        <p className={styles.goneNote}>This product is no longer available. You can remove it from your saved products.</p>
      )}
    </li>
  );
}
