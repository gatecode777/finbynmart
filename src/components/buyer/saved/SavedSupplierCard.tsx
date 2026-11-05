"use client";

import Link from "next/link";
import { BadgeCheck, Heart, Layers, MapPin, MessageSquare, Package } from "lucide-react";
import type { SavedSupplierItem } from "@/lib/wishlist/savedSuppliers";
import inquiries from "../inquiries/Inquiries.module.css";
import styles from "./Saved.module.css";

interface Props {
  item: SavedSupplierItem;
  selected: boolean;
  /** True when 20 are already selected and this one is not: its checkbox is disabled. */
  selectionFull: boolean;
  onToggle: (item: SavedSupplierItem) => void;
  onRemove: (item: SavedSupplierItem) => void;
}

const savedOn = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

/**
 * One saved supplier, the same card in the grid and the list view. The checkbox only selects (it never changes what is saved); the
 * heart removes this one supplier after a confirmation. "Contact Supplier" opens the existing inquiry form of this supplier (there is
 * no buyer-supplier messaging); it is not offered when the supplier is no longer listed. Only public catalogue facts are shown: no
 * contact details, logo, banner or rating (the data holds none), and "Verified" only where the supplier's own record says so.
 */
export function SavedSupplierCard({ item, selected, selectionFull, onToggle, onRemove }: Props) {
  const shown = item.categories.slice(0, 3);
  return (
    <li className={`${styles.card} ${styles.supplierCard} ${item.available ? "" : styles.gone} ${selected ? styles.picked : ""}`}>
      <label className={styles.select}>
        <input type="checkbox" checked={selected} onChange={() => onToggle(item)} disabled={!selected && selectionFull} aria-label={`Select ${item.name}`} />
      </label>
      <button type="button" className={styles.heart} aria-label={`Remove ${item.name} from saved suppliers`} onClick={() => onRemove(item)}>
        <Heart size={20} fill="currentColor" aria-hidden />
      </button>
      <span className={styles.avatar} aria-hidden>{item.initials}</span>
      <h3 className={styles.name}>{item.url ? <Link href={item.url}>{item.name}</Link> : item.name}</h3>
      {item.available ? (
        <>
          <p className={styles.badges}>
            {item.verified ? <span className={styles.verified}><BadgeCheck size={14} aria-hidden /> Verified supplier</span> : <span className={styles.unverified}>Not verified</span>}
            {item.supplierType && <span className={styles.typeTag}>{item.supplierType}</span>}
          </p>
          {item.location && <p className={styles.supplier}><MapPin size={14} aria-hidden /> {item.location}</p>}
          {item.description && <p className={styles.desc}>{item.description}</p>}
          {shown.length > 0 && (
            <ul className={styles.chips} aria-label="Main product categories">
              {shown.map((c) => <li key={c.id} className={styles.categoryTag}>{c.name}</li>)}
              {(item.categoryCount ?? 0) > shown.length && <li className={styles.moreTag}>+{(item.categoryCount ?? 0) - shown.length} more</li>}
            </ul>
          )}
          <ul className={styles.facts}>
            {item.productCount !== null && <li><Package size={14} aria-hidden /> {item.productCount.toLocaleString("en-IN")} {item.productCount === 1 ? "product" : "products"}</li>}
            {item.categoryCount !== null && <li><Layers size={14} aria-hidden /> {item.categoryCount.toLocaleString("en-IN")} {item.categoryCount === 1 ? "category" : "categories"}</li>}
            {item.memberSince && <li>Member since {item.memberSince}</li>}
            <li>Saved on <time dateTime={item.savedAt}>{savedOn(item.savedAt)}</time></li>
          </ul>
          <div className={styles.actions}>
            {item.inquiryHref && (
              <Link href={item.inquiryHref} className={`${inquiries.btn} ${inquiries.btnPrimary}`}>
                <MessageSquare size={16} aria-hidden /> Contact Supplier
              </Link>
            )}
            {item.url && <Link href={item.url} className={inquiries.btn}>View Profile</Link>}
          </div>
        </>
      ) : (
        <>
          <p className={styles.goneNote}>This supplier is no longer available. You can remove it from your saved suppliers.</p>
          <p className={styles.facts}><span>Saved on <time dateTime={item.savedAt}>{savedOn(item.savedAt)}</time></span></p>
        </>
      )}
    </li>
  );
}
