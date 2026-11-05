import Link from "next/link";
import { ArrowRight, FileText, Lock, PackageSearch, Send } from "lucide-react";
import styles from "./InquiryAside.module.css";

const REASONS = [
  { icon: Send, title: "Straight to this supplier", text: "Your inquiry is addressed to this supplier only, with your quantity and requirement." },
  { icon: FileText, title: "Ask in writing", text: "Request price, minimum order and availability, and keep a reference number." },
  { icon: PackageSearch, title: "Product details", text: "Describe specifications and ask for product information for your application." },
  { icon: Lock, title: "Private", text: "Your details are used for this inquiry and are not shown publicly." },
];

/**
 * "Why Send Inquiry?" and the bulk-requirement card. Worded to promise only what the platform does today: it saves the
 * inquiry and gives a reference; it does not yet notify suppliers or guarantee a reply time or a price.
 */
export function InquiryAside({ requirementHref }: { requirementHref: string }) {
  return (
    <>
      <section className={styles.why} aria-labelledby="why-inquiry-heading">
        <h2 id="why-inquiry-heading" className={styles.title}>
          Why Send Inquiry?
        </h2>
        <ul className={styles.list}>
          {REASONS.map(({ icon: Icon, title, text }) => (
            <li key={title} className={styles.item}>
              <span className={styles.icon} aria-hidden>
                <Icon size={26} strokeWidth={1.6} />
              </span>
              <div>
                <h3 className={styles.itemTitle}>{title}</h3>
                <p className={styles.itemText}>{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.bulk} aria-labelledby="bulk-heading">
        <h2 id="bulk-heading" className={styles.title}>
          Need a Bulk Requirement?
        </h2>
        <p className={styles.bulkText}>Share large quantities or custom requirements and tell us what you need.</p>
        <Link href={requirementHref} className={styles.cta}>
          Post Your Requirement
          <ArrowRight size={18} strokeWidth={2.25} aria-hidden />
        </Link>
      </section>
    </>
  );
}
