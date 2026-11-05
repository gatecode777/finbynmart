"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Decision (CLAUDE.md section D asks that different chrome be raised, and the owner's Page 22 PRD and reference require it):
 * signed-in buyer workspace pages (/buyer/...) bring their own sidebar and top bar (components/buyer/BuyerShell), so the
 * marketplace announcement bar, header, category navigation and footer are not rendered there. Every other route keeps the
 * single global chrome exactly as before. The chrome itself is still built once, in the root layout.
 */
export function SiteChrome({ top, bottom, children }: { top: ReactNode; bottom: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const workspace = pathname === "/buyer" || pathname.startsWith("/buyer/");
  return (
    <>
      {!workspace && top}
      <main id="main-content">{children}</main>
      {!workspace && bottom}
    </>
  );
}
