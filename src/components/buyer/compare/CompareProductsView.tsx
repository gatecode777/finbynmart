"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, FileText, Package, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/Modal";
import { flashToast } from "@/components/ui/Toast";
import { WishlistButton } from "@/components/ui/WishlistButton";
import { productCompare } from "@/components/ui/WishlistButton/wishlistStore";
import type { CompareColumn, CompareField, ProductComparison } from "@/lib/compare/service";
import inq from "../inquiries/Inquiries.module.css";
import d from "../inquiries/detail/InquiryDetail.module.css";
import q from "../quotations/Quotations.module.css";
import styles from "./CompareProducts.module.css";

type Target = { kind: "one"; column: CompareColumn } | { kind: "all" };

const SECTION_TITLE: Record<string, string> = { price: "Price & order", availability: "Availability & delivery", product: "Product", supplier: "Supplier", specific: "Specific to one product" };

interface Section {
  id: string;
  title: string;
  fields: CompareField[];
}

/** Rows in their order, a new block whenever the section (or, for specifications, the attribute's own group) changes. */
function toSections(fields: CompareField[]): Section[] {
  const out: Section[] = [];
  for (const f of fields) {
    const id = f.section === "spec" ? `spec:${f.group}` : f.section;
    const title = f.section === "spec" ? (f.group ?? "Specifications") : SECTION_TITLE[f.section];
    const last = out.at(-1);
    if (last && last.id === id) last.fields.push(f);
    else out.push({ id, title, fields: [f] });
  }
  return out;
}

/**
 * The buyer's product comparison: two to four products side by side (a table from 900px with a sticky criteria column, one card per
 * product below). "Highlight differences" marks the rows where the products state different values; "Differences only" hides the rows
 * that are the same everywhere. Missing values read Not Provided (never zero). The only emphasis on a number is the neutral "lowest
 * listed price / minimum order", and only when currency and unit match. Nothing is ranked. Removing a product or clearing the list asks
 * first and is shown as done only after the server confirmed it.
 */
