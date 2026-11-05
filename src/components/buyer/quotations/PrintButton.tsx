"use client";

import { Printer } from "lucide-react";
import d from "../inquiries/detail/InquiryDetail.module.css";

/** Opens the browser print dialog (print stylesheet hides the chrome). "Save as PDF" is the browser's own option; no PDF is generated here. */
export function PrintButton() {
  return (
    <button type="button" className={d.btn} onClick={() => window.print()}>
      <Printer size={18} aria-hidden /> Print / Save
    </button>
  );
}
