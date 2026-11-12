"use client";

import { useCallback, useId, useRef, useState } from "react";
import clsx from "clsx";
import { Bell, History, KeyRound, LayoutDashboard, LogOut, Monitor, ShieldCheck, Lock } from "lucide-react";
import type { SecurityOverview } from "@/lib/buyer/security";
import type { SecurityEventDto } from "@/lib/security/securityEvents";
import { RANGES, type RangeKey, type SecurityTab } from "@/lib/security/securityRules";
import d from "../inquiries/detail/InquiryDetail.module.css";
import dash from "../Dashboard.module.css";
import inq from "../inquiries/Inquiries.module.css";
import { usePagedFetch } from "../support/usePagedFetch";
import { ActiveSessionsPanel } from "./ActiveSessionsPanel";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { LoginActivityTable } from "./LoginActivityTable";
import { RecoveryMethodsPanel } from "./RecoveryMethodsPanel";
import { SecurityAlertsPanel } from "./SecurityAlertsPanel";
import { SecurityEventTimeline } from "./SecurityEventTimeline";
import { SecurityOverviewCards } from "./SecurityOverviewCards";
import { TwoFactorPanel } from "./TwoFactorPanel";
import s from "./Security.module.css";

const SECURITY_TABS = [
  { key: "overview", label: "Security Overview", icon: LayoutDashboard },
  { key: "password", label: "Password", icon: Lock },
  { key: "2fa", label: "Two-Step Verification", icon: KeyRound },
  { key: "sessions", label: "Active Sessions", icon: Monitor },
  { key: "activity", label: "Login Activity", icon: History },
  { key: "alerts", label: "Security Notifications", icon: Bell },
] as const satisfies readonly { key: SecurityTab; label: string; icon: unknown }[];

const pickEvents = (b: unknown) => (b as { data: { events: SecurityEventDto[] } }).data.events;

function RecentEvents() {
  const state = usePagedFetch<SecurityEventDto>("/api/buyer/security/events?limit=5", true, 0, pickEvents, "before");
  return <SecurityEventTimeline state={state} limit={5} />;
}

function ActivityPanel({ range, since }: { range: RangeKey; since: string | null }) {
  const login = usePagedFetch<SecurityEventDto>(`/api/buyer/security/login-activity?range=${range}`, true, 0, pickEvents, "before");
  const events = usePagedFetch<SecurityEventDto>(`/api/buyer/security/events?range=${range}`, true, 0, pickEvents, "before");
  return (
    <div className={s.stack}>
      <section className={dash.card} aria-labelledby="login-activity-title">
        <h2 id="login-activity-title" className={dash.cardTitle}><History size={20} aria-hidden /> Login Activity</h2>
        <LoginActivityTable state={login} since={since} />
      </section>
      <section className={dash.card} aria-labelledby="events-title">
        <h2 id="events-title" className={dash.cardTitle}><ShieldCheck size={20} aria-hidden /> Security Events</h2>
        <SecurityEventTimeline state={events} />
      </section>
    </div>
  );
}

/**
 * The buyer's Account Security workspace. Everything shown comes from the server; every action goes to the server, which decides whether it is
 * allowed. Tabs load their own data the first time they are opened, and one failing panel does not stop the others (a failed login history never
 * blocks the password form). The address carries the tab (?tab=).
 */
