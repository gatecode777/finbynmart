"use client";

import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, LayoutGrid, Search, X } from "lucide-react";
import clsx from "clsx";
import type { CategoryNode } from "@/types";
import { CategoryCard } from "@/components/category/CategoryCard";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterDrawer } from "@/components/ui/FilterDrawer";
import { Select } from "@/components/ui/Select";
import { searchText, searchTokens } from "@/lib/catalog/slug";
import { formatCount } from "@/lib/utils/format";
import { FALLBACK_ICON, SIDEBAR_ICONS } from "./sidebarIcons";
import styles from "./CategoryExplorer.module.css";

const PAGE_SIZE = 15;
const DEBOUNCE_MS = 200;

type SortKey = "popular" | "name";

interface CategoryExplorerProps {
  nodes: CategoryNode[];
  initialSelected: string | null;
  initialQuery: string;
}

/**
 * Search, sidebar and grid for /categories. The server passes the whole (small) directory once;
 * searching, selecting and sorting then happen locally with no further requests. State is mirrored
 * to `?c=` and `?q=` so a view can be shared, and every control also works as a normal link.
 */
export function CategoryExplorer({ nodes, initialSelected, initialQuery }: CategoryExplorerProps) {
  const searchId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(initialSelected);
  const [query, setQuery] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(initialQuery);
  const [sort, setSort] = useState<SortKey>("popular");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initialSelected ? [initialSelected.split("/")[0]] : []));
  const mounted = useRef(false);

  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const mains = useMemo(() => nodes.filter((node) => node.parentId === null), [nodes]);

  const trailOf = (node: CategoryNode): string[] => {
    const names: string[] = [];
    for (let parent = node.parentId ? byId.get(node.parentId) : undefined; parent; parent = parent.parentId ? byId.get(parent.parentId) : undefined) {
      names.unshift(parent.name);
    }
    return names;
  };

  // Searchable text: name, its parents, and the description only where it is written copy (curated),
  // not the auto-generated "N products" sentences, which would match every query for "products".
  const haystack = useMemo(
    () => new Map(nodes.map((node) => [node.id, searchText(`${node.name} ${trailOf(node).join(" ")} ${node.source === "curated" ? node.description : ""}`)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes],
  );

  const tokens = useMemo(() => searchTokens(activeQuery), [activeQuery]);
  const searching = tokens.length > 0;
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;

  // Debounce typing, then apply.
  useEffect(() => {
    const timer = window.setTimeout(() => setActiveQuery(query), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Mirror the view into the URL without a navigation.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const params = new URLSearchParams();
    if (selectedId) params.set("c", selectedId);
    if (activeQuery.trim()) params.set("q", activeQuery.trim());
    const search = params.toString();
    window.history.replaceState(null, "", search ? `/categories?${search}` : "/categories");
    setVisible(PAGE_SIZE);
  }, [selectedId, activeQuery]);

  const list = useMemo(() => {
    let base: CategoryNode[];
    if (searching) base = nodes.filter((node) => tokens.every((token) => haystack.get(node.id)?.includes(token)));
    else if (selected) base = selected.childIds.flatMap((id) => byId.get(id) ?? []);
    else base = mains;
    return [...base].sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name) : b.productCount - a.productCount || a.name.localeCompare(b.name),
    );
  }, [searching, tokens, haystack, nodes, selected, byId, mains, sort]);

  const shown = list.slice(0, visible);
  const remaining = list.length - shown.length;

  function select(id: string | null) {
    setSelectedId(id);
    setQuery("");
    setActiveQuery("");
    if (id) setExpanded((current) => new Set(current).add(id.split("/")[0]));
  }

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveQuery(query);
  }

  function clearSearch() {
    setQuery("");
    setActiveQuery("");
  }

  const heading = searching
    ? `Results for “${activeQuery.trim()}”`
    : selected
      ? selected.name
      : "All Categories";

  const plainClick = (event: React.MouseEvent) => event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0;

  return (
    <>
      <Container>
        <form className={styles.search} role="search" onSubmit={onSubmit}>
          <label htmlFor={searchId} className={styles.searchLabel}>
            <Search size={26} strokeWidth={2} aria-hidden />
            Find a Category
          </label>
          <div className={styles.searchField}>
            <input
              id={searchId}
              type="search"
              className={styles.searchInput}
              placeholder="Search categories (e.g. Machinery, Packaging, Tshirts...)"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
              enterKeyHint="search"
            />
            {query && (
              <button type="button" className={styles.clear} onClick={clearSearch} aria-label="Clear search">
                <X size={18} strokeWidth={2} aria-hidden />
              </button>
            )}
          </div>
          <Button type="submit" className={styles.searchButton}>
            <Search size={17} strokeWidth={2} aria-hidden />
            Search
          </Button>
        </form>
      </Container>

      <Container>
        <div className={styles.layout}>
          <FilterDrawer breakpoint="lg" label="Browse Categories">
            <nav className={styles.sidebar} aria-label="Browse categories">
              <h2 className={styles.sideTitle}>Browse Categories</h2>
              <ul className={styles.sideList}>
                <li>
                  <Link
                    href="/categories"
                    data-drawer-close
                    className={clsx(styles.row, !selected && !searching && styles.active)}
                    aria-current={!selected && !searching ? "true" : undefined}
                    onClick={(event) => {
                      if (plainClick(event)) return;
                      event.preventDefault();
                      select(null);
                    }}
                  >
                    <span className={styles.rowName}>All Categories ({formatCount(mains.length)})</span>
                    <ChevronRight size={16} aria-hidden />
                  </Link>
                </li>

                {mains.map((main) => {
                  const hasChildren = main.childIds.length > 0;
                  const open = expanded.has(main.id);
                  const isActive = selectedId === main.id && !searching;
                  const inBranch = selectedId?.startsWith(`${main.id}/`) && !searching;

                  if (!hasChildren) {
                    return (
                      <li key={main.id}>
                        <Link href={main.href} className={styles.row}>
                          <MainIcon id={main.iconKey} />
                          <span className={styles.rowName}>{main.name}</span>
                          <ChevronRight size={16} aria-hidden />
                        </Link>
                      </li>
                    );
                  }

                  return (
                    <li key={main.id}>
                      <div className={clsx(styles.rowWrap, (isActive || inBranch) && styles.branchActive)}>
                        <Link
                          href={`/categories?c=${encodeURIComponent(main.id)}`}
                          data-drawer-close
                          className={clsx(styles.row, isActive && styles.active)}
                          aria-current={isActive ? "true" : undefined}
                          onClick={(event) => {
                            if (plainClick(event)) return;
                            event.preventDefault();
                            select(main.id);
                          }}
                        >
                          <MainIcon id={main.iconKey} />
                          <span className={styles.rowName}>{main.name}</span>
                        </Link>
                        <button
                          type="button"
                          className={styles.toggle}
                          aria-expanded={open}
                          aria-label={`${open ? "Collapse" : "Expand"} ${main.name} subcategories`}
                          onClick={() => toggle(main.id)}
                        >
                          <ChevronDown size={16} className={clsx(styles.chevron, open && styles.chevronOpen)} aria-hidden />
                        </button>
                      </div>
                      {open && (
                        <ul className={styles.children}>
                          {main.childIds.map((childId) => {
                            const child = byId.get(childId);
                            if (!child) return null;
                            const childActive = (selectedId === child.id || selectedId?.startsWith(`${child.id}/`)) && !searching;
                            return (
                              <li key={child.id}>
                                <Link
                                  href={`/categories?c=${encodeURIComponent(child.id)}`}
                                  data-drawer-close
                                  className={clsx(styles.row, styles.childRow, childActive && styles.active)}
                                  aria-current={selectedId === child.id && !searching ? "true" : undefined}
                                  onClick={(event) => {
                                    if (plainClick(event)) return;
                                    event.preventDefault();
                                    select(child.id);
                                  }}
                                >
                                  <span className={styles.rowName}>{child.name}</span>
                                  <ChevronRight size={14} aria-hidden />
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </nav>
          </FilterDrawer>

          <section className={styles.main} aria-labelledby="category-grid-heading">
            <div className={styles.mainHeader}>
              <div className={styles.titleBlock}>
                <h2 id="category-grid-heading" className={styles.gridTitle}>
                  {heading} <span className={styles.gridCount}>({formatCount(list.length)})</span>
                </h2>
                {selected && !searching && (
                  <Link href={selected.href} className={styles.viewAll}>
                    View all {formatCount(selected.productCount)} {selected.productCount === 1 ? "product" : "products"}
                    <ChevronRight size={16} aria-hidden />
                  </Link>
                )}
                {searching && (
                  <button type="button" className={styles.textButton} onClick={clearSearch}>
                    Clear search
                  </button>
                )}
              </div>
              {list.length > 1 && (
                <div className={styles.sort}>
                  <span className={styles.sortLabel} aria-hidden>Sort By:</span>
                  <Select
                    label="Sort by"
                    hideLabel
                    value={sort}
                    onChange={(event) => setSort(event.target.value as SortKey)}
                    options={[
                      { label: "Popular", value: "popular" },
                      { label: "Name (A–Z)", value: "name" },
                    ]}
                  />
                </div>
              )}
            </div>

            <p className="visually-hidden" role="status" aria-live="polite">
              {formatCount(list.length)} {list.length === 1 ? "category" : "categories"} shown
            </p>

            {nodes.length === 0 ? (
              <EmptyState title="No categories are available yet">
                Categories appear here as soon as they have active products.
              </EmptyState>
            ) : list.length === 0 ? (
              <EmptyState
                title={`No categories match “${activeQuery.trim()}”`}
                actions={
                  <Button type="button" variant="secondary" onClick={clearSearch}>
                    Clear search
                  </Button>
                }
              >
                Try a different word, or browse all categories from the list.
              </EmptyState>
            ) : (
              <>
                <ul className={styles.grid}>
                  {shown.map((node) => (
                    <li key={node.id}>
                      <CategoryCard
                        node={node}
                        onExplore={select}
                        context={searching ? trailOf(node).join(" › ") || undefined : undefined}
                      />
                    </li>
                  ))}
                  {remaining > 0 && (
                    <li>
                      <button type="button" className={styles.viewAllTile} onClick={() => setVisible((count) => count + PAGE_SIZE)}>
                        <LayoutGrid size={30} strokeWidth={1.5} aria-hidden />
                        <span className={styles.viewAllText}>View All Categories</span>
                        <span className={styles.viewAllMeta}>{formatCount(remaining)} more</span>
                        <span className={styles.viewAllArrow} aria-hidden>
                          <ChevronRight size={18} strokeWidth={2.25} />
                        </span>
                      </button>
                    </li>
                  )}
                </ul>
              </>
            )}
          </section>
        </div>
      </Container>
    </>
  );
}

function MainIcon({ id }: { id?: string }) {
  const Icon = (id && SIDEBAR_ICONS[id]) || FALLBACK_ICON;
  return <Icon size={18} strokeWidth={1.75} className={styles.rowIcon} aria-hidden />;
}
