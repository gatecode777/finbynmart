"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban } from "lucide-react";
import { PrintButton } from "@/components/buyer/quotations/PrintButton";
import d from "../inquiries/detail/InquiryDetail.module.css";
import { CancelRequestDialog, type CancelTarget } from "./CancelRequestDialog";

/** Back, Print and (only while the order is not dispatched) the cancellation request. After the server answers the page is read again. */
export function OrderActions({ target, canRequestCancellation }: { target: CancelTarget; canRequestCancellation: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className={`${d.headerActions} ${d.noPrint}`}>
        <Link href="/buyer/orders" className={d.btn}><ArrowLeft size={18} aria-hidden /> Back to Orders</Link>
        <PrintButton />
        {canRequestCancellation && (
          <button type="button" className={`${d.btn} ${d.btnDanger}`} onClick={() => setOpen(true)}>
            <Ban size={18} aria-hidden /> Request Cancellation
          </button>
        )}
      </div>
      {open && <CancelRequestDialog target={target} onClose={() => setOpen(false)} onDone={() => router.refresh()} />}
    </>
  );
}
