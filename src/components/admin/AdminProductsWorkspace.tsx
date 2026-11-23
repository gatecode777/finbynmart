"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, ExternalLink, Info, Package, Search, X } from "lucide-react";
import { flashToast } from "@/components/ui/Toast";
import auth from "@/components/auth/Auth.module.css";
import prof from "@/components/supplier/profile/SupplierProfile.module.css";
import { Dropdown } from "@/components/ui/Dropdown";
import { EMPTY_QUERY, LISTING_STATUSES, SORTS, UNPUBLISH_REASON, isFiltered, parseQuery, statusLabel, toParams, validateUnpublishReason, type ProductDetail, type ProductListQuery, type ProductListResponse, type ProductRow } from "@/lib/admin/productList";
import s from "./AdminInquiries.module.css";
import p from "./AdminProducts.module.css";

type View = { kind: "loading" } | { kind: "unavailable" } | { kind: "denied" } | { kind: "error"; message: string } | { kind: "ok"; data: ProductListResponse };
type DetailView = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ok"; detail: ProductDetail };

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/** The only place that talks to the (future) read API: GET /api/admin/products and GET /api/admin/products/<reference>. 404, 405 and 501 mean "not built yet", not "empty". */
async function liveList(q: ProductListQuery, signal: AbortSignal): Promise<View> {
  const res = await fetch(`/api/admin/products?${toParams(q)}`, { cache: "no-store", signal }).catch((e) => (signal.aborted ? null : e));
  if (!res || res instanceof Error || !("status" in res)) return signal.aborted ? { kind: "loading" } : { kind: "error", message: "Network error. Check your connection and retry." };
  if ([404, 405, 501].includes(res.status)) return { kind: "unavailable" };
  if (res.status === 401 || res.status === 403) return { kind: "denied" };
  const json = res.ok ? await res.json().catch(() => null) : null;
  if (json?.ok && Array.isArray(json.data?.items)) return { kind: "ok", data: json.data as ProductListResponse };
  return { kind: "error", message: "The product list could not be loaded." };
}
async function liveDetail(reference: string, signal: AbortSignal): Promise<DetailView> {
  const res = await fetch(`/api/admin/products/${encodeURIComponent(reference)}`, { cache: "no-store", signal }).catch(() => null);
  const json = res?.ok ? await res.json().catch(() => null) : null;
  return json?.ok ? { kind: "ok", detail: json.data as ProductDetail } : { kind: "error", message: "The product details could not be loaded." };
}

function Thumb({ url, name, size = 48 }: { url: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={p.thumb} style={{ width: size, height: size }}>
      {url && !failed ? <Image src={url} alt={name} fill sizes={`${size}px`} style={{ objectFit: "cover" }} onError={() => setFailed(true)} /> : <Package size={size / 2} aria-label="No image" role="img" />}
    </span>
  );
}

function StatusBadge({ row }: { row: Pick<ProductRow, "status" | "pendingChanges"> }) {
  return (
    <span className={p.badges}>
      <span className={`${s.badge} ${p[`tone_${row.status}`]}`}>{statusLabel(row.status)}</span>
      {row.pendingChanges && <span className={`${s.badge} ${p.tone_PENDING_REVIEW}`}>Pending changes</span>}
    </span>
  );
}

