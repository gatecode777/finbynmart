"use client";

import { KeyboardEvent, useId, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Check } from "lucide-react";
import type { ProductDetail, ProductSpec } from "@/lib/catalog/productDetail";
import styles from "./ProductTabs.module.css";

interface ProductTabsProps {
  name: string;
  description: string | null;
  features: string[];
  specifications: ProductSpec[];
  technicalDetails: ProductSpec[];
  applications: string[];
  documents: ProductDetail["documents"];
}

type TabId = "details" | "specs" | "technical" | "applications" | "documents" | "reviews";

function SpecTable({ rows }: { rows: ProductSpec[] }) {
  const sorted = [...rows].sort((a, b) => a.displayOrder - b.displayOrder);
  return (
    <table className={styles.table}>
      <tbody>
        {sorted.map((row) => (
          <tr key={`${row.group}-${row.label}`}>
            <th scope="row">{row.label}</th>
            <td>
              {row.value}
              {row.unit ? ` ${row.unit}` : ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Product detail tabs. One consistent rule for empty content: Product Details, Specifications and Reviews are
 * always present (with a plain explanation when there is nothing yet); Technical Details, Applications and
 * Documents appear only when the product has them. Nothing is generated: there is no description, technical,
 * application, document or review data in the project today.
 */
export function ProductTabs({ name, description, features, specifications, technicalDetails, applications, documents }: ProductTabsProps) {
  const base = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const tabs = useMemo(() => {
    const list: { id: TabId; label: string }[] = [
      { id: "details", label: "Product Details" },
      { id: "specs", label: "Specifications" },
    ];
    if (technicalDetails.length) list.push({ id: "technical", label: "Technical Details" });
    if (applications.length) list.push({ id: "applications", label: "Applications" });
    if (documents.length) list.push({ id: "documents", label: "Documents" });
    list.push({ id: "reviews", label: "Reviews" });
    return list;
  }, [technicalDetails.length, applications.length, documents.length]);

  const [active, setActive] = useState<TabId>("details");

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    const next = event.key === "ArrowRight" ? (index === last ? 0 : index + 1) : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1) : event.key === "Home" ? 0 : event.key === "End" ? last : null;
    if (next === null) return;
    event.preventDefault();
    setActive(tabs[next].id);
    refs.current[tabs[next].id]?.focus();
  };

  return (
    <section className={styles.tabs} aria-label="Product information">
      <div className={styles.list} role="tablist" aria-label="Product information">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(element) => {
              refs.current[tab.id] = element;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`${base}-panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            className={clsx(styles.tab, active === tab.id && styles.active)}
            onClick={() => setActive(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {tabs.map((tab) => (
        <div key={tab.id} role="tabpanel" id={`${base}-panel-${tab.id}`} aria-labelledby={`${base}-tab-${tab.id}`} hidden={active !== tab.id} className={styles.panel}>
          {tab.id === "details" && (
            <div className={styles.detailsGrid}>
              <div>
              <h2 className={styles.heading}>Product Description</h2>
              {description ? (
                description.split(/\n{2,}/).map((paragraph) => <p key={paragraph}>{paragraph}</p>)
              ) : (
                <p className={styles.empty}>The supplier has not added a description for {name} yet. Use Send Inquiry to ask about it.</p>
              )}
              {features.length > 0 && (
                <ul className={styles.features}>
                  {features.map((feature) => (
                    <li key={feature}>
                      <Check size={16} aria-hidden />
                      {feature}
                    </li>
                  ))}
                </ul>
              )}
              </div>
              {specifications.length > 0 && (
                <div>
                  <h2 className={styles.heading}>Key Specifications</h2>
                  <SpecTable rows={specifications} />
                </div>
              )}
            </div>
          )}

          {tab.id === "specs" && (
            <>
              <h2 className={styles.heading}>Key Specifications</h2>
              {specifications.length ? <SpecTable rows={specifications} /> : <p className={styles.empty}>No specifications are listed for this product yet.</p>}
            </>
          )}

          {tab.id === "technical" && (
            <>
              <h2 className={styles.heading}>Technical Details</h2>
              <SpecTable rows={technicalDetails} />
            </>
          )}

          {tab.id === "applications" && (
            <>
              <h2 className={styles.heading}>Applications</h2>
              <ul className={styles.features}>
                {applications.map((item) => (
                  <li key={item}>
                    <Check size={16} aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </>
          )}

          {tab.id === "documents" && (
            <>
              <h2 className={styles.heading}>Documents</h2>
              <ul className={styles.docs}>
                {documents.map((doc) => (
                  <li key={doc.url}>
                    <a href={doc.url} rel="noopener noreferrer" target="_blank">
                      {doc.name} <span>({doc.type})</span>
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}

          {tab.id === "reviews" && (
            <>
              <h2 className={styles.heading}>Reviews</h2>
              <p className={styles.empty}>No reviews have been published for this product yet.</p>
            </>
          )}
        </div>
      ))}
    </section>
  );
}
