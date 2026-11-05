"use client";

import Link from "next/link";
import dash from "@/components/buyer/Dashboard.module.css";

/** The inquiry could not be read (for example the database was unreachable). Nothing is guessed or shown from a cache. */
export default function InquiryDetailError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className={dash.accessNote} role="alert">
      <h1 className={dash.title}>This inquiry could not be loaded</h1>
      <p className={dash.welcome}>Nothing was changed. Please try again.</p>
      <p>
        <button type="button" className={dash.viewAll} onClick={reset}>Try again</button>
        {" · "}
        <Link href="/buyer/inquiries" className={dash.viewAll}>Back to My Inquiries</Link>
      </p>
    </div>
  );
}
