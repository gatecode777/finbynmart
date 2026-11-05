"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode } from "react";
import clsx from "clsx";
import { Bell, SlidersHorizontal } from "lucide-react";
import { DirtyProvider, useDirty } from "../profile/dirty";
import profile from "../profile/Profile.module.css";

export const SETTINGS_TABS = [
  { key: "settings", label: "Settings", icon: SlidersHorizontal },
  { key: "notifications", label: "Notifications", icon: Bell },
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number]["key"];

function Tabs({ active, unread }: { active: SettingsTab; unread: number | null }) {
  const router = useRouter();
  const { confirmLeave } = useDirty();
  return (
    <nav aria-label="Settings sections">
      <ul className={profile.tabs}>
        {SETTINGS_TABS.map(({ key, label, icon: Icon }) => (
          <li key={key}>
            <Link
              href={`/buyer/settings?tab=${key}`}
              className={clsx(profile.tab, active === key && profile.tabActive)}
              aria-current={active === key ? "page" : undefined}
              onClick={async (event) => {
                event.preventDefault();
                if (active === key || !(await confirmLeave())) return;
                router.push(`/buyer/settings?tab=${key}`);
              }}
            >
              <Icon size={18} aria-hidden /> {label}
              {key === "notifications" && unread ? <span> ({unread >= 100 ? "99+" : unread} unread)</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** One page, two sections as links (?tab=): the open section survives a reload, and unsaved settings are confirmed before leaving. */
export function SettingsFrame({ active, unread, children }: { active: SettingsTab; unread: number | null; children: ReactNode }) {
  return (
    <DirtyProvider>
      <Tabs active={active} unread={unread} />
      {children}
    </DirtyProvider>
  );
}
