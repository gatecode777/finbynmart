"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import styles from "./NavigationProgress.module.css";

const MAX_MS = 15000; // safety: never leave the loader on if a navigation never lands

function Inner() {
  const [busy, setBusy] = useState(false);
  const key = `${usePathname()}?${useSearchParams().toString()}`;

  // the new page (path or query) arrived: switch the loader off
  useEffect(() => setBusy(false), [key]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const start = (target: URL) => {
      if (target.origin !== location.origin) return;
      if (target.pathname + target.search === location.pathname + location.search) return;
      setBusy(true);
      clearTimeout(timer);
      timer = setTimeout(() => setBusy(false), MAX_MS);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      start(new URL(a.href, location.href));
    };
    const onSubmit = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement;
      if (e.defaultPrevented || (f.method || "get").toLowerCase() !== "get") return;
      start(new URL(f.action || location.href, location.href));
    };
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
    };
  }, []);

  // dims the page content while the next page loads (see globals via data attribute)
  useEffect(() => {
    document.body.toggleAttribute("data-navigating", busy);
  }, [busy]);

  return busy ? (
    <div className={styles.bar} role="progressbar" aria-label="Loading page" aria-busy="true">
      <span className={styles.fill} />
    </div>
  ) : null;
}

export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
