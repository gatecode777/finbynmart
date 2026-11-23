"use client";

import { useEffect, useRef } from "react";
import { fetchMe } from "@/lib/client/me";

/**
 * Records that a signed-in BUYER opened this public product (Page 32). It renders nothing and runs only in the browser after the product page has been displayed, so server
 * rendering, prefetching and listings never record a view. It asks who is signed in first (the same read the header makes), so visitors, suppliers and admins send nothing and
 * produce no failed request. The server decides again (session, role, origin, product) and stores only the product key. A failure is ignored: browsing never depends on it.
 */
export function RecentlyViewedRecorder({ productKey }: { productKey: string }) {
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (done.current === productKey) return; // a remount or a repeated effect for the same product records once
    done.current = productKey;
    (async () => {
      try {
        const me = await fetchMe();
        if (me?.role !== "buyer") return;
        await fetch("/api/buyer/recently-viewed", { method: "POST", cache: "no-store", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: productKey }) });
      } catch { /* never block or break the product page */ }
    })();
  }, [productKey]);
  return null;
}
