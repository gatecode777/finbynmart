"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, ChevronDown, Printer } from "lucide-react";
import { CancelInquiryDialog, type CancelTarget } from "../CancelInquiryDialog";
import styles from "./InquiryDetail.module.css";

/** `cancel` is null when the inquiry's status does not allow the buyer to cancel it (then there is no cancel action at all). */
interface Props {
  cancel: CancelTarget | null;
}

/** Back to the list and the "More Actions" menu: print (the browser's print dialog also saves a PDF) and, when allowed, cancel. */
export function HeaderActions({ cancel }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") {
          setOpen(false);
          button.current?.focus();
        }
      } else if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className={`${styles.headerActions} ${styles.noPrint}`}>
      <Link href="/buyer/inquiries" className={styles.btn}>
        <ArrowLeft size={18} aria-hidden /> Back to My Inquiries
      </Link>
      <div className={styles.menuWrap} ref={wrap}>
        <button ref={button} type="button" className={styles.btn} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          More Actions <ChevronDown size={16} aria-hidden />
        </button>
        {open && (
          <div className={styles.menu} role="menu">
            <button type="button" className={styles.menuItem} role="menuitem" onClick={() => { setOpen(false); window.print(); }}>
              <Printer size={16} aria-hidden /> Print Inquiry Details
            </button>
            {cancel && (
              <button type="button" className={`${styles.menuItem} ${styles.menuItemDanger}`} role="menuitem" onClick={() => { setOpen(false); setDialog(true); }}>
                <Ban size={16} aria-hidden /> Cancel Inquiry
              </button>
            )}
          </div>
        )}
      </div>
      {dialog && cancel && <CancelInquiryDialog target={cancel} onClose={() => setDialog(false)} onDone={() => router.refresh()} />}
    </div>
  );
}

/** The action bar under the page. Select & Proceed and Request Revision do not exist: they need quotations, which are not connected. */
export function BottomBar({ cancel }: Props) {
  const router = useRouter();
  const [dialog, setDialog] = useState(false);
  return (
    <div className={`${styles.bar} ${styles.noPrint}`}>
      {cancel && (
        <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => setDialog(true)}>
          <Ban size={18} aria-hidden /> Cancel Inquiry
        </button>
      )}
      <button type="button" className={styles.btn} onClick={() => window.print()}>
        <Printer size={18} aria-hidden /> Print / Save Inquiry Details
      </button>
      {dialog && cancel && <CancelInquiryDialog target={cancel} onClose={() => setDialog(false)} onDone={() => router.refresh()} />}
    </div>
  );
}
