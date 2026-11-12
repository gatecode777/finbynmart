import clsx from "clsx";
import { Bell, ShieldCheck, Smartphone, KeyRound } from "lucide-react";
import type { SecurityOverview } from "@/lib/buyer/security";
import dash from "../Dashboard.module.css";
import inq from "../inquiries/Inquiries.module.css";
import s from "./Security.module.css";

/** The four numbers come from the server: the status from its documented criteria, the sessions from the registry, the alerts from the alert records. */
export function SecurityOverviewCards({ overview }: { overview: SecurityOverview }) {
  const status = overview.status;
  const cards = [
    { label: "Account Security", value: overview.statusLabel, icon: ShieldCheck, tone: status === "protected" ? dash.toneMint : status === "action_required" ? dash.toneCream : dash.toneBlue, note: overview.reasons[0] ?? "No open security alerts.", text: true },
    { label: "Two-Step Verification", value: overview.twoFactor.label, icon: KeyRound, tone: dash.toneBlue, note: "Not offered yet", text: true },
    { label: "Active Sessions", value: String(overview.sessions.activeCount), icon: Smartphone, tone: dash.toneMint, note: overview.sessions.currentTracked ? "Signed-in devices" : "This browser is not tracked yet", text: false },
    { label: "Recent Security Alerts", value: String(overview.alerts.openCount), icon: Bell, tone: dash.toneCream, note: `Unseen, last ${overview.alerts.windowDays} days`, text: false },
  ];
  return (
    <ul className={clsx(dash.kpiGrid, s.summaryGap)} aria-label="Security summary">
      {cards.map((c) => (
        <li key={c.label} className={`${dash.kpiCard} ${c.tone}`}>
          <span className={dash.kpiIcon}><c.icon size={24} aria-hidden /></span>
          <div className={dash.kpiBody}>
            <h2 className={dash.kpiLabel}>{c.label}</h2>
            <p className={dash.kpiValue} style={c.text ? { fontSize: "var(--fs-xl)" } : undefined}>{c.value}</p>
            <p className={inq.cardNote}>{c.note}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
