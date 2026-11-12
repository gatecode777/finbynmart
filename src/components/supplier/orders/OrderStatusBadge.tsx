import { AlertTriangle, Ban, CheckCircle2, Clock, PackageCheck, PackageOpen, Truck, type LucideIcon } from "lucide-react";
import type { GroupKey } from "@/lib/supplier/orderRules";
import styles from "./SupplierOrders.module.css";

const ICONS: Record<GroupKey, LucideIcon> = { awaiting: Clock, in_progress: PackageOpen, ready: PackageCheck, shipped: Truck, delivered: CheckCircle2, cancelled: Ban, attention: AlertTriangle };

/** The order's STORED lifecycle status in words with an icon (never colour alone). The colour comes from the status group, the words from the one status label table. */
export function OrderStatusBadge({ group, label }: { group: GroupKey; label: string }) {
  const Icon = ICONS[group];
  return (
    <span className={`${styles.pill} ${styles[`pill_${group}`]}`}>
      <Icon size={14} aria-hidden />
      {label}
    </span>
  );
}
