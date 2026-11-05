"use client";

import { Download, FileText, Image as ImageIcon } from "lucide-react";
import type { FileItem } from "@/lib/support/conversationService";
import inq from "../inquiries/Inquiries.module.css";
import { fileSize } from "./SupportMessageBubble";
import t from "./TicketDetails.module.css";
import type { PagedState } from "./usePagedFetch";

const GROUPS = [
  { key: "ticket", title: "Original ticket submission", match: (f: FileItem) => f.source === "ticket" },
  { key: "buyer", title: "Your replies", match: (f: FileItem) => f.source === "reply" && f.uploadedBy === "You" },
  { key: "support", title: "Support replies", match: (f: FileItem) => f.source === "reply" && f.uploadedBy !== "You" },
] as const;

/** Every file the buyer may download on this ticket, grouped by where it came from. There is no preview: files download only, and only to their owner. */
export function SupportAttachmentList({ state }: { state: PagedState<FileItem> }) {
  if (state.status === "idle" || state.status === "loading") {
    return <div className={t.skeletonList} aria-busy="true" aria-label="Loading the files"><div className={t.skeleton} /></div>;
  }
  if (state.status === "error") {
    return (
      <div role="alert">
        <p className={t.notice}>The files could not be loaded. {state.error}</p>
        <button type="button" className={inq.btn} onClick={state.retry}>Try again</button>
      </div>
    );
  }
  if (state.items.length === 0) return <p className={t.notice}>No files have been attached to this ticket.</p>;
  return (
    <>
      {GROUPS.map((g) => {
        const rows = state.items.filter(g.match);
        if (rows.length === 0) return null;
        return (
          <section key={g.key} className={t.fileGroup} aria-labelledby={`files-${g.key}`}>
            <h3 id={`files-${g.key}`} className={t.fileGroupTitle}>{g.title}</h3>
            <ul className={t.fileList}>
              {rows.map((f) => (
                <li key={f.id} className={t.fileRow}>
                  <span className={t.fileName}>
                    {f.mime.startsWith("image/") ? <ImageIcon size={16} aria-hidden /> : <FileText size={16} aria-hidden />} {f.name}
                    <span className={inq.muted}> · {f.mime === "application/pdf" ? "PDF" : f.mime === "image/png" ? "PNG" : "JPG"} · {fileSize(f.size)} · {f.uploadedBy} · {f.atLabel}</span>
                  </span>
                  <a className={inq.btn} href={f.href} download aria-label={`Download ${f.name}`}><Download size={16} aria-hidden /> Download</a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {state.hasMore && <button type="button" className={inq.btn} onClick={state.loadMore} disabled={state.loadingMore}>{state.loadingMore ? "Loading..." : "Show more files"}</button>}
      <p className={inq.muted}>Files are kept privately and can only be downloaded by you. Previews are not available; files are downloaded.</p>
    </>
  );
}
