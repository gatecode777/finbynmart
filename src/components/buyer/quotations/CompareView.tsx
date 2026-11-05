import Link from "next/link";
import { ArrowLeft, BadgeCheck, TriangleAlert } from "lucide-react";
import type { Comparison } from "@/lib/quotations/service";
import d from "../inquiries/detail/InquiryDetail.module.css";
import { PrintButton } from "./PrintButton";
import { QuotationStatusPill } from "./QuotationStatusPill";
import q from "./Quotations.module.css";

const val = (v: string | null) => (v ? v : <span className={q.missing}>Not Provided</span>);

/**
 * Two to four quotations of ONE inquiry side by side: a table on wide screens and one card per quotation on narrow ones (same data).
 * Rows whose values differ are marked with the word "Differs" (not colour alone). Nothing is ranked and no "best value" is claimed:
 * the buyer judges price against delivery, payment and the other terms, and the notices say where the offers are not like for like.
 */
export function CompareView({ data }: { data: Comparison }) {
  const { columns, fields, compatibility: c } = data;
  return (
    <>
      <div className={`${d.headerActions} ${d.noPrint}`}>
        <Link href="/buyer/quotations" className={d.btn}><ArrowLeft size={18} aria-hidden /> Back to Quotations</Link>
        {data.inquiry && <Link href={data.inquiry.href} className={d.btn}>View Inquiry {data.inquiry.reference}</Link>}
        <PrintButton />
      </div>

      {c.mismatches.map((m) => (
        <p key={m.field} className={`${q.notice} ${q.noticeDanger}`} role="status"><TriangleAlert size={16} aria-hidden /> {m.note}</p>
      ))}
      {c.priceComparable && <p className={`${q.notice} ${q.noticeInfo}`} role="status">These quotations use the same currency, unit and quantity, so their amounts are like for like. Check delivery, payment and the other terms too: the lowest price is not automatically the best offer, and nothing here is ranked.</p>}

      <section className={d.card} aria-labelledby="compare-title">
        <h2 id="compare-title" className={d.cardTitle}>Compare Quotations ({columns.length})</h2>
        <div className={q.compareWrap}>
          <table className={q.compareTable}>
            <caption className="visually-hidden">Quotations for the same inquiry, side by side</caption>
            <thead>
              <tr>
                <th scope="col">Details</th>
                {columns.map((col) => (
                  <th key={col.reference} scope="col">
                    <Link href={col.detailHref} className={d.link}>{col.reference}</Link> <span className={d.muted}>V{col.version}</span>
                    <br />{col.supplier.name}{col.supplier.verified && <> <BadgeCheck size={14} aria-hidden /> <span className="visually-hidden">Verified supplier</span></>}
                    <br /><QuotationStatusPill status={col.status} label={col.statusLabel} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => (
                <tr key={f.key}>
                  <th scope="row">{f.label}{f.differs && <span className={q.differsMark}>Differs</span>}</th>
                  {columns.map((col) => <td key={col.reference} className={f.differs ? q.differs : undefined}>{val(col.values[f.key] ?? null)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className={q.compareCards} aria-label="Quotations side by side">
          {columns.map((col) => (
            <li key={col.reference} className={q.compareCard}>
              <h3 className={d.productName}><Link href={col.detailHref} className={d.link}>{col.reference}</Link> V{col.version} - {col.supplier.name}</h3>
              <QuotationStatusPill status={col.status} label={col.statusLabel} />
              <dl className={q.termRows}>
                {fields.map((f) => <div key={f.key}><dt>{f.label}{f.differs && <span className={q.differsMark}>Differs</span>}</dt><dd>{val(col.values[f.key] ?? null)}</dd></div>)}
              </dl>
            </li>
          ))}
        </ul>
        <p className={d.muted}>&ldquo;Differs&rdquo; marks a row where the quotations do not all say the same. Missing values are shown as Not Provided, not assumed. To decide, open a quotation.</p>
      </section>
    </>
  );
}
