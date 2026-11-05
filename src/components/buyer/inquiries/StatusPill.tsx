import { Ban, CheckCircle2, CircleDot, Clock, FileText, Loader2, MessageSquareReply, XCircle, type LucideIcon } from "lucide-react";
import type { InquiryStatus } from "@/lib/inquiries/rules";
import styles from "./Inquiries.module.css";

const ICONS: Record<InquiryStatus, LucideIcon> = {
  NEW: CircleDot,
  NOTIFIED: Clock,
  IN_PROGRESS: Loader2,
  REPLIED: MessageSquareReply,
  QUOTED: FileText,
  CLOSED: CheckCircle2,
  CANCELLED: Ban,
  REJECTED: XCircle,
};

/** The business label with an icon: the status is always written as text, never colour alone. */
export function StatusPill({ status, label }: { status: InquiryStatus; label: string }) {
  const Icon = ICONS[status];
  return (
    <span className={`${styles.pill} ${styles[`pill_${status}`]}`}>
      <Icon size={14} aria-hidden />
      {label}
    </span>
  );
}
