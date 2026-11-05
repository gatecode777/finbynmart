import { CheckCircle2, CircleDot, Loader2 } from "lucide-react";
import type { StatusGroup, TicketStatus } from "@/lib/support/ticketRules";
import styles from "./Support.module.css";

const ICONS = { open: CircleDot, in_progress: Loader2, resolved: CheckCircle2 } as const;

/** The status in words with an icon (never colour alone), from the one status mapping. */
export function SupportTicketStatusBadge({ label, group, status }: { label: string; group: StatusGroup; status: TicketStatus }) {
  const Icon = ICONS[group];
  return (
    <span className={`${styles.badge} ${styles[`badge_${group}`]}`} data-status={status}>
      <Icon size={14} aria-hidden />
      {label}
    </span>
  );
}
