"use client";

import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import styles from "./CopyReference.module.css";

/** Copies the inquiry reference. Says so out loud for screen readers; if the browser blocks the clipboard it says that instead. */
export function CopyReference({ reference }: { reference: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(reference);
      ok = true;
    } catch {
      // Older browsers and some embedded views refuse the clipboard API: select the text through a temporary field.
      const field = document.createElement("textarea");
      field.value = reference;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      document.body.removeChild(field);
    }
    setState(ok ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2500);
  }

  return (
    <span className={styles.wrap}>
      <button type="button" className={styles.button} onClick={() => void copy()} aria-label={`Copy inquiry reference ${reference}`}>
        {state === "copied" ? <Check size={20} strokeWidth={2.5} aria-hidden /> : <Copy size={20} strokeWidth={2} aria-hidden />}
        <span className={styles.label}>{state === "copied" ? "Copied" : "Copy"}</span>
      </button>
      <span className="visually-hidden" role="status" aria-live="polite">
        {state === "copied" ? "Reference copied to the clipboard." : state === "failed" ? "Could not copy. Select the reference and copy it by hand." : ""}
      </span>
      {state === "failed" && <span className={styles.failed}>Could not copy: select the reference by hand.</span>}
    </span>
  );
}
