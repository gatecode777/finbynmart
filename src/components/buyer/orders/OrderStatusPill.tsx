import { Ban, CheckCircle2, CircleAlert, Clock, Cog, PackageCheck, Truck, type LucideIcon } from "lucide-react";
import type { OrderStatus, StatusGroup } from "@/lib/orders/orderRules";
import styles from "./Orders.module.css";

const ICONS: Record<StatusGroup, LucideIcon> = { processing: Cog, in_transit: Truck, delivered: CheckCircle2, issues: CircleAlert, other: Clock };
const OVERRIDE: Partial<Record<OrderStatus, LucideIcon>> = { CANCELLED: Ban, RETURNED: PackageCheck };

/** The status in words with an icon: never colour alone. */
export function OrderStatusPill({ status, group, label }: { status: OrderStatus; group: StatusGroup; label: string }) {
  const Icon = OVERRIDE[status] ?? ICONS[group];
  return (
    <span className={`${styles.pill} ${styles[`pill_${group}`]}`}>
      <Icon size={14} aria-hidden />
      {label}
    </span>
  );
}
