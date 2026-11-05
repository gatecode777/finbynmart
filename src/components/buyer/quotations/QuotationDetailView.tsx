import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, FileText, History, ListChecks, MapPin, Package, Paperclip, Scale, Truck } from "lucide-react";
import type { QuotationDetail } from "@/lib/quotations/service";
import d from "../inquiries/detail/InquiryDetail.module.css";
import { QuotationActions } from "./QuotationActions";
import { QuotationStatusPill } from "./QuotationStatusPill";
import q from "./Quotations.module.css";

export const TABS = [
  { key: "details", label: "Quotation Details", icon: FileText },
  { key: "compare", label: "Compare Quotations", icon: Scale },
  { key: "history", label: "Revision History", icon: History },
  { key: "inquiry", label: "Inquiry & Timeline", icon: ListChecks },
  { key: "messages", label: "Messages", icon: Package },
] as const;
export type TabKey = (typeof TABS)[number]["key"];

const val = (v: string | null) => (v ? <span>{v}</span> : <span className={q.missing}>Not Provided</span>);
const size = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** One quotation, from what the database holds (a snapshot per version). Anything not saved says "Not Provided"; nothing is filled in. */
export function QuotationDetailView({ data: x, tab }: { data: QuotationDetail; tab: TabKey }) {
  const qt = x.quotation;
  const current = x.versions.find((v) => v.isCurrent);
  const compareHref = x.related.length > 0 ? `/buyer/quotations/compare?refs=${[qt.reference, ...x.related.map((r) => r.reference)].slice(0, 4).join(",")}` : null;
  const taxNote = qt.total && !qt.total.taxSpecified ? " (before tax; no tax stated)" : "";

  return (
    <>
      <QuotationActions
        summary={{ reference: qt.reference, version: qt.version, supplierName: x.supplier.name, quantityText: `${qt.quantity.toLocaleString("en-IN")}${qt.unit ? ` ${qt.unit}` : ""}`, unitPrice: `${qt.unitPrice}${qt.unit ? ` / ${qt.unit}` : ""}`, totalText: qt.total?.text ?? null, taxNote, validLabel: qt.validLabel }}
        can={{ accept: x.capabilities.accept, reject: x.capabilities.reject, requestRevision: x.capabilities.requestRevision }}
        compareHref={compareHref}
      />

      {!qt.isCurrent && (
        <p className={`${q.notice} ${q.noticeInfo}`} role="status">
          You are viewing version {qt.version}, an earlier version. {current ? <>The current version is {current.version}: <Link href={`/buyer/quotations/${qt.reference}`} className={d.link}>open it</Link>.</> : null} Decisions apply only to the current version.
        </p>
      )}
      {x.decision && <p className={`${q.notice} ${q.noticeInfo}`} role="status">{x.decision.type === "ACCEPTED" ? "You accepted this quotation" : "You rejected this quotation"} on {x.decision.atLabel}.{x.decision.reason ? ` Reason: ${x.decision.reason}` : ""}{x.decision.type === "ACCEPTED" ? " Order processing is not available yet; this recorded your decision only." : ""}</p>}
      {x.pendingRevision && <p className={`${q.notice} ${q.noticeInfo}`} role="status">You asked for a revision on {x.pendingRevision.atLabel} ({x.pendingRevision.reason}): {x.pendingRevision.message} The supplier is not notified automatically yet, so a new version cannot be expected through this site.</p>}
      {qt.status === "EXPIRED" && <p className={`${q.notice} ${q.noticeDanger}`} role="status">This quotation expired on {qt.validLabel} and can no longer be accepted.</p>}

      <nav aria-label="Quotation sections" className={d.noPrint}>
        <ul className={`${d.tabList} ${q.tabs}`}>
          {TABS.map(({ key, label, icon: Icon }) => (
            <li key={key}>
              <Link href={`/buyer/quotations/${qt.reference}?${new URLSearchParams({ ...(qt.isCurrent ? {} : { version: String(qt.version) }), tab: key })}`} className={`${d.tab} ${tab === key ? d.tabActive : ""}`} aria-current={tab === key ? "page" : undefined}>
                <Icon size={18} aria-hidden /> {label}{key === "compare" && x.related.length > 0 ? ` (${x.related.length + 1})` : ""}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className={d.grid}>
        <div className={d.main}>
          <section className={d.card} aria-labelledby="qsummary-title">
            <div className={d.overview}>
              <span className={d.thumb} aria-hidden>
                {qt.product.imageSrc ? <Image src={qt.product.imageSrc} alt="" width={120} height={120} unoptimized={qt.product.imageRemote} /> : <Package size={40} />}
              </span>
              <div className={d.overviewText}>
                <p className={d.refBadge}>Quotation Reference</p>
                <h2 id="qsummary-title" className={`${d.reference} ${q.refTitle}`}>{qt.reference} <span className={d.muted}>V{qt.version}{qt.isCurrent ? " (current)" : ""}</span></h2>
                <p className={d.productName}>{qt.productName}</p>
                <p className={d.muted}>Against inquiry <Link href={x.inquiry.href} className={d.link}>{x.inquiry.reference}</Link></p>
                <p className={d.muted}>{x.supplier.url ? <Link href={x.supplier.url} className={d.link}>{x.supplier.name}</Link> : x.supplier.name}{x.supplier.verified && <> <BadgeCheck size={14} aria-hidden /> Verified</>}</p>
              </div>
              <dl className={d.dates}>
                <div><dt>Quotation Date</dt><dd><time dateTime={qt.sentAt}>{qt.sentLabel}</time></dd></div>
                <div><dt>Valid Till</dt><dd><time dateTime={qt.validUntil}>{qt.validLabel}</time>{qt.status !== "EXPIRED" && qt.isCurrent && qt.daysLeft > 0 ? ` (${qt.daysLeft} days left)` : ""}</dd></div>
                <div><dt>Delivery</dt><dd>{qt.delivery ?? "Not Provided"}</dd></div>
              </dl>
              <div className={d.statusBox}>
                <p className={d.muted}>Current Status</p>
                <QuotationStatusPill status={qt.status} label={qt.statusLabel} />
                <p className={d.muted}>{qt.statusText}</p>
              </div>
            </div>
          </section>

          {tab === "details" && (
            <>
              <div className={q.twoCol}>
                <section className={d.card} aria-labelledby="price-title">
                  <h2 id="price-title" className={d.cardTitle}><FileText size={20} aria-hidden /> Price &amp; Order Details</h2>
                  {x.priceBreakdown.error ? <p className={`${q.notice} ${q.noticeDanger}`} role="alert">{x.priceBreakdown.error}</p> : (
                    <dl className={q.priceRows}>
                      {x.priceBreakdown.rows.map((r) => <div key={r.label} className={r.strong ? q.strong : undefined}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}
                    </dl>
                  )}
                  <p className={d.muted}>Amounts are shown exactly as quoted ({qt.currency}); nothing is converted or added that the quotation does not state.</p>
                </section>
                <section className={d.card} aria-labelledby="terms-title">
                  <h2 id="terms-title" className={d.cardTitle}><Truck size={20} aria-hidden /> Commercial Terms</h2>
                  <dl className={q.termRows}>
                    {x.commercialTerms.map((r) => <div key={r.label}><dt>{r.label}</dt><dd>{val(r.value)}</dd></div>)}
                  </dl>
                </section>
              </div>

              <section className={d.card} aria-labelledby="spec-title">
                <h2 id="spec-title" className={d.cardTitle}><ListChecks size={20} aria-hidden /> Specification &amp; Details</h2>
                {x.productSnapshot.specs.length === 0 && !x.productSnapshot.description && x.productSnapshot.features.length === 0 ? (
                  <p className={d.muted}>The supplier did not include product specifications in this quotation (Not Provided).</p>
                ) : (
                  <>
                    {x.productSnapshot.specs.length > 0 && (
                      <table className={q.specTable}>
                        <caption className="visually-hidden">Product specifications</caption>
                        <tbody>{x.productSnapshot.specs.map((s) => <tr key={s.label}><th scope="row">{s.label}</th><td>{s.value}</td></tr>)}</tbody>
                      </table>
                    )}
                    {x.productSnapshot.description && <p className={d.text}>{x.productSnapshot.description}</p>}
                    {x.productSnapshot.features.length > 0 && <ul className={q.featureList}>{x.productSnapshot.features.map((f) => <li key={f}>{f}</li>)}</ul>}
                  </>
                )}
                <p className={d.muted}>These are the specifications saved with this version; later catalogue changes do not alter them.</p>
              </section>

              <section className={d.card} aria-labelledby="att-title">
                <h2 id="att-title" className={d.cardTitle}><Paperclip size={20} aria-hidden /> Attachments</h2>
                {x.attachments.length === 0 ? (
                  <p className={d.muted}>No attachments.</p>
                ) : (
                  <>
                    <ul className={q.featureList}>{x.attachments.map((a) => <li key={a.id}>{a.name} ({a.type.toUpperCase()}, {size(a.size)})</li>)}</ul>
                    <p className={d.muted}>Opening or downloading quotation files is not available yet (there is no private file delivery for quotations), so only their names are listed.</p>
                  </>
                )}
              </section>
            </>
          )}

          {tab === "compare" && (
            <section className={d.card} aria-labelledby="cmp-title">
              <h2 id="cmp-title" className={d.cardTitle}><Scale size={20} aria-hidden /> Related Quotations for {x.inquiry.reference}</h2>
              {x.related.length === 0 ? (
                <p className={d.muted}>There is no other quotation for this inquiry to compare with.</p>
              ) : (
                <>
                  <ul className={`${d.steps} ${q.plainList}`}>
                    <li><strong>{qt.reference}</strong> - {x.supplier.name} - {qt.unitPrice}{qt.unit ? ` / ${qt.unit}` : ""} - {qt.statusLabel} (this one)</li>
                    {x.related.map((r) => <li key={r.reference}><Link href={r.href} className={d.link}>{r.reference}</Link> - {r.supplierName} - {r.unitPrice} - {r.statusLabel}</li>)}
                  </ul>
                  {compareHref && <Link href={compareHref} className={d.btn}><Scale size={18} aria-hidden /> Compare these quotations</Link>}
                  <p className={d.muted}>Comparing only places the offers side by side. It accepts nothing and ranks nothing.</p>
                </>
              )}
            </section>
          )}

          {tab === "history" && (
            <section className={d.card} aria-labelledby="hist-title">
              <h2 id="hist-title" className={d.cardTitle}><History size={20} aria-hidden /> Quotation Version History ({x.versions.length})</h2>
              <div className={q.tableScroll}>
                <table className={q.versionTable}>
                  <caption className="visually-hidden">Versions of this quotation</caption>
                  <thead><tr><th scope="col">Version</th><th scope="col">Received</th><th scope="col">Unit price</th><th scope="col">Total</th><th scope="col">Valid till</th><th scope="col">Changes</th><th scope="col">Status</th></tr></thead>
                  <tbody>
                    {x.versions.map((v) => (
                      <tr key={v.version}>
                        <td><Link href={v.href} className={d.link}>V{v.version}</Link>{v.isCurrent ? " (current)" : ""}</td>
                        <td>{v.sentLabel}</td>
                        <td>{v.unitPrice}</td>
                        <td>{v.total ?? "Not available"}</td>
                        <td>{v.validLabel}</td>
                        <td>{v.version === 1 ? "Original quotation" : v.changes.length > 0 ? v.changes.join(", ") : "No change in the saved terms"}</td>
                        <td>{v.statusLabel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3 className={`${d.cardTitle} ${q.afterTable}`}>Events on version {qt.version}</h3>
              <ol className={d.history}>
                {x.events.map((e, i) => <li key={i}><strong>{e.label}</strong>{e.detail ? ` - ${e.detail}` : ""} <time className={d.muted}>{e.atLabel}</time></li>)}
              </ol>
              <p className={d.muted}>Earlier versions are never changed. A revision from the supplier would appear here as a new version.</p>
            </section>
          )}

          {tab === "inquiry" && (
            <>
              <section className={d.card} aria-labelledby="inq-title">
                <h2 id="inq-title" className={d.cardTitle}>Inquiry Progress</h2>
                <ol className={d.history}>
                  {x.timeline.map((s) => <li key={s.key}><strong>{s.title}</strong> {s.state === "done" ? "(done)" : "(not yet)"} - {s.text}{s.atLabel ? <> <time className={d.muted}>{s.atLabel}</time></> : null}</li>)}
                </ol>
                <p className={d.muted}>Only recorded events are shown. An order step appears when order processing exists.</p>
              </section>
              <section className={d.card} aria-labelledby="inq2-title">
                <h2 id="inq2-title" className={d.cardTitle}>Related Inquiry</h2>
                <dl className={d.rows}>
                  <div><dt>Inquiry Reference</dt><dd><Link href={x.inquiry.href} className={d.link}>{x.inquiry.reference}</Link></dd></div>
                  <div><dt>Inquiry Type</dt><dd>{x.inquiry.typeLabel}</dd></div>
                  <div><dt>Requested Quantity</dt><dd>{x.inquiry.quantity.toLocaleString("en-IN")}{x.inquiry.unit ? ` ${x.inquiry.unit}` : ""}</dd></div>
                  <div><dt>Delivery Location</dt><dd>{x.inquiry.deliveryLocation ?? "Not Specified"}</dd></div>
                  <div><dt>Inquiry Status</dt><dd>{x.inquiry.statusLabel}</dd></div>
                </dl>
                <Link href={x.inquiry.href} className={d.btn}>View Inquiry</Link>
              </section>
            </>
          )}

          {tab === "messages" && (
            <section className={d.card} aria-labelledby="msg-title">
              <h2 id="msg-title" className={d.cardTitle}>Messages</h2>
              <p className={d.muted}>Messaging is not available yet, so there is no conversation about this quotation and no Message Supplier action.</p>
            </section>
          )}
        </div>

        <aside className={d.side} aria-label="Quotation context">
          <section className={d.card} aria-labelledby="sup-title">
            <h2 id="sup-title" className={d.cardTitle}>Supplier Information</h2>
            <div className={d.supplier}>
              <span className={d.initials} aria-hidden>{x.supplier.initials}</span>
              <div>
                <p className={d.productName}>{x.supplier.url ? <Link href={x.supplier.url}>{x.supplier.name}</Link> : x.supplier.name}</p>
                {x.supplier.verified && <p className={d.metaLine}><BadgeCheck size={14} aria-hidden /> Verified Supplier</p>}
                {x.supplier.location && <p className={d.metaLine}><MapPin size={14} aria-hidden /> {x.supplier.location}</p>}
                {x.supplier.kind && <p className={d.muted}>{x.supplier.kind}</p>}
              </div>
            </div>
            {x.supplier.url ? <Link href={x.supplier.url} className={d.btn}>View Supplier Profile</Link> : <p className={d.muted}>This supplier has no public page.</p>}
          </section>

          <section className={d.card} aria-labelledby="qi-title">
            <h2 id="qi-title" className={d.cardTitle}>Inquiry</h2>
            <dl className={d.rows}>
              <div><dt>Inquiry Reference</dt><dd><Link href={x.inquiry.href} className={d.link}>{x.inquiry.reference}</Link></dd></div>
              <div><dt>Inquiry Type</dt><dd>{x.inquiry.typeLabel}</dd></div>
              <div><dt>Inquiry Status</dt><dd>{x.inquiry.statusLabel}</dd></div>
            </dl>
          </section>

          <section className={d.card} aria-labelledby="vh-title">
            <h2 id="vh-title" className={d.cardTitle}>Versions</h2>
            <ul className={`${d.steps} ${q.plainList}`}>
              {x.versions.map((v) => <li key={v.version}><Link href={v.href} className={d.link}>V{v.version}</Link> - {v.sentLabel} - {v.statusLabel}{v.isCurrent ? " (current)" : ""}</li>)}
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
