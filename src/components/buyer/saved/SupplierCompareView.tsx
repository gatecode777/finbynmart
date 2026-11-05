import Link from "next/link";
import { ArrowLeft, MessageSquare } from "lucide-react";
import type { SupplierComparison } from "@/lib/wishlist/savedSuppliers";
import inq from "../inquiries/Inquiries.module.css";
import d from "../inquiries/detail/InquiryDetail.module.css";
import q from "../quotations/Quotations.module.css";

const val = (v: string | null | undefined) => (v ? v : <span className={q.missing}>Not Provided</span>);

/**
 * Two to four of the buyer's own saved suppliers side by side: a table from 900px, one card per supplier below (same data). Rows
 * where the suppliers differ carry the word "Differs". Missing values say Not Provided. Nothing is scored, ranked or called best, and
 * a verified and an unverified supplier are just shown as they are.
 */
export function SupplierCompareView({ data }: { data: SupplierComparison }) {
  const { columns, fields } = data;
  return (
    <>
      <div className={`${d.headerActions} ${d.noPrint}`}>
        <Link href="/buyer/saved-suppliers" className={d.btn}><ArrowLeft size={18} aria-hidden /> Back to Saved Suppliers</Link>
      </div>
      <section className={d.card} aria-labelledby="compare-suppliers-title">
        <h2 id="compare-suppliers-title" className={d.cardTitle}>Compare Suppliers ({columns.length})</h2>
        <div className={q.compareWrap}>
          <table className={q.compareTable}>
            <caption className="visually-hidden">Suppliers side by side</caption>
            <thead>
              <tr>
                <th scope="col">Details</th>
                {columns.map((c) => <th key={c.key} scope="col">{c.url ? <Link href={c.url} className={d.link}>{c.name}</Link> : c.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => (
                <tr key={f.key}>
                  <th scope="row">{f.label}{f.differs && <span className={q.differsMark}>Differs</span>}</th>
                  {columns.map((c) => <td key={c.key} className={f.differs ? q.differs : undefined}>{val(c.values[f.key])}</td>)}
                </tr>
              ))}
              <tr>
                <th scope="row">Actions</th>
                {columns.map((c) => <td key={c.key}>{c.inquiryHref ? <Link href={c.inquiryHref} className={`${inq.btn} ${inq.btnPrimary}`}><MessageSquare size={16} aria-hidden /> Contact Supplier</Link> : "-"}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
        <ul className={q.compareCards} aria-label="Suppliers side by side">
          {columns.map((c) => (
            <li key={c.key} className={q.compareCard}>
              <h3 className={d.productName}>{c.url ? <Link href={c.url} className={d.link}>{c.name}</Link> : c.name}</h3>
              <dl className={q.termRows}>
                {fields.map((f) => <div key={f.key}><dt>{f.label}{f.differs && <span className={q.differsMark}>Differs</span>}</dt><dd>{val(c.values[f.key])}</dd></div>)}
              </dl>
              {c.inquiryHref && <Link href={c.inquiryHref} className={`${inq.btn} ${inq.btnPrimary}`}><MessageSquare size={16} aria-hidden /> Contact Supplier</Link>}
            </li>
          ))}
        </ul>
        <p className={d.muted}>&ldquo;Differs&rdquo; marks a row where the suppliers do not all say the same. Missing values are shown as Not Provided, not assumed. There is no score or ranking: supplier records hold no ratings, reviews, capacity or response data to rank by.</p>
      </section>
    </>
  );
}
