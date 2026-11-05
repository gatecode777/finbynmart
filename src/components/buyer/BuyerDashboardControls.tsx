"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, RefreshCw } from "lucide-react";
import { RANGE_PRESETS } from "@/lib/buyer/dateRange";
import styles from "./Dashboard.module.css";

interface Props {
  range: string;
  startDate: string;
  endDate: string;
  today: string;
}

/** The period selector and the refresh button. The period lives in the address (?range=...), so it survives a reload. */
export function BuyerDashboardControls({ range, startDate, endDate, today }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [custom, setCustom] = useState(range === "custom");
  const [from, setFrom] = useState(startDate);
  const [to, setTo] = useState(endDate);

  function choose(value: string) {
    if (value === "custom") return setCustom(true);
    setCustom(false);
    startTransition(() => router.push(`/buyer/dashboard?range=${value}`));
  }

  function apply(event: FormEvent) {
    event.preventDefault();
    if (!from || !to) return;
    startTransition(() => router.push(`/buyer/dashboard?range=custom&startDate=${from}&endDate=${to}`));
  }

  return (
    <div className={styles.controls}>
      <label className={styles.rangeSelect}>
        <CalendarDays size={18} aria-hidden />
        <span className="visually-hidden">Period</span>
        <select value={custom ? "custom" : range} onChange={(event) => choose(event.target.value)} aria-busy={pending}>
          {RANGE_PRESETS.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className={styles.iconTextButton} onClick={() => startTransition(() => router.refresh())} disabled={pending} aria-label="Refresh dashboard data">
        <RefreshCw size={16} aria-hidden className={pending ? styles.spin : undefined} />
        <span>{pending ? "Refreshing" : "Refresh"}</span>
      </button>
      {custom && (
        <form className={styles.customRange} onSubmit={apply}>
          <label>
            <span>From</span>
            <input type="date" value={from} max={today} onChange={(event) => setFrom(event.target.value)} required />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={to} max={today} onChange={(event) => setTo(event.target.value)} required />
          </label>
          <button type="submit" className={styles.linkButtonSmall} disabled={pending}>
            Apply
          </button>
        </form>
      )}
    </div>
  );
}
