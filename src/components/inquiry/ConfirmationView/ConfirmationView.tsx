import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CircleHelp, ClipboardList, FileText, Package, Plus, Route, Search, Star } from "lucide-react";
import clsx from "clsx";
import { CopyReference } from "@/components/inquiry/CopyReference";
import { InquiryTimeline } from "@/components/inquiry/InquiryTimeline";
import { TrustBenefits } from "@/components/homepage/TrustBenefits";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Container } from "@/components/ui/Container";
import type { ConfirmationDto } from "@/lib/inquiries/confirmation";
import { formatCount } from "@/lib/utils/format";
import styles from "./ConfirmationView.module.css";

const LONG_MESSAGE = 280;

/**
 * Page 14: what was actually saved, who may see it, and what happens next. Every value comes from the saved inquiry
 * (never from the address or from the form). The hero repeats exactly what is true: the inquiry is saved; the supplier is
 * told only when a notification really went out, which the notification line states.
 */
export function ConfirmationView({ data }: { data: ConfirmationDto }) {
  const guest = data.viewer === "guest";
  const { supplier, product } = data;
  const anotherHref = supplier.slug ? `/inquiry/${supplier.slug}${product?.available && product.slug ? `?product=${encodeURIComponent(product.slug)}` : ""}` : "/suppliers";
  const requirementHref = supplier.slug ? `/post-requirement?supplier=${encodeURIComponent(supplier.slug)}` : "/post-requirement";
  const notice = data.notification.state === "not_configured" || data.notification.state === "failed" || data.notification.state === "retry";

  return (
    <>
      <section className={styles.hero} aria-labelledby="confirmation-heading">
        <Container>
          <div className={styles.crumbs}>
            <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Suppliers", href: "/suppliers" }, ...(supplier.url ? [{ label: supplier.name, href: supplier.url }] : [{ label: supplier.name }]), { label: "Inquiry Confirmation" }]} />
          </div>
          <div className={styles.heroGrid}>
            <div className={styles.heroMain}>
              <span className={styles.check} aria-hidden>
                <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="m7.5 12.5 3 3 6-6.5" />
                </svg>
              </span>
              <div className={styles.heroText}>
                <h1 id="confirmation-heading" className={styles.title}>
                  Inquiry Submitted Successfully!
                </h1>
                <p className={styles.lead}>
                  Your inquiry to {supplier.name} has been saved.{" "}
                  {data.notification.state === "sent" ? "A notification was handed to the delivery provider." : data.notification.state === "pending" || data.notification.state === "processing" ? "Supplier notification is being processed." : "The supplier is not told automatically yet, so a reply time cannot be promised."}{" "}
                  Keep your reference to identify this request.
                </p>
                <div className={styles.reference}>
                  <p className={styles.referenceText}>
                    <span className={styles.referenceLabel}>Inquiry Reference:</span> <strong data-testid="reference">{data.reference}</strong>
                  </p>
                  <CopyReference reference={data.reference} />
                </div>
              </div>
            </div>
            {supplier.photos.length > 0 && (
              <ul className={styles.photos} aria-label={`Products from ${supplier.name}`}>
                {supplier.photos.map((photo) => (
                  <li key={photo.src} className={styles.photo}>
                    <Image src={photo.src} alt={photo.alt} fill sizes="(max-width: 900px) 30vw, 180px" unoptimized={photo.remote} className={styles.photoImage} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Container>
      </section>

      <Container>
        <div className={styles.columns}>
          <section className={styles.card} aria-labelledby="details-heading">
            <h2 id="details-heading" className={styles.cardTitle}>
              <FileText size={26} strokeWidth={1.6} aria-hidden />
              Inquiry Details
            </h2>
            <dl className={styles.details}>
              <div>
                <dt>Inquiry Reference</dt>
                <dd>{data.reference}</dd>
              </div>
              <div>
                <dt>Inquiry Type</dt>
                <dd>
                  <span className={styles.typeBadge}>{data.inquiryTypeLabel}</span>
                </dd>
              </div>
              <div>
                <dt>Supplier</dt>
                <dd>{supplier.url ? <Link href={supplier.url}>{supplier.name}</Link> : supplier.name}</dd>
              </div>
              <div>
                <dt>Product</dt>
                <dd>
                  {product ? (
                    <span className={styles.product}>
                      <span className={styles.productImage}>
                        {product.imageSrc ? <Image src={product.imageSrc} alt={product.name} fill sizes="72px" unoptimized={product.imageRemote} className={styles.productImg} /> : <Package size={26} strokeWidth={1.5} aria-hidden />}
                      </span>
                      <span className={styles.productText}>
                        {product.url ? <Link href={product.url}>{product.name}</Link> : product.name}
                        {product.price && (
                          <span className={styles.productMeta}>
                            {product.price}
                            {product.unit ? ` / ${product.unit}` : ""}
                            {product.moq ? ` · MOQ ${product.moq}` : ""}
                          </span>
                        )}
                        {!product.available && <span className={styles.productMeta}>This product is no longer listed. The inquiry keeps its name.</span>}
                      </span>
                    </span>
                  ) : (
                    "General Supplier Inquiry"
                  )}
                </dd>
              </div>
              <div>
                <dt>Quantity</dt>
                <dd>
                  {data.quantity.toLocaleString("en-IN")} {data.unit ?? ""}
                </dd>
              </div>
              <div>
                <dt>Expected Delivery</dt>
                <dd>{data.deliveryLocation ?? "Not specified"}</dd>
              </div>
              <div>
                <dt>Your Message</dt>
                <dd>
                  {data.message ? (
                    data.message.length > LONG_MESSAGE ? (
                      <details className={styles.more}>
                        <summary>
                          <span className={styles.preview}>{data.message.slice(0, LONG_MESSAGE).trimEnd()}…</span>
                          <span className={styles.toggle}>Show the full message</span>
                        </summary>
                        <p className={styles.message}>{data.message}</p>
                      </details>
                    ) : (
                      <p className={styles.message}>{data.message}</p>
                    )
                  ) : (
                    "No message"
                  )}
                </dd>
              </div>
              <div>
                <dt>Submitted On</dt>
                <dd>
                  <time dateTime={data.submittedAt}>{data.submittedLabel}</time> (IST)
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={clsx(styles.status, (data.status === "CANCELLED" || data.status === "REJECTED") && styles.statusOff)}>{data.statusLabel}</span>
                  <span className={styles.statusText}>{data.statusText}</span>
                </dd>
              </div>
            </dl>
          </section>

          <section className={styles.card} aria-labelledby="next-heading">
            <h2 id="next-heading" className={styles.cardTitle}>
              <Route size={26} strokeWidth={1.6} aria-hidden />
              What Happens Next?
            </h2>
            <InquiryTimeline steps={data.timeline} />
            <p className={clsx(styles.notification, notice && styles.notificationNote)} role="note">
              {data.notification.label}
            </p>
          </section>
        </div>

        <div className={styles.actions}>
          {guest ? (
            <p className={styles.guestNote} role="note">
              <strong>Tracking:</strong> guest inquiries cannot be tracked online yet. This page works for an hour on the browser you sent it from. <Link href={`/sign-in?next=${encodeURIComponent("/buyer/inquiries")}`}>Sign in or create an account</Link> to track future inquiries.
            </p>
          ) : (
            <>
              <Link href={`/buyer/inquiries#ref-${data.reference}`} className={clsx(styles.action, styles.actionPrimary)}>
                <Search size={20} aria-hidden />
                Track This Inquiry
              </Link>
              <Link href="/buyer/inquiries" className={styles.action}>
                <ClipboardList size={20} aria-hidden />
                View My Inquiries
              </Link>
            </>
          )}
          <Link href={anotherHref} className={styles.action}>
            <Plus size={20} aria-hidden />
            Send Another Inquiry
          </Link>
        </div>

        <section className={styles.supplier} aria-labelledby="supplier-summary-heading">
          <span className={styles.logo} aria-hidden>
            {supplier.initials}
          </span>
          <div className={styles.supplierMain}>
            <h2 id="supplier-summary-heading" className={styles.supplierName}>
              {supplier.name}
              {supplier.verified && <Badge variant="success" icon>Verified Supplier</Badge>}
            </h2>
            <p className={styles.supplierMeta}>{[supplier.kind, supplier.location].filter(Boolean).join(" · ") || "Supplier details are not available"}</p>
          </div>
          {supplier.rating && (
            <p className={styles.rating}>
              <Star size={18} fill="currentColor" strokeWidth={0} aria-hidden />
              <strong>{supplier.rating.average.toFixed(1)}</strong> ({formatCount(supplier.rating.count)} {supplier.rating.count === 1 ? "Review" : "Reviews"})
            </p>
          )}
          {supplier.url && (
            <Link href={supplier.url} className={styles.profile}>
              View Supplier Profile
              <ArrowRight size={16} aria-hidden />
            </Link>
          )}
        </section>

        <div className={styles.panels}>
          <section className={clsx(styles.panel, styles.help)} aria-labelledby="help-heading">
            <span className={styles.panelIcon} aria-hidden>
              <CircleHelp size={44} strokeWidth={1.4} />
            </span>
            <div>
              <h2 id="help-heading" className={styles.panelTitle}>
                Need Help with Your Inquiry?
              </h2>
              <p className={styles.panelText}>
                Keep your reference <strong>{data.reference}</strong> ready. Help-centre, support-ticket and live-chat pages are not available yet, so there is no support button here to press.
              </p>
            </div>
          </section>
          <section className={clsx(styles.panel, styles.requirement)} aria-labelledby="more-heading">
            <span className={styles.panelIcon} aria-hidden>
              <Package size={44} strokeWidth={1.4} />
            </span>
            <div>
              <h2 id="more-heading" className={styles.panelTitle}>
                Have More Requirements?
              </h2>
              <p className={styles.panelText}>Share additional or bulk requirements and tell us what you need.</p>
              <Link href={requirementHref} className={styles.requirementCta}>
                Post Your Requirement
                <ArrowRight size={18} aria-hidden />
              </Link>
            </div>
          </section>
        </div>
      </Container>

      <div className={styles.trust}>
        <TrustBenefits overlap={false} />
      </div>
    </>
  );
}
