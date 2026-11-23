"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Building2, FileText, Lock, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";
import { useDirty } from "@/components/buyer/profile/dirty";
import styles from "./SupplierProfile.module.css";

export const SUPPLIER_PROFILE_TABS: {
  key: "personal" | "company" | "documents" | "verification" | "security";
  label: string;
  icon: LucideIcon;
}[] = [
  { key: "company", label: "Company Details", icon: Building2 },
  { key: "personal", label: "Contact Details", icon: UserRound },
  { key: "documents", label: "KYC Documents", icon: FileText },
  { key: "verification", label: "Verification", icon: ShieldCheck },
  { key: "security", label: "Security", icon: Lock },
];

export function SupplierProfileTabs({ active }: { active: string }) {
  const router = useRouter();
  const { confirmLeave } = useDirty();

  return (
    <nav aria-label="Profile sections">
      <ul className={styles.tabs}>
        {SUPPLIER_PROFILE_TABS.map(({ key, label, icon: Icon }) => (
          <li key={key}>
            <Link prefetch={false}
              href={`/supplier/company?tab=${key}`}
              className={clsx(styles.tab, active === key && styles.tabActive)}
              aria-current={active === key ? "page" : undefined}
              onClick={async (event) => {
                event.preventDefault();
                if (active === key || !(await confirmLeave())) return;
                router.push(`/supplier/company?tab=${key}`);
              }}
            >
              <Icon size={17} aria-hidden /> {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
