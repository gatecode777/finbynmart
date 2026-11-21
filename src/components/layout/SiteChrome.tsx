"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { portalOfPath } from "@/lib/auth/portals";

/**
 * Portal pages (/buyer/..., /supplier/..., /admin/...) bring their own specialized workspace shell and topbar,
 * so the marketplace announcement bar, main header, category navigation, and footer are suppressed there.
 * Public marketplace pages keep the standard global chrome.
 */
export function SiteChrome({ top, bottom, children }: { top: ReactNode; bottom: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  // /unauthorized brings its own minimal brand header: no account menu, search or notification providers are loaded for it
  const isPortal = portalOfPath(pathname) !== "PUBLIC" || pathname === "/unauthorized";
  return (
    <>
      {!isPortal && top}
      <main id="main-content">{children}</main>
      {!isPortal && bottom}
    </>
  );
}
