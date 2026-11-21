import type { Metadata } from "next";
import Link from "next/link";
import { AdminAuditWorkspace } from "@/components/admin/AdminAuditWorkspace";
import { requireAdminPage } from "@/lib/auth/guards";
import { listAuditEvents } from "@/lib/admin/auditLogs";
import { PAGE_SIZE, defaultRange, parseRange, validateQuery, visibleActions } from "@/lib/admin/auditRules";
import { todayInReportZone } from "@/lib/supplier/analyticsRules";
import { withPagePerf } from "@/lib/perf/instrument";
import styles from "@/components/admin/AdminInquiries.module.css";

export const metadata: Metadata = { title: "Audit Logs | Admin Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /admin/audit-logs?action=&q=&from=&to= (capability audit.read, checked on the server). Read-only; only the events this administrator may see (audit.read plus each action's domain capability) are read.
 * An invalid filter in the URL falls back to the defaults and is reported inline. A failed read renders the Retry state, never an empty history.
 */
async function AdminAuditLogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const flat = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string" && ["action", "q", "from", "to"].includes(k)) flat.set(k, v);
  const asked = flat.toString();
  const { permissions } = await requireAdminPage(`/admin/audit-logs${asked ? `?${asked}` : ""}`, "audit.read");
  const validated = validateQuery((k) => flat.get(k), flat.keys());
  const d = defaultRange();
  const state = validated.ok ? { action: validated.value.action, q: validated.value.q, from: validated.value.from, to: validated.value.to } : { action: "all", q: "", from: d.startDay, to: d.endDay };
  const allowed = visibleActions(permissions);
  const actionOk = state.action === "all" || allowed.some((a) => a.key === state.action);
  const useState = actionOk ? state : { ...state, action: "all" };
  const initialError = !validated.ok ? Object.values(validated.fields)[0] : !actionOk ? "That action is not available to you." : null;
  const range = parseRange(useState.from, useState.to);
  const initial = range.ok && allowed.length > 0 ? await listAuditEvents(permissions, { ...useState, cursor: null, limit: PAGE_SIZE }).catch(() => null) : null;
  return (
    <div className={styles.page}>
      <p className={styles.breadcrumb}><Link href="/admin/dashboard">Admin</Link> / Audit Logs</p>
      <h1 className={styles.heading}>Audit Logs</h1>
      <p className={styles.lead}>Review recorded administrative actions.</p>
      <AdminAuditWorkspace initial={initial} state={useState} today={todayInReportZone()} initialError={initialError} noScope={allowed.length === 0} failed={allowed.length > 0 && range.ok && initial === null} actions={allowed.map((a) => ({ key: a.key, label: a.label }))} />
    </div>
  );
}

export default withPagePerf("page admin-audit-logs", AdminAuditLogsPage);
