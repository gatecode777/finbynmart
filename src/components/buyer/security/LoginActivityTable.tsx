"use client";

import type { SecurityEventDto } from "@/lib/security/securityEvents";
import inq from "../inquiries/Inquiries.module.css";
import type { PagedState } from "../support/usePagedFetch";
import { Loading, StatusBadge, formatWhen } from "./securityShared";
import s from "./Security.module.css";

/**
 * The recorded sign-ins, failed attempts and sign-outs, newest first. Only events that really happened are listed; history starts when recording
 * began, and the page says so instead of showing an empty list as "nothing happened".
 */
export function LoginActivityTable({ state, since }: { state: PagedState<SecurityEventDto>; since: string | null }) {
  if (state.status === "idle" || state.status === "loading") return <Loading label="Loading login activity" />;
  if (state.status === "error") {
    return (
      <div role="alert">
        <p className={s.note}>Login activity could not be loaded. {state.error}</p>
        <button type="button" className={inq.btn} onClick={state.retry}>Try again</button>
      </div>
    );
  }
  if (state.items.length === 0) {
    return <p className={s.note}>Login history will appear here as new sign-in events are recorded.{since ? ` Recording started ${since}.` : ""} Nothing before that was kept, so an empty list does not mean there were no earlier sign-ins.</p>;
  }
  const label = (e: SecurityEventDto) => `${e.title}${e.type === "LOGIN_FAILED" && e.count ? ` (${e.count})` : ""}`;
  return (
    <>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <caption>Login activity</caption>
          <thead>
            <tr>
              <th scope="col">Event</th>
              <th scope="col">Device</th>
              <th scope="col">Time</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {state.items.map((e) => (
              <tr key={e.id}>
                <td>{label(e)}{e.newDevice && <> <StatusBadge status="warn" label="New device" /></>}</td>
                <td>{e.deviceLabel ?? "Not recorded"}</td>
                <td><time dateTime={e.at}>{formatWhen(e.at)}</time></td>
                <td><StatusBadge status={e.status} label={e.status === "success" ? "Success" : e.status === "failure" ? "Failed" : "Recorded"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className={s.cards} aria-label="Login activity">
        {state.items.map((e) => (
          <li key={e.id} className={s.card}>
            <div className={s.cardTop}>
              <p className={s.cardName}>{label(e)}</p>
              <StatusBadge status={e.status} label={e.status === "success" ? "Success" : e.status === "failure" ? "Failed" : "Recorded"} />
            </div>
            <dl className={s.facts}>
              <div><dt>Device</dt><dd>{e.deviceLabel ?? "Not recorded"}</dd></div>
              <div><dt>Time</dt><dd><time dateTime={e.at}>{formatWhen(e.at)}</time></dd></div>
            </dl>
            {e.newDevice && <p><StatusBadge status="warn" label="New device" /></p>}
          </li>
        ))}
      </ul>
      {state.error && <p className={s.note} role="alert">{state.error}</p>}
      {state.hasMore && <p><button type="button" className={inq.btn} onClick={state.loadMore} disabled={state.loadingMore}>{state.loadingMore ? "Loading..." : "Show older activity"}</button></p>}
      <p className={s.note}>Devices are named from what each browser reports about itself. IP addresses and locations are not recorded. A failed attempt means someone entered a wrong password for this account; it is not proof of an attack.</p>
    </>
  );
}