export function AdminProductsWorkspace({ demo, canExport, canReview }: { demo: boolean; canExport: boolean; canReview: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = parseQuery(new URLSearchParams(params.toString()));
  const key = toParams(query).toString();
  const uid = useId();

  const [view, setView] = useState<View>({ kind: "loading" });
  const [tick, setTick] = useState(0);
  const [qInput, setQInput] = useState(query.q);
  const facets = useRef<ProductListResponse["facets"]>({ categories: [], suppliers: [] });
  const abort = useRef<AbortController | null>(null);

  const go = useCallback((next: ProductListQuery) => {
    const qs = toParams(next).toString();
    router.replace(qs ? `${pathname}?${qs}${demo ? "&preview=demo" : ""}` : demo ? `${pathname}?preview=demo` : pathname, { scroll: false });
  }, [router, pathname, demo]);

  // debounced search: the URL (and so the request) changes 300 ms after typing stops
  useEffect(() => {
    if (qInput.trim() === query.q.trim()) return;
    const t = setTimeout(() => go({ ...query, q: qInput, page: 1 }), 300);
    return () => clearTimeout(t);
  }, [qInput]); // eslint-disable-line react-hooks/exhaustive-deps

  // load whenever the URL state changes; the previous request is cancelled
  useEffect(() => {
    abort.current?.abort();
    const ctl = (abort.current = new AbortController());
    setView({ kind: "loading" });
    void (async () => {
      const next = demo ? await (await import("@/lib/admin/productListDemo")).demoList(query).then((data): View => ({ kind: "ok", data })) : await liveList(query, ctl.signal);
      if (ctl.signal.aborted) return;
      if (next.kind === "ok") facets.current = next.data.facets;
      setView(next);
    })();
    return () => ctl.abort();
  }, [key, demo, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- details drawer and unpublish dialog (native <dialog>: focus trap, Escape and focus return come from the browser)
  const drawer = useRef<HTMLDialogElement>(null);
  const confirm = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<DetailView | null>(null);
  const [openRow, setOpenRow] = useState<ProductRow | null>(null);
  const detailAbort = useRef<AbortController | null>(null);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [demoNote, setDemoNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState("");
  const [exporting, setExporting] = useState(false);

  function openDetails(row: ProductRow) {
    setOpenRow(row);
    setDetail({ kind: "loading" });
    drawer.current?.showModal();
    detailAbort.current?.abort();
    const ctl = (detailAbort.current = new AbortController());
    void (async () => {
      const d: DetailView = demo
        ? await (await import("@/lib/admin/productListDemo")).demoDetail(row.reference).then((x): DetailView => (x ? { kind: "ok", detail: x } : { kind: "error", message: "The product details could not be loaded." }))
        : await liveDetail(row.reference, ctl.signal);
      if (!ctl.signal.aborted) setDetail(d);
    })();
  }
  function openUnpublish(row: ProductRow) {
    setOpenRow(row);
    setReason("");
    setTouched(false);
    setDemoNote(false);
    setServerError("");
    confirm.current?.showModal();
  }
  const reasonError = touched ? validateUnpublishReason(reason) : null;
  async function confirmClick() {
    setTouched(true);
    if (validateUnpublishReason(reason) || busy) return;
    // demo mode only demonstrates the validation and says nothing happened
    if (demo) { setDemoNote(true); return; }
    const d = detail?.kind === "ok" ? detail.detail : null;
    if (!d || d.revision === null) { setServerError("Reload the product details and try again."); return; }
    setBusy(true);
    setServerError("");
    const res = await fetch(`/api/admin/products/${encodeURIComponent(d.reference)}/unpublish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, expectedRevision: d.revision }) }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (res?.ok && json.ok) {
      // success is shown only after the server confirmed it; the list and the drawer are then reloaded from the server
      flashToast("success", json.message ?? "The listing was unpublished.");
      confirm.current?.close();
      drawer.current?.close();
      setTick((t) => t + 1);
      return;
    }
    const msg = res ? (json.fields?.reason ?? json.message ?? "The listing could not be unpublished.") : "Network error. Nothing was changed. Check your connection and retry.";
    setServerError(msg);
    flashToast("error", "Not unpublished. " + msg);
    if (res?.status === 409) setTick((t) => t + 1);
  }

  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    const res = await fetch("/api/admin/products/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: query.q, status: query.status, category: query.category, supplier: query.supplier, sort: query.sort }) }).catch(() => null);
    setExporting(false);
    if (!res?.ok) { flashToast("error", res ? "The export could not be created." : "Network error. The export was not created."); return; }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "products.csv";
    a.click();
    URL.revokeObjectURL(a.href);
    flashToast("success", res.headers.get("X-Export-Truncated") === "true" ? `Exported the first ${res.headers.get("X-Export-Cap") ?? "5,000"} products; narrow the filters for the rest.` : "Export ready.");
  }
  const closeOnBackdrop = (ref: React.RefObject<HTMLDialogElement | null>) => (e: React.MouseEvent<HTMLDialogElement>) => { if (e.target === ref.current) ref.current?.close(); };

  const data = view.kind === "ok" ? view.data : null;
  const filtered = isFiltered(query);
  const clear = () => { setQInput(""); go({ ...EMPTY_QUERY }); };
  const statusOptions = [{ value: "", label: "All statuses" }, ...LISTING_STATUSES.map((x) => ({ value: x.value, label: x.label }))];
  const categoryOptions = [{ value: "", label: "All categories" }, ...facets.current.categories];
  const supplierOptions = [{ value: "", label: "All suppliers" }, ...facets.current.suppliers];
  const first = data ? (data.meta.page - 1) * data.meta.limit + 1 : 0;

  return (
    <>
      {demo && <p className={p.demo} role="note"><Info size={16} aria-hidden /> Frontend preview: these are illustrative demo records, not real admin data. Filtering and paging here run locally in the browser to demonstrate the screen. Nothing is saved.</p>}

      <p className={p.muted} style={{ margin: "0 0 .75rem" }}><Info size={14} aria-hidden /> Lists supplier-created products that were submitted or published. The legacy catalogue (CSV) has no unpublish mechanism and is not listed here.</p>
      {canExport && !demo && <div className={s.exportRow}><button type="button" className={prof.btnSecondary} onClick={() => void exportCsv()} disabled={exporting}><Download size={16} aria-hidden /> {exporting ? "Preparing..." : "Export"}</button></div>}

      <div className={p.bar} role="search" aria-label="Filter products">
        <div className={s.search}>
          <label htmlFor={`${uid}-q`} className={s.sr}>Search by product name, SKU or reference</label>
          <Search size={16} aria-hidden className={s.searchIcon} />
          <input id={`${uid}-q`} className={auth.control} placeholder="Product name, SKU or reference" value={qInput} maxLength={80} onChange={(e) => setQInput(e.target.value)} />
        </div>
        <div className={p.filterGrid}>
          <div><label htmlFor={`${uid}-cat`} className={p.lbl}>Category</label><Dropdown id={`${uid}-cat`} value={query.category} options={categoryOptions} onChange={(v) => go({ ...query, category: v, page: 1 })} /></div>
          <div><label htmlFor={`${uid}-sup`} className={p.lbl}>Supplier</label><Dropdown id={`${uid}-sup`} value={query.supplier} options={supplierOptions} onChange={(v) => go({ ...query, supplier: v, page: 1 })} /></div>
          <div><label htmlFor={`${uid}-st`} className={p.lbl}>Listing status</label><Dropdown id={`${uid}-st`} value={query.status} options={statusOptions} onChange={(v) => go({ ...query, status: v as ProductListQuery["status"], page: 1 })} /></div>
          <div><label htmlFor={`${uid}-so`} className={p.lbl}>Sort</label><Dropdown id={`${uid}-so`} value={query.sort} options={SORTS.map((x) => ({ value: x.value, label: x.label }))} onChange={(v) => go({ ...query, sort: v as ProductListQuery["sort"], page: 1 })} /></div>
        </div>
        <button type="button" className={s.clear} onClick={clear} disabled={!filtered && query.sort === "updated"}>Clear filters</button>
      </div>

      <p className={s.sr} role="status" aria-live="polite">{view.kind === "loading" ? "Loading products" : data ? `${data.items.length} products shown` : ""}</p>

      {view.kind === "unavailable" && (
        <section className={s.panel} aria-label="Product list unavailable">
          <p className={s.empty}><strong>The product list isn&apos;t available yet.</strong><br />The admin product list service is not connected, so no products can be shown. This is not an empty catalogue. Pending submissions can still be decided in <Link prefetch={false} href="/admin/product-review">Product review</Link>.</p>
        </section>
      )}
      {view.kind === "denied" && <section className={s.panel}><p className={s.empty} role="alert">Your account is not allowed to view product listings.</p></section>}
      {view.kind === "error" && <p role="alert" className={s.err}>{view.message} <button type="button" className={prof.btnSecondary} onClick={() => setTick((t) => t + 1)}>Retry</button></p>}

      {(view.kind === "loading" || data) && (
        <section className={`${s.panel} ${view.kind === "loading" ? s.busy : ""}`} aria-label="Products" aria-busy={view.kind === "loading"}>
          {view.kind === "loading" ? (
            <ul className={p.skeleton} aria-hidden>{[0, 1, 2, 3].map((i) => <li key={i} />)}</ul>
          ) : data && data.items.length === 0 ? (
            <p className={s.empty}>{filtered ? "No products match these filters." : "No products have been submitted or published yet."}</p>
          ) : data ? (
            <>
              <table className={s.table}>
                <caption className={s.sr}>Products</caption>
                <thead><tr><th scope="col">Product</th><th scope="col">Supplier</th><th scope="col">Category</th><th scope="col">Price &amp; MOQ</th><th scope="col">Listing status</th><th scope="col">Updated</th><th scope="col">Actions</th></tr></thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r.reference} className={openRow?.reference === r.reference && drawer.current?.open ? s.rowOn : undefined}>
                      <th scope="row"><span className={p.prod}><Thumb url={r.imageUrl} name={r.name} /><span><strong>{r.name}</strong><br /><span className={p.muted}>{r.sku ? `SKU: ${r.sku}` : `Ref: ${r.reference}`}</span></span></span></th>
                      <td>{r.company}</td>
                      <td>{r.category}</td>
                      <td>{r.priceText ?? "Not provided"}{r.moqText && <><br /><span className={p.muted}>{r.moqText}</span></>}</td>
                      <td><StatusBadge row={r} /></td>
                      <td>{fmt(r.updatedAt)}</td>
                      <td>
                        <span className={p.actions}>
                          <button type="button" className={prof.btnSecondary} onClick={() => openDetails(r)} aria-label={`View ${r.name}`}>View</button>
                          {(r.status === "PENDING_REVIEW" || r.pendingChanges) && <Link prefetch={false} href="/admin/product-review" className={prof.btnSecondary} aria-label={`Review ${r.name}`}>Review</Link>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className={s.cards} aria-label="Products">
                {data.items.map((r) => (
                  <li key={r.reference} className={s.card}>
                    <div className={p.prod}><Thumb url={r.imageUrl} name={r.name} size={56} /><span><strong>{r.name}</strong><br /><span className={p.muted}>{r.sku ? `SKU: ${r.sku}` : `Ref: ${r.reference}`}</span></span></div>
                    <dl className={s.facts}>
                      <div><dt>Supplier</dt><dd>{r.company}</dd></div>
                      <div><dt>Category</dt><dd>{r.category}</dd></div>
                      <div><dt>Price</dt><dd>{r.priceText ?? "Not provided"}{r.moqText ? ` · ${r.moqText}` : ""}</dd></div>
                      <div><dt>Updated</dt><dd>{fmt(r.updatedAt)}</dd></div>
                    </dl>
                    <StatusBadge row={r} />
                    <span className={p.actions}>
                      <button type="button" className={prof.btnSecondary} onClick={() => openDetails(r)} aria-label={`View ${r.name}`}>View</button>
                      {(r.status === "PENDING_REVIEW" || r.pendingChanges) && <Link prefetch={false} href="/admin/product-review" className={prof.btnSecondary} aria-label={`Review ${r.name}`}>Review</Link>}
                    </span>
                  </li>
                ))}
              </ul>
              <div className={s.pager}>
                <span>{data.meta.total !== null ? `Showing ${first}–${first + data.items.length - 1} of ${data.meta.total.toLocaleString("en-IN")}${demo ? " preview records" : ""}` : `Page ${data.meta.page}`}</span>
                <span className={s.pagerBtns}>
                  <button type="button" className={prof.btnSecondary} disabled={data.meta.page <= 1} onClick={() => go({ ...query, page: data.meta.page - 1 })}>Previous</button>
                  <button type="button" className={prof.btnSecondary} disabled={!data.meta.hasMore} onClick={() => go({ ...query, page: data.meta.page + 1 })}>Next</button>
                </span>
              </div>
            </>
          ) : null}
        </section>
      )}

      {/* ---------- details drawer ---------- */}
      <dialog ref={drawer} className={p.drawer} aria-labelledby={`${uid}-dt`} onClick={closeOnBackdrop(drawer)} onClose={() => detailAbort.current?.abort()}>
        <div className={p.drawerBody}>
          <header className={p.drawerHead}>
            <h2 id={`${uid}-dt`} className={p.drawerTitle}>Product details</h2>
            <button type="button" className={p.iconBtn} onClick={() => drawer.current?.close()} aria-label="Close product details"><X size={20} aria-hidden /></button>
          </header>
          {detail?.kind === "loading" && <p role="status">Loading product details...</p>}
          {detail?.kind === "error" && <p role="alert" className={s.err}>{detail.message} {openRow && <button type="button" className={prof.btnSecondary} onClick={() => openDetails(openRow)}>Retry</button>}</p>}
          {detail?.kind === "ok" && (() => {
            const d = detail.detail;
            return (
              <>
                <div className={p.prod}><Thumb url={d.images[0]?.url ?? d.imageUrl} name={d.name} size={96} /><span><strong className={p.dName}>{d.name}</strong><br /><span className={p.muted}>{d.sku ? `SKU: ${d.sku} · ` : ""}Ref: {d.reference}</span><br /><span className={p.muted}>Supplier: {d.company}</span></span></div>
                <StatusBadge row={d} />
                <dl className={p.defs}>
                  <div><dt>Category</dt><dd>{d.category}</dd></div>
                  <div><dt>Price</dt><dd>{d.priceText ?? "Not provided"}</dd></div>
                  <div><dt>Minimum order</dt><dd>{d.moqText ?? "Not provided"}</dd></div>
                  <div><dt>Last updated</dt><dd>{fmt(d.updatedAt)}</dd></div>
                  {d.approvedAt && <div><dt>Approved</dt><dd>{fmt(d.approvedAt)}</dd></div>}
                  {d.unpublishedAt && <div><dt>Unpublished</dt><dd>{fmt(d.unpublishedAt)}</dd></div>}
                </dl>
                <h3 className={p.h3}>Specifications</h3>
                {d.specifications.length ? <dl className={p.specs}>{d.specifications.map((x) => <div key={x.label}><dt>{x.label}</dt><dd>{x.value}</dd></div>)}</dl> : <p className={p.muted}>No specifications were provided for this listing.</p>}
                <p className={p.muted}>{d.visibilityNote}{d.status === "PUBLISHED" ? " The content above is the approved version." : ""}{d.pendingChanges ? ` A newer revision${d.pending ? ` (revision ${d.pending.revision}, submitted ${fmt(d.pending.submittedAt)})` : ""} is pending review; the live listing still shows the approved version.` : ""}</p>
                {d.unpublishReason && <p className={p.muted}>Unpublish reason (internal): {d.unpublishReason}</p>}
                <div className={p.drawerActions}>
                  {d.publicUrl ? <Link prefetch={false} href={d.publicUrl} className={prof.btnSecondary} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} aria-hidden /> View public listing</Link> : <span className={p.muted}>No public listing: {d.visibilityNote.replace(/^Not public: /, "").replace(/^Not public\.$/, "it is not public")}</span>}
                  {canReview && <Link prefetch={false} href="/admin/product-review" className={prof.btnSecondary}>Open Product Review</Link>}
                  {d.actions.unpublish && <button type="button" className={prof.btnSecondary} onClick={() => openUnpublish(d)}>Unpublish</button>}
                </div>
              </>
            );
          })()}
        </div>
      </dialog>

      {/* ---------- unpublish confirmation (no mutation in this version) ---------- */}
      <dialog ref={confirm} className={p.dialog} aria-labelledby={`${uid}-ut`} onClick={closeOnBackdrop(confirm)}>
        <form method="dialog" className={p.dialogBody} onSubmit={(e) => e.preventDefault()} noValidate>
          <h2 id={`${uid}-ut`} className={p.drawerTitle}>Unpublish product?</h2>
          <p className={p.dName}>{openRow?.name}{openRow ? <span className={p.muted}> · {openRow.sku ?? openRow.reference}</span> : null}</p>
          <p>Unpublishing hides this listing from public discovery: search, category pages, the product page, the supplier profile and new inquiries. It is not a deletion. Existing inquiries and quotations remain unchanged, and the supplier&apos;s data and history are kept. A newer approved revision does not make it public again.</p>
          <div className={auth.field}>
            <label htmlFor={`${uid}-reason`} className={auth.label}>Reason <span aria-hidden>*</span></label>
            <textarea id={`${uid}-reason`} className={auth.control} rows={4} maxLength={UNPUBLISH_REASON.max} value={reason} onChange={(e) => { setReason(e.target.value); setDemoNote(false); setServerError(""); }} onBlur={() => setTouched(true)} aria-required="true" aria-invalid={reasonError ? true : undefined} aria-describedby={reasonError ? `${uid}-reason-err` : undefined} placeholder="Enter reason for unpublishing..." />
            {reasonError && <p id={`${uid}-reason-err`} className={s.err} role="alert">{reasonError}</p>}
          </div>
          {serverError && <p className={s.err} role="alert">{serverError}</p>}
          {demoNote && <p className={p.demo} role="status"><Info size={16} aria-hidden /> Demo preview only: the reason is valid, but nothing was changed or saved.</p>}
          <div className={p.dialogActions}>
            <button type="button" className={prof.btnSecondary} onClick={() => confirm.current?.close()}>Cancel</button>
            <button type="button" className={prof.btnPrimary} disabled={busy} onClick={() => void confirmClick()}>{busy ? "Unpublishing..." : "Confirm Unpublish"}</button>
          </div>
          {demo && <p className={p.muted}><Info size={14} aria-hidden /> Preview: confirming only checks the reason; no request is sent.</p>}
        </form>
      </dialog>
    </>
  );
}
