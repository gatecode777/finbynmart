"use client";

import { useEffect, useId, useState } from "react";
import { locationText, purposeLabel } from "@/lib/buyer/addressRules";
import type { AddressDto } from "@/lib/buyer/addresses";
import styles from "./addresses/Addresses.module.css";

/**
 * A reusable chooser of the signed-in buyer's own saved addresses, for inquiry forms now and for quotation, order and checkout
 * forms when they exist. It reads GET /api/buyer/addresses (buyer-scoped on the server) and hands the chosen address to the
 * caller; it never sends an id anywhere itself. A buyer with no saved addresses sees nothing (the field stays free text).
 * `purpose` limits the list (a delivery location lists Delivery and Goods Receiving addresses).
 */
export function AddressSelector({ onSelect, purpose, label = "Use a saved address" }: { onSelect: (address: AddressDto | null) => void; purpose?: "delivery" | "billing" | "business"; label?: string }) {
  const id = useId();
  const [items, setItems] = useState<AddressDto[] | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/buyer/addresses${purpose ? `?type=${purpose}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => live && setItems(body?.ok ? (body.data.addresses as AddressDto[]) : []))
      .catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, [purpose]);

  if (!items || items.length === 0) return null;
  return (
    <div className={styles.selector}>
      <label htmlFor={id} className="visually-hidden">{label}</label>
      <select id={id} className={styles.selectorSelect} defaultValue="" onChange={(e) => onSelect(items.find((a) => a.id === e.target.value) ?? null)} aria-label={label}>
        <option value="">{label}</option>
        {items.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label} — {locationText(a)} ({a.purposes.map(purposeLabel).join(", ")})
          </option>
        ))}
      </select>
    </div>
  );
}
