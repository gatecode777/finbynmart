"use client";

import { useId, useState } from "react";
import clsx from "clsx";
import styles from "./InquiryDetail.module.css";

/** Plain text (never HTML), kept to six lines until the supplier expands it. The toggle exists only for text long enough to need it. */
export function ExpandableText({ text, threshold = 320 }: { text: string; threshold?: number }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const long = text.length > threshold || text.split("\n").length > 6;
  return (
    <>
      <p id={id} className={clsx(styles.description, long && !open && styles.clamped)}>{text}</p>
      {long && (
        <button type="button" className={styles.toggle} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
          {open ? "Show less" : "Show the full requirement"}
        </button>
      )}
    </>
  );
}
