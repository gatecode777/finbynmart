import { Ban, CheckCircle2, Clock, FileEdit, FileText, History, Hourglass, Layers, XCircle, type LucideIcon } from "lucide-react";
import type { SupplierStatus } from "@/lib/supplier/quotationRules";
import styles from "./SupplierQuotations.module.css";

const ICONS: Record<SupplierStatus, LucideIcon> = { DRAFT: FileEdit, ACTIVE: FileText, EXPIRING_SOON: Hourglass, REVISION_REQUESTED: History, ACCEPTED: CheckCircle2, REJECTED: XCircle, EXPIRED: Clock, WITHDRAWN: Ban, SUPERSEDED: Layers };

/** The status in words with an icon: never colour alone. The label comes from the one status mapping (SUPPLIER_STATUS_LABEL). */
export function SupplierStatusBadge({ status, label }: { status: SupplierStatus; label: string }) {
  const Icon = ICONS[status];
  return (
    <span className={`${styles.pill} ${styles[`pill_${status}`]}`}>
      <Icon size={14} aria-hidden />
      {label}
    </span>
  );
}
