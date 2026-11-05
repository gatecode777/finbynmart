"use client";

import { ReactNode } from "react";
import { DirtyProvider } from "./dirty";
import { ProfileTabs } from "./ProfileTabs";
import styles from "./Profile.module.css";

/** Holds the unsaved-changes state shared by the tab links and the open form. The tab content is rendered by the server page. */
export function ProfileFrame({ active, children, side }: { active: string; children: ReactNode; side: ReactNode }) {
  return (
    <DirtyProvider>
      <ProfileTabs active={active} />
      <div className={styles.workspace}>
        <div className={styles.panel}>{children}</div>
        {side}
      </div>
    </DirtyProvider>
  );
}
