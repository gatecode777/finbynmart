import { CheckCircle2, CircleAlert, Info } from "lucide-react";
import type { EventStatus } from "@/lib/security/securityRules";
import s from "./Security.module.css";

export const formatWhen = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

/** Status as an icon AND a word (never colour alone). */
export function StatusBadge({ status, label }: { status: EventStatus | "current" | "warn"; label: string }) {
  const Icon = status === "success" || status === "current" ? CheckCircle2 : status === "failure" || status === "warn" ? CircleAlert : Info;
  const tone = status === "success" || status === "current" ? s.badgeOk : status === "failure" ? s.badgeFail : status === "warn" ? s.badgeWarn : s.badgeInfo;
  return (
    <span className={`${s.badge} ${tone}`}>
      <Icon size={14} aria-hidden />
      {label}
    </span>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <div className={s.skeletonList} aria-busy="true" aria-label={label}>
      <div className={s.skeleton} />
      <div className={s.skeleton} />
    </div>
  );
}