export function CompareProductsView({ data }: { data: ProductComparison }) {
  const router = useRouter();
  const [target, setTarget] = useState<Target | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [highlight, setHighlight] = useState(true);
  const [diffOnly, setDiffOnly] = useState(false);
  const { columns } = data;
  const live = columns.filter((c) => c.available).length;
  const atMax = columns.length >= data.max;

  const shown = useMemo(() => data.fields.filter((f) => !diffOnly || f.status !== "same"), [data.fields, diffOnly]);
  const sections = useMemo(() => toSections(shown), [shown]);
  const hiddenSame = data.fields.length - shown.length;

  async function confirm() {
    if (!target || busy) return;
    setBusy(true);
    setError("");
    const res = await fetch(target.kind === "all" ? "/api/buyer/compare" : `/api/buyer/compare/${encodeURIComponent(target.column.key)}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      // keep the product pages' buttons in step with the server
      await productCompare.load();
      flashToast("success", target.kind === "all" ? "Your comparison was cleared." : "Removed from your comparison.");
      setTarget(null);
      router.refresh();
      return;
    }
    setError(res ? "It could not be removed. Try again." : "Could not reach the server. Nothing was changed.");
  }

  const ask = (t: Target) => { setError(""); setTarget(t); };

  const cell = (c: CompareColumn, f: CompareField) => {
    if (!c.available) return "-";
    const v = c.values[f.key];
    const body = v ? v : <span className={q.missing}>Not Provided</span>;
    return f.highlight.includes(c.key) && v ? <span className={styles.lowestCell}>{body}<span className={styles.lowestTag}>{f.highlightLabel}</span></span> : body;
  };
  const cellClass = (c: CompareColumn, f: CompareField) => (highlight && f.status === "differs" && c.available ? q.differs : undefined);
  const mark = (f: CompareField) => (highlight && f.status === "differs" ? <span className={q.differsMark}>Differs</span> : null);

  const headerBlock = (c: CompareColumn) => (
    <span className={styles.colHead}>
      <span className={styles.thumb} aria-hidden>{c.imageSrc ? <Image src={c.imageSrc} alt="" width={120} height={120} unoptimized={c.imageRemote} /> : <Package size={36} />}</span>
      {c.url ? <Link href={c.url} className={d.link}>{c.name}</Link> : <span>{c.name}</span>}
      {c.available && c.code && <span className={styles.code}>Product code: {c.code}</span>}
      {c.supplier && <span className={styles.supplierLine}>{c.supplier.url ? <Link href={c.supplier.url}>{c.supplier.name}</Link> : c.supplier.name}{c.supplier.verified && <span className={styles.verified}><BadgeCheck size={14} aria-hidden /> Verified supplier</span>}</span>}
      {c.available && c.values.category && <span className={styles.code}>{c.values.category}</span>}
      {!c.available && <span className={q.missing}>No longer available</span>}
    </span>
  );

  const actions = (c: CompareColumn) => (
    <span className={styles.rowActions}>
      {c.available && c.inquiryHref && <Link href={c.inquiryHref} className={`${inq.btn} ${inq.btnPrimary}`}><FileText size={16} aria-hidden /> Add to Inquiry</Link>}
      {c.available && c.url && <Link href={c.url} className={inq.btn}>View Product</Link>}
      {c.available && <span className={styles.save}><WishlistButton productId={c.key} productName={c.name} /></span>}
      <button type="button" className={inq.btn} onClick={() => ask({ kind: "one", column: c })}><X size={16} aria-hidden /> Remove</button>
    </span>
  );

  if (columns.length === 0) {
    return (
      <div className={inq.emptyBox}>
        <h2 className={inq.emptyTitle}>Nothing to compare yet</h2>
        <p className={inq.emptyText}>Add between {data.min} and {data.max} products with the Compare button on a product card, a product page or in your saved products, then come back here.</p>
        <Link href="/products" className={inq.cta}>Browse Products</Link>
        <Link href="/buyer/saved-products" className={inq.btn}>Open Saved Products</Link>
      </div>
    );
  }

  return (
    <>
      <div className={styles.headActions}>
        <Link href="/buyer/saved-products" className={inq.btn}>Back to Saved Products</Link>
        {atMax ? (
          <button type="button" className={inq.btn} disabled aria-disabled="true" title={`Four products are the most you can compare: remove one first.`}><Plus size={16} aria-hidden /> Add More Products</button>
        ) : (
          <Link href="/products" className={`${inq.btn} ${inq.btnPrimary}`}><Plus size={16} aria-hidden /> Add More Products</Link>
        )}
        <button type="button" className={`${inq.btn} ${inq.btnDanger}`} onClick={() => ask({ kind: "all" })}><Trash2 size={16} aria-hidden /> Clear All</button>
      </div>
      {atMax && <p className={styles.hint}>Four products are the most you can compare at once. Remove one to add another.</p>}

      <ul className={styles.chipRow} aria-label="Products in your comparison">
        {columns.map((c) => (
          <li key={c.key} className={styles.productChip}>
            <span className={styles.chipThumb} aria-hidden>{c.imageSrc ? <Image src={c.imageSrc} alt="" width={36} height={36} unoptimized={c.imageRemote} /> : <Package size={18} />}</span>
            <span className={styles.chipName}>{c.name}</span>
            <button type="button" className={styles.chipRemove} aria-label={`Remove ${c.name} from comparison`} onClick={() => ask({ kind: "one", column: c })}><X size={16} aria-hidden /></button>
          </li>
        ))}
      </ul>

      {data.notices.map((n) => <p key={n.text} className={`${q.notice} ${n.level === "warning" ? q.noticeDanger : q.noticeInfo}`} role="status">{n.level === "warning" && <TriangleAlert size={16} aria-hidden />} {n.text}</p>)}
      {live < data.min && <p className={`${q.notice} ${q.noticeInfo}`} role="status">Add at least {data.min} products to compare them side by side. You can compare up to {data.max}.</p>}

      <section className={d.card} aria-labelledby="compare-products-title">
        <div className={styles.head}>
          <h2 id="compare-products-title" className={d.cardTitle}>Comparison Criteria ({columns.length} of {data.max})</h2>
          <div className={styles.toggles}>
            <label className={styles.toggle}><input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} /> Highlight differences</label>
            <label className={styles.toggle}><input type="checkbox" checked={diffOnly} onChange={(e) => setDiffOnly(e.target.checked)} /> Show differences only</label>
          </div>
        </div>
        {diffOnly && <p className={styles.hint} aria-live="polite">{hiddenSame} {hiddenSame === 1 ? "row" : "rows"} that are the same for every product {hiddenSame === 1 ? "is" : "are"} hidden. Rows with a Not Provided value stay visible.</p>}

        <div className={`${q.compareWrap} ${styles.scroll}`} role="region" aria-label="Product comparison table: scroll sideways to see every product" tabIndex={0}>
          <table className={`${q.compareTable} ${styles.table}`}>
            <caption className="visually-hidden">Products side by side</caption>
            <thead>
              <tr>
                <th scope="col" className={styles.stickyCol}>Comparison Criteria</th>
                {columns.map((c) => <th key={c.key} scope="col">{headerBlock(c)}</th>)}
              </tr>
            </thead>
            {sections.map((sec) => (
              <tbody key={sec.id}>
                <tr><th scope="colgroup" colSpan={columns.length + 1} className={styles.sectionRow}>{sec.title}</th></tr>
                {sec.fields.map((f) => (
                  <tr key={f.key}>
                    <th scope="row" className={styles.stickyCol}>{f.label}{mark(f)}</th>
                    {columns.map((c) => <td key={c.key} className={cellClass(c, f)}>{cell(c, f)}</td>)}
                  </tr>
                ))}
              </tbody>
            ))}
            <tbody>
              <tr>
                <th scope="row" className={styles.stickyCol}>Actions</th>
                {columns.map((c) => <td key={c.key}>{actions(c)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>

        <ul className={q.compareCards} aria-label="Products side by side">
          {columns.map((c) => (
            <li key={c.key} className={q.compareCard}>
              {headerBlock(c)}
              {c.available && (
                <dl className={q.termRows}>
                  {shown.map((f) => <div key={f.key}><dt>{f.label}{mark(f)}</dt><dd className={cellClass(c, f)}>{cell(c, f)}</dd></div>)}
                </dl>
              )}
              {actions(c)}
            </li>
          ))}
        </ul>

        {data.emptyLabels.length > 0 && <p className={d.muted}>Not available for these products, so not shown: {data.emptyLabels.join(", ").toLowerCase()}.</p>}
        <p className={d.muted}>&ldquo;Differs&rdquo; marks a row where the products state different values. A missing value is shown as Not Provided, never as zero. Nothing is ranked: &ldquo;Lowest listed&rdquo; only points out the smallest number when the currency and unit are the same. Choose by what matters for your order, then ask the supplier for a quote.</p>
      </section>

      {target && (
        <ConfirmDialog
          title={target.kind === "all" ? "Clear your comparison?" : "Remove from comparison?"}
          message={`${target.kind === "all" ? "All products will be removed from your comparison." : `${target.column.name} will be removed from your comparison.`} Your saved products and the catalogue are not affected.${error ? ` ${error}` : ""}`}
          confirmLabel={busy ? "Removing..." : target.kind === "all" ? "Clear all" : "Remove"}
          cancelLabel="Keep it"
          tone="danger"
          busy={busy}
          onConfirm={() => void confirm()}
          onCancel={() => setTarget(null)}
        />
      )}
    </>
  );
}
