import Form from "next/form";
import Link from "next/link";
import { ChevronDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FilterCheckList } from "@/components/category/CategoryFilters";
import type { CertificationView } from "@/lib/certifications/engine";
import { NO_CERT_FILTERS, certificationHref, type CertificationQuery } from "@/lib/certifications/query";
import styles from "@/components/category/CategoryFilters/CategoryFilters.module.css";
import local from "./CertificationFilters.module.css";

interface CertificationFiltersProps {
  basePath: string;
  query: CertificationQuery;
  facets: CertificationView["facets"];
  activeFilters: number;
}

function Group({ title, children, open }: { title: string; children: React.ReactNode; open: boolean }) {
  return (
    <details className={styles.group} open={open}>
      <summary className={styles.summary}>
        {title}
        <ChevronDown size={16} className={styles.chevron} aria-hidden />
      </summary>
      <div className={styles.groupBody}>{children}</div>
    </details>
  );
}

/**
 * Filter sidebar for one supplier's certifications: a plain GET form (a filtered view is a shareable URL and works
 * without JavaScript) that reuses the look of the product filters. Groups come from the supplier's own records.
 */
export function CertificationFilters({ basePath, query, facets, activeFilters }: CertificationFiltersProps) {
  const clearHref = certificationHref(basePath, query, NO_CERT_FILTERS);

  return (
    <Form key={certificationHref(basePath, query)} className={`${styles.form} ${local.tight}`} action={basePath} aria-label="Filter certifications">
      {query.sort !== "newest" && <input type="hidden" name="sort" value={query.sort} />}
      {query.limit !== undefined && <input type="hidden" name="limit" value={query.limit} />}

      <div className={styles.header}>
        <span className={`${styles.heading} ${local.heading}`}>
          <Filter size={18} strokeWidth={2} aria-hidden />
          Filter Certifications
          {activeFilters > 0 && <span className={styles.count} aria-label={`${activeFilters} active filters`}>{activeFilters}</span>}
        </span>
        {activeFilters > 0 ? (
          <Link href={clearHref} className={styles.clear} data-drawer-close>
            Clear All
          </Link>
        ) : (
          <span className={styles.clearOff}>Clear All</span>
        )}
      </div>

      <Group title="Verification Status" open>
        <FilterCheckList name="status" options={facets.status} selected={query.status} />
      </Group>

      {facets.type.length > 0 && (
        <Group title="Certification Type" open>
          <FilterCheckList name="type" options={facets.type} selected={query.type} />
        </Group>
      )}

      {facets.authority.length > 0 && (
        <Group title="Issuing Authority" open>
          <FilterCheckList name="authority" options={facets.authority} selected={query.authority} searchPlaceholder={facets.authority.length > 8 ? "Search authority..." : undefined} />
        </Group>
      )}

      <Group title="Expiry" open={query.expiry.length > 0}>
        <FilterCheckList name="expiry" options={facets.expiry} selected={query.expiry} />
      </Group>

      <Button type="submit" className={styles.apply}>
        Apply Filters ({activeFilters})
      </Button>
    </Form>
  );
}
