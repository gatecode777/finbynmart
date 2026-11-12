"use client";

import { CircleAlert, CircleCheck, Info } from "lucide-react";
import type { SecurityEventDto } from "@/lib/security/securityEvents";
import clsx from "clsx";
import inq from "../inquiries/Inquiries.module.css";
import type { PagedState } from "../support/usePagedFetch";
import { Loading, formatWhen } from "./securityShared";
import s from "./Security.module.css";

/** The account's one security timeline, newest first: only recorded events, each with the time it was recorded. */
export function SecurityEventTimeline({ state, limit }: { state: PagedState<SecurityEventDto>; limit?: number }) {
  if (state.status === "idle" || state.status === "loading") return <Loading label="Loading security events" />;
  if (state.status === "error") {
    return (
      <div role="alert">
        <p className={s.note}>Security events could not be loaded. {state.error}</p>
        <button type="button" className={inq.btn} onClick={state.retry}>Try again</button>
      </div>
    );
  }
  if (state.items.length === 0) return <p className={s.note}>No security events have been recorded yet. They appear here as they happen.</p>;
  const items = limit ? state.items.slice(0, limit) : state.items;
  return (
    <>
      <ol className={s.timeline} aria-label="Security events">
        {items.map((e) => {
          const Icon = e.status === "success" ? CircleCheck : e.status === "failure" ? CircleAlert : Info;
          return (
            <li key={e.id} className={s.event}>
              <span className={clsx(s.dot, e.status === "failure" && s.dotFail)} aria-hidden><Icon size={16} /></span>
              <div>
                <h3 className={s.eventTitle}>{e.title}</h3>
                <p className={s.eventText}>{e.description}</p>
                <p className={s.eventMeta}><time dateTime={e.at}>{formatWhen(e.at)}</time>{e.deviceLabel ? ` · ${e.deviceLabel}` : ""}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {!limit && state.error && <p className={s.note} role="alert">{state.error}</p>}
      {!limit && state.hasMore && <button type="button" className={inq.btn} onClick={state.loadMore} disabled={state.loadingMore}>{state.loadingMore ? "Loading..." : "Show older events"}</button>}
    </>
  );
}
