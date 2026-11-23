import type { Metadata } from "next";
import Link from "next/link";
import { SupplierInventoryWorkspace } from "@/components/supplier/inventory/SupplierInventoryWorkspace";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import { requireSupplierPage } from "@/lib/auth/guards";
import { getInventory } from "@/lib/supplier/inventoryService";
import { withPagePerf } from "@/lib/perf/instrument";

export const metadata: Metadata = {
  title: "Inventory | Supplier Portal | Finbyn Mart",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

async function SupplierInventoryPage() {
  const { context } = await requireSupplierPage("/supplier/inventory");
  const initial = await getInventory(context, { limit: 20 });

  return (
    <div className={dash.page}>
      <p className={dash.breadcrumb}>
        <Link prefetch={false} href="/supplier/dashboard">Supplier</Link> / Inventory
      </p>

      <div className={dash.headerRow}>
        <div>
          <h1 className={dash.title}>Inventory</h1>
          <p className={dash.welcome}>
            Track stock, reservations and movements.</p>
        </div>
      </div>

      <SupplierInventoryWorkspace initial={initial} canAdjust={context.permissions.manageProducts} />
    </div>
  );
}

export default withPagePerf("page supplier-inventory", SupplierInventoryPage);
