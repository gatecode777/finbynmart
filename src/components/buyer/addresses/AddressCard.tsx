"use client";

import clsx from "clsx";
import { Building2, Factory, Home, MapPin, Pencil, Phone, Star, Trash2, Truck, Warehouse, type LucideIcon } from "lucide-react";
import { purposeLabel } from "@/lib/buyer/addressRules";
import type { AddressDto } from "@/lib/buyer/addresses";
import styles from "./Addresses.module.css";

const ICONS: Record<string, LucideIcon> = { BUSINESS: Building2, BILLING: Building2, DELIVERY: Truck, GOODS_RECEIVING: Truck, BRANCH_OFFICE: Home, WAREHOUSE: Warehouse, FACTORY: Factory, OTHER: MapPin };

interface Props {
  address: AddressDto;
  busy: boolean;
  onEdit: (address: AddressDto) => void;
  onDelete: (address: AddressDto) => void;
  onDefault: (address: AddressDto, type: "BILLING" | "DELIVERY") => void;
}

/** One saved address. Default markers are text as well as colour; every action is a real button wired to the API. */
export function AddressCard({ address, busy, onEdit, onDelete, onDefault }: Props) {
  const Icon = ICONS[address.purposes[0]] ?? MapPin;
  const isDefault = address.isDefaultBilling || address.isDefaultDelivery;
  return (
    <li className={clsx(styles.card, isDefault && styles.cardDefault)}>
      <div className={styles.cardMain}>
        <span className={styles.cardIcon}>
          <Icon size={24} aria-hidden />
        </span>
        <div className={styles.cardBody}>
          <h3 className={styles.cardTitle}>{address.label}</h3>
          {(address.contactPerson || address.companyName) && <p className={styles.cardLine}>{[address.contactPerson, address.companyName].filter(Boolean).join(" · ")}</p>}
          <p className={styles.cardLine}>
            <MapPin size={16} aria-hidden />
            <span>
              {address.addressLine1}
              {address.addressLine2 ? `, ${address.addressLine2}` : ""}
              {address.landmark ? ` (near ${address.landmark})` : ""}, {address.city}, {address.state} {address.postalCode}, {address.country}
            </span>
          </p>
          {address.phone && (
            <p className={styles.cardLine}>
              <Phone size={16} aria-hidden /> <span>{address.phone.normalized}</span>
            </p>
          )}
          <ul className={styles.tags} aria-label="Purposes">
            {address.isDefaultBilling && (
              <li className={clsx(styles.tag, styles.tagDefault)}>
                <Star size={12} aria-hidden /> Default Billing
              </li>
            )}
            {address.isDefaultDelivery && (
              <li className={clsx(styles.tag, styles.tagDefault)}>
                <Star size={12} aria-hidden /> Default Delivery
              </li>
            )}
            {address.purposes.map((p) => (
              <li key={p} className={styles.tag}>
                {purposeLabel(p)}
              </li>
            ))}
            {address.forCompany && <li className={styles.tag}>Linked to my company</li>}
          </ul>
        </div>
      </div>
      <div className={styles.cardActions}>
        {address.purposes.includes("BILLING") && !address.isDefaultBilling && (
          <button type="button" className={styles.cardButton} onClick={() => onDefault(address, "BILLING")} disabled={busy}>
            Set as Default Billing<span className="visually-hidden">: {address.label}</span>
          </button>
        )}
        {address.purposes.includes("DELIVERY") && !address.isDefaultDelivery && (
          <button type="button" className={styles.cardButton} onClick={() => onDefault(address, "DELIVERY")} disabled={busy}>
            Set as Default Delivery<span className="visually-hidden">: {address.label}</span>
          </button>
        )}
        <button type="button" className={styles.cardButton} onClick={() => onEdit(address)} disabled={busy}>
          <Pencil size={14} aria-hidden /> Edit<span className="visually-hidden"> {address.label}</span>
        </button>
        <button type="button" className={clsx(styles.cardButton, styles.cardButtonDanger)} onClick={() => onDelete(address)} disabled={busy}>
          <Trash2 size={14} aria-hidden /> Delete<span className="visually-hidden"> {address.label}</span>
        </button>
      </div>
    </li>
  );
}