export function BuyerSecurityPage({ initialOverview, initialTab }: { initialOverview: SecurityOverview | null; initialTab: SecurityTab }) {
  const id = useId();
  const [overview, setOverview] = useState(initialOverview);
  const [overviewError, setOverviewError] = useState(initialOverview === null);
  const [tab, setTab] = useState<SecurityTab>(initialTab);
  const [visited, setVisited] = useState<Set<SecurityTab>>(new Set([initialTab]));
  const [range, setRange] = useState<RangeKey>("90d");
  const [signOutRequest, setSignOutRequest] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const refreshOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/buyer/security/overview", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        setOverview(body.data as SecurityOverview);
        setOverviewError(false);
      } else setOverviewError(true);
    } catch {
      setOverviewError(true);
    }
  }, []);

  function choose(next: SecurityTab) {
    setTab(next);
    setVisited((v) => new Set(v).add(next));
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }

  function onKey(event: React.KeyboardEvent, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % SECURITY_TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + SECURITY_TABS.length) % SECURITY_TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = SECURITY_TABS.length - 1;
    else return;
    event.preventDefault();
    choose(SECURITY_TABS[next].key);
    refs.current[next]?.focus();
  }

  const canSignOutOthers = overview?.capabilities.signOutOthers ?? true;

  return (
    <>
      <div className={`${d.headerActions} ${d.noPrint} ${s.actionsGap}`}>
        <button type="button" className={d.btn} onClick={() => choose("password")}><KeyRound size={18} aria-hidden /> Change Password</button>
        {canSignOutOthers && <button type="button" className={clsx(d.btn, d.btnDanger)} onClick={() => { choose("sessions"); setSignOutRequest((n) => n + 1); }}><LogOut size={18} aria-hidden /> Sign Out Other Devices</button>}
      </div>

      {overview ? (
        <SecurityOverviewCards overview={overview} />
      ) : (
        <div className={dash.card} role="alert" style={{ marginBottom: "var(--space-5)" }}>
          <p className={dash.welcome}>The security summary could not be loaded. The sections below still work.</p>
          <button type="button" className={inq.btn} onClick={() => void refreshOverview()}>Try again</button>
        </div>
      )}
      {overviewError && overview && <p className={s.note} role="alert">The summary may be out of date. <button type="button" className={s.linkBtn} onClick={() => void refreshOverview()}>Refresh it</button></p>}

      <section className={d.card} aria-label="Account security sections">
        <div className={d.tabList} role="tablist" aria-label="Account security sections">
          {SECURITY_TABS.map((item, i) => (
            <button
              key={item.key}
              ref={(el) => { refs.current[i] = el; }}
              id={`${id}-${item.key}-tab`}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              aria-controls={`${id}-${item.key}-panel`}
              tabIndex={tab === item.key ? 0 : -1}
              className={clsx(d.tab, tab === item.key && d.tabActive)}
              onClick={() => choose(item.key)}
              onKeyDown={(e) => onKey(e, i)}
            >
              <item.icon size={18} aria-hidden /> {item.label}
            </button>
          ))}
        </div>

        <div id={`${id}-overview-panel`} role="tabpanel" aria-labelledby={`${id}-overview-tab`} hidden={tab !== "overview"} className={d.panel}>
          {visited.has("overview") && (
            <div className={s.stack}>
              <section className={dash.card} aria-labelledby="status-title">
                <h2 id="status-title" className={dash.cardTitle}><ShieldCheck size={20} aria-hidden /> Account protection</h2>
                {overview ? (
                  <>
                    <p className={s.intro}>Status: <strong>{overview.statusLabel}</strong>. {overview.reasons.length === 0 ? "Your email is confirmed and no security alert is waiting." : overview.reasons.join(" ")}</p>
                    <ul className={dash.statusList}>
                      <li className={dash.statusRow}><span>Email</span><span className={overview.account.emailVerified ? dash.badgeOk : dash.badgeWarn}>{overview.account.emailVerified ? "Confirmed" : "Not confirmed"}</span></li>
                      <li className={dash.statusRow}><span>Last sign-in</span><span>{overview.account.lastLoginLabel ?? "Not recorded"}</span></li>
                      <li className={dash.statusRow}><span>Password last changed</span><span>{overview.account.passwordChangedLabel ?? "Not recorded"}</span></li>
                      <li className={dash.statusRow}><span>Sign-in history recorded since</span><span>{overview.loginHistory.sinceLabel ?? "Not yet"}</span></li>
                    </ul>
                    <p className={s.note}>The status has no score: it is Action Required while a warning alert is unseen, Incomplete while your email is unconfirmed, and Protected otherwise.</p>
                  </>
                ) : (
                  <p className={s.note}>The summary could not be loaded.</p>
                )}
              </section>
              <RecoveryMethodsPanel />
              <section className={dash.card} aria-labelledby="recent-title">
                <h2 id="recent-title" className={dash.cardTitle}><History size={20} aria-hidden /> Recent security events</h2>
                <RecentEvents />
                <p><button type="button" className={s.linkBtn} onClick={() => choose("activity")}>See all login activity and events</button></p>
              </section>
            </div>
          )}
        </div>

        <div id={`${id}-password-panel`} role="tabpanel" aria-labelledby={`${id}-password-tab`} hidden={tab !== "password"} className={d.panel}>
          {visited.has("password") && (
            <section className={dash.card} aria-labelledby="password-title">
              <h2 id="password-title" className={dash.cardTitle}><Lock size={20} aria-hidden /> Change Password</h2>
              <p className={s.intro}>Changing your password signs you out of every other device and gives this browser a new session. Your current password is checked on the server, and repeated wrong guesses are slowed down.</p>
              <ChangePasswordForm onChanged={() => void refreshOverview()} />
            </section>
          )}
        </div>

        <div id={`${id}-2fa-panel`} role="tabpanel" aria-labelledby={`${id}-2fa-tab`} hidden={tab !== "2fa"} className={d.panel}>
          {visited.has("2fa") && <TwoFactorPanel reason={overview?.twoFactor.reason ?? "Two-step verification is not available yet: no secure second-factor service exists on this site, so it is not offered."} />}
        </div>

        <div id={`${id}-sessions-panel`} role="tabpanel" aria-labelledby={`${id}-sessions-tab`} hidden={tab !== "sessions"} className={d.panel}>
          {visited.has("sessions") && (
            <section className={dash.card} aria-labelledby="sessions-title">
              <h2 id="sessions-title" className={dash.cardTitle}><Monitor size={20} aria-hidden /> Active Sessions</h2>
              <ActiveSessionsPanel onChanged={() => void refreshOverview()} signOutOthersRequest={signOutRequest} />
            </section>
          )}
        </div>

        <div id={`${id}-activity-panel`} role="tabpanel" aria-labelledby={`${id}-activity-tab`} hidden={tab !== "activity"} className={d.panel}>
          {visited.has("activity") && (
            <>
              <div className={s.toolbar}>
                <label htmlFor={`${id}-range`} className={inq.muted}>Show</label>
                <select id={`${id}-range`} className={s.select} value={range} onChange={(e) => setRange(e.target.value as RangeKey)}>
                  {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <ActivityPanel key={range} range={range} since={overview?.loginHistory.sinceLabel ?? null} />
            </>
          )}
        </div>

        <div id={`${id}-alerts-panel`} role="tabpanel" aria-labelledby={`${id}-alerts-tab`} hidden={tab !== "alerts"} className={d.panel}>
          {visited.has("alerts") && (
            <section className={dash.card} aria-labelledby="alerts-title">
              <h2 id="alerts-title" className={dash.cardTitle}><Bell size={20} aria-hidden /> Security Notifications</h2>
              <SecurityAlertsPanel onChanged={() => void refreshOverview()} />
            </section>
          )}
        </div>
      </section>
    </>
  );
}
