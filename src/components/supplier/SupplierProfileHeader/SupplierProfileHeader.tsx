import Image from "next/image";
import clsx from "clsx";
import { CalendarDays, MapPin, MessageSquare, ShoppingBag, Boxes, Star } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Container } from "@/components/ui/Container";
import { ShareButton } from "@/components/ui/ShareButton";
import { SupplierSaveButton } from "@/components/ui/WishlistButton";
import { formatCount } from "@/lib/utils/format";
import type { SupplierDetail } from "@/lib/catalog/supplierDetail";
import styles from "./SupplierProfileHeader.module.css";

/**
 * Top of a supplier profile: breadcrumb, logo (initials: no genuine logos exist), name, the verification badge only
 * where a record says so, supplier type and industry, location, membership year and the real product count, the four
 * actions, and up to three photos of the supplier's own products on the right (never a stock picture of a "factory").
 */
export function SupplierProfileHeader({ supplier, breadcrumbLast, rating }: { supplier: SupplierDetail; /** Extra last crumb for a sub-page such as Products; the supplier then links to its profile. */ breadcrumbLast?: string; /** Average and count of PUBLISHED reviews, only when there are some. */ rating?: { average: number; count: number } }) {
  // The inquiry form lives on the profile, so on a sub-page its buttons go there.
  const formBase = breadcrumbLast ? supplier.url : "";
  const kind = [supplier.supplierType, supplier.industry].filter(Boolean).join(" • ");

  return (
    <section className={clsx(styles.header, breadcrumbLast && styles.compact)} aria-labelledby="supplier-heading">
      <Container>
        <div className={styles.crumbs}>
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "Suppliers", href: "/suppliers" },
              breadcrumbLast ? { label: supplier.name, href: supplier.url } : { label: supplier.name },
              ...(breadcrumbLast ? [{ label: breadcrumbLast }] : []),
            ]}
          />
        </div>
      </Container>

      <Container>
        <div className={styles.grid}>
          <div className={styles.main}>
            <span className={styles.logo} aria-hidden>
              {supplier.initials}
            </span>
            <div className={styles.identity}>
              <div className={styles.titleRow}>
                <h1 id="supplier-heading" className={styles.title}>
                  {supplier.name}
                </h1>
                {supplier.verificationStatus === "verified" && <Badge variant="success" icon>Verified Supplier</Badge>}
              </div>
              {kind && <p className={styles.kind}>{kind}</p>}
              <ul className={styles.meta}>
                <li>
                  <MapPin size={16} strokeWidth={2} aria-hidden />
                  {supplier.city}, {supplier.state}
                </li>
                {supplier.memberSince && (
                  <li>
                    <CalendarDays size={16} strokeWidth={2} aria-hidden />
                    Member since {supplier.memberSince}
                  </li>
                )}
                <li>
                  <Boxes size={16} strokeWidth={2} aria-hidden />
                  {formatCount(supplier.productCount)} {supplier.productCount === 1 ? "Product" : "Products"}
                </li>
                {rating && (
                  <li>
                    <Star size={16} strokeWidth={2} fill="currentColor" aria-hidden />
                    {rating.average.toFixed(1)} ({formatCount(rating.count)} {rating.count === 1 ? "Review" : "Reviews"})
                  </li>
                )}
              </ul>

              <div className={styles.actions}>
                <a href={`${formBase}#send-inquiry`} className={styles.primary}>
                  <MessageSquare size={18} aria-hidden />
                  Send Inquiry
                </a>
                <a href={`${formBase}#get-best-quote`} className={styles.accent}>
                  <ShoppingBag size={18} aria-hidden />
                  Get Best Quote
                </a>
                <SupplierSaveButton supplierId={supplier.id} supplierName={supplier.name} />
                <ShareButton title={supplier.name} path={supplier.url} />
              </div>
            </div>
          </div>

          {supplier.images.length > 0 && (
            <ul className={styles.photos} aria-label={`Products from ${supplier.name}`}>
              {supplier.images.map((image) => (
                <li key={image.src} className={styles.photo}>
                  <Image src={image.src} alt={image.alt} fill sizes="(max-width: 900px) 30vw, 180px" unoptimized={image.remote} className={styles.photoImage} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Container>
    </section>
  );
}
