import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SupplierOrdersWorkspace, type OrderParams } from "@/components/supplier/orders/SupplierOrdersWorkspace";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import { requireSupplierPage } from "@/lib/auth/guards";
import { withPagePerf } from "@/lib/perf/instrument";
import { parseSupplierOrderQuery } from "@/lib/supplier/orderRules";
import { listSupplierOrders } from "@/lib/supplier/orderService";

export const metadata: Metadata = { title: "Orders | Supplier Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * /supplier/orders: the supplier's order workspace. The layout already proved a supplier with an active company; the company used here is the one the
 * session's account owns, never anything from the address. An invalid filter in the address falls back to the defaults (the API itself rejects it with 400).
 * Only the first page is read here; every later change goes through /api/supplier/orders. A role without `viewOrders` is sent to the forbidden page.
 */
async function SupplierOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const { context } = await requireSupplierPage("/supplier/orders");
  if (!context.permissions.viewOrders) redirect("/forbidden?portal=supplier");
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, one(v)]));
  const parsed = parseSupplierOrderQuery(flat);
  const valid = parsed.ok;
  const query = valid
    ? parsed.value
    : (() => {
        const d = parseSupplierOrderQuery({});
        if (!d.ok) throw new Error("default query failed");
        return d.value;
      })();
  const page = await listSupplierOrders(context, query);
  const initialParams: OrderParams = valid
    ? { q: query.q, status: query.status, sort: query.sort, range: query.rangeKey === "all" ? "" : query.rangeKey, startDate: query.rangeKey === "custom" ? (flat.startDate ?? "") : "", endDate: query.rangeKey === "custom" ? (flat.endDate ?? "") : "", dateBasis: query.dateBasis, currency: query.currency ?? "", page: query.page }
    : { q: "", status: "all", sort: "newest", range: "", startDate: "", endDate: "", dateBasis: "placed", currency: "", page: 1 };

  return (
    <div className={dash.page}>
      <p className={dash.breadcrumb}>
        <Link href="/supplier/dashboard">Supplier</Link> / Orders
      </p>
      <SupplierOrdersWorkspace initial={page} initialParams={initialParams} renderedAt={Date.now()} />
    </div>
  );
}

export default withPagePerf("page supplier-orders", SupplierOrdersPage);
