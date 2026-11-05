"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Building2, FileText, Lock, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";
import { useDirty } from "./dirty";
import styles from "./Profile.module.css";

export const TABS: { key: "personal" | "company" | "documents" | "verification" | "security"; label: string; icon: LucideIcon }[] = [
  { key: "personal", label: "Personal Details", icon: UserRound },
  { key: "company", label: "Company Details", icon: Building2 },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "verification", label: "Verification", icon: ShieldCheck },
  { key: "security", label: "Security", icon: Lock },
];

/**
 * The five sections as links (`?tab=...`): the section survives a reload and can be bookmarked, every one is a real link for
 * keyboard and screen-reader users, and unsaved changes in the open form are confirmed before leaving.
 */
export function ProfileTabs({ active }: { active: string }) {
  const router = useRouter();
  const { confirmLeave } = useDirty();
  return (
    <nav aria-label="Profile sections">
      <ul className={styles.tabs}>
        {TABS.map(({ key, label, icon: Icon }) => (
          <li key={key}>
            <Link
              href={`/buyer/profile?tab=${key}`}
              className={clsx(styles.tab, active === key && styles.tabActive)}
              aria-current={active === key ? "page" : undefined}
              onClick={async (event) => {
                event.preventDefault();
                if (active === key || !(await confirmLeave())) return;
                router.push(`/buyer/profile?tab=${key}`);
              }}
            >
              <Icon size={18} aria-hidden /> {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
