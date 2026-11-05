import { Ban, CheckCircle2, Clock, FileText, History, Hourglass, Layers, XCircle, type LucideIcon } from "lucide-react";
import type { EffectiveStatus } from "@/lib/quotations/quotationRules";
import styles from "./Quotations.module.css";

const ICONS: Record<EffectiveStatus, LucideIcon> = { ACTIVE: FileText, EXPIRING_SOON: Hourglass, REVISION_REQUESTED: History, ACCEPTED: CheckCircle2, REJECTED: XCircle, EXPIRED: Clock, WITHDRAWN: Ban, SUPERSEDED: Layers };

/** The status in words with an icon: never colour alone. */
export function QuotationStatusPill({ status, label }: { status: EffectiveStatus; label: string }) {
  const Icon = ICONS[status];
  return (
    <span className={`${styles.pill} ${styles[`pill_${status}`]}`}>
      <Icon size={14} aria-hidden />
      {label}
    </span>
  );
}
