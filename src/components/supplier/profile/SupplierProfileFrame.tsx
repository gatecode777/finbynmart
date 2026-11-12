"use client";

import { ReactNode } from "react";
import { DirtyProvider } from "@/components/buyer/profile/dirty";
import { SupplierProfileTabs } from "./SupplierProfileTabs";
import styles from "./SupplierProfile.module.css";

export function SupplierProfileFrame({
  active,
  children,
  side,
}: {
  active: string;
  children: ReactNode;
  side: ReactNode;
}) {
  return (
    <DirtyProvider>
      <SupplierProfileTabs active={active} />
      <div className={styles.workspace}>
        <div className={styles.panel}>{children}</div>
        {side}
      </div>
    </DirtyProvider>
  );
}
