"use client";

import { Circle } from "lucide-react";
import type { TimelineItem } from "@/lib/support/conversationService";
import inq from "../inquiries/Inquiries.module.css";
import t from "./TicketDetails.module.css";
import type { PagedState } from "./usePagedFetch";

/** The recorded activity, oldest first. Only what was really recorded appears, with the time it was recorded; earlier or later activity loads on request. */
export function SupportTicketTimeline({ state }: { state: PagedState<TimelineItem> }) {
  if (state.status === "idle" || state.status === "loading") {
    return <div className={t.skeletonList} aria-busy="true" aria-label="Loading the timeline"><div className={t.skeleton} /><div className={t.skeleton} /></div>;
  }
  if (state.status === "error") {
    return (
      <div role="alert">
        <p className={t.notice}>The timeline could not be loaded. {state.error}</p>
        <button type="button" className={inq.btn} onClick={state.retry}>Try again</button>
      </div>
    );
  }
  if (state.items.length === 0) return <p className={t.notice}>No activity has been recorded for this ticket yet.</p>;
  return (
    <>
      <ol className={t.timeline} aria-label="Ticket activity">
        {state.items.map((e) => (
          <li key={e.key} className={t.event}>
            <span className={t.dot} aria-hidden><Circle size={10} fill="currentColor" /></span>
            <div>
              <h3 className={t.eventTitle}>{e.title}</h3>
              <p className={t.eventText}>{e.description}</p>
              <p className={t.eventMeta}><time dateTime={e.at}>{e.atLabel}</time> · {e.actor}</p>
            </div>
          </li>
        ))}
      </ol>
      {state.error && <p className={t.notice} role="alert">{state.error}</p>}
      {state.hasMore && <button type="button" className={inq.btn} onClick={state.loadMore} disabled={state.loadingMore}>{state.loadingMore ? "Loading..." : "Show later activity"}</button>}
    </>
  );
}
