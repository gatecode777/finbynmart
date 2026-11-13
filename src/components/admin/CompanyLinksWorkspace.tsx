"use client";

import { useEffect, useRef, useState } from "react";
import { Info, Search } from "lucide-react";
import auth from "@/components/auth/Auth.module.css";
import prof from "@/components/supplier/profile/SupplierProfile.module.css";
import { flashToast } from "@/components/ui/Toast";
import { REASON_MAX, validateLink, type LinkErrors } from "@/lib/admin/mappingRules";
import type { CompanyRow, SellerRow } from "@/lib/admin/sellerMapping";
import s from "./AdminInquiries.module.css";

export function CompanyLinksWorkspace() {
  const [cq, setCq] = useState("");
  const [companies, setCompanies] = useState<CompanyRow[] | null>(null);
  const [company, setCompany] = useState<CompanyRow | null>(null);
  const [sq, setSq] = useState("");
  const [sellers, setSellers] = useState<SellerRow[]>([]);
  const [seller, setSeller] = useState<SellerRow | null>(null);
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);
  const [errors, setErrors] = useState<LinkErrors>({});
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const abortC = useRef<AbortController | null>(null);
  const abortS = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      abortC.current?.abort();
      const ctl = (abortC.current = new AbortController());
      const res = await fetch(`/api/admin/company-links?q=${encodeURIComponent(cq)}`, { cache: "no-store", signal: ctl.signal }).catch(() => null);
      if (ctl.signal.aborted) return;
      const json = res?.ok ? await res.json().catch(() => null) : null;
      if (json?.ok) { setCompanies(json.data.items); setLoadError(""); } else setLoadError("Could not load companies.");
    }, cq ? 300 : 0);
    return () => clearTimeout(t);
  }, [cq]);

  useEffect(() => {
    if (sq.trim().length < 2) { setSellers([]); return; }
    const t = setTimeout(async () => {
      abortS.current?.abort();
      const ctl = (abortS.current = new AbortController());
      const res = await fetch(`/api/admin/company-links/sellers?q=${encodeURIComponent(sq)}`, { cache: "no-store", signal: ctl.signal }).catch(() => null);
      if (ctl.signal.aborted) return;
      const json = res?.ok ? await res.json().catch(() => null) : null;
      setSellers(json?.ok ? json.data : []);
    }, 300);
    return () => clearTimeout(t);
  }, [sq]);

  async function submit() {
    if (busy) return;
    const req = { companyId: company?.companyId ?? "", sellerKey: seller?.key ?? "", reason, acknowledgeHistory: ack };
    const e = validateLink(req);
    if (Object.keys(e).length) { setErrors(e); flashToast("error", "Not linked. Fix the highlighted fields."); return; }
    setBusy(true);
    const res = await fetch("/api/admin/company-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (res?.ok && data.ok) {
      flashToast("success", data.message);
      setCompany((c) => (c ? { ...c, sellerKeys: data.data.sellerKeys } : c));
      setCompanies((list) => list && list.map((c) => (c.companyId === req.companyId ? { ...c, sellerKeys: data.data.sellerKeys } : c)));
      setSeller(null); setReason(""); setAck(false); setErrors({}); setSq(""); setSellers([]);
      return;
    }
    setErrors(data.fields ?? {});
    flashToast("error", "Not linked. " + (res ? (data.message ?? "Please try again.") : "Network error."));
  }

  const err = (k: keyof LinkErrors) => (errors[k] ? <p id={`cl-e-${k}`} className={s.err}>{errors[k]}</p> : null);

  return (
    <>
      <p className={s.note}><Info size={14} aria-hidden /> A seller can belong to one company only. Linking gives the company access to all existing inquiries, quotations, orders and messages of that seller. Nothing is matched automatically and unlinking is not available yet.</p>
      {loadError && <p role="alert" className={s.err}>{loadError}</p>}

      <section className={s.panel} aria-labelledby="cl-step1" style={{ padding: "1rem 1.25rem", marginBottom: "1rem" }}>
        <h2 id="cl-step1" className={s.h2}>1. Choose the company</h2>
        <div className={s.search} style={{ maxWidth: 420 }}>
          <label htmlFor="cl-cq" className={s.sr}>Search companies by business name</label>
          <Search size={16} aria-hidden className={s.searchIcon} />
          <input id="cl-cq" className={auth.control} placeholder="Business name" value={cq} onChange={(e) => setCq(e.target.value)} />
        </div>
        {companies === null ? <p className={s.hint}>Loading…</p> : companies.length === 0 ? <p className={s.hint}>No supplier company matches. A company exists after the supplier has signed in once.</p> : (
          <ul className={s.msgs} style={{ marginTop: ".75rem" }}>
            {companies.map((c) => (
              <li key={c.companyId} style={{ background: company?.companyId === c.companyId ? "var(--primary-light, #eaf5f3)" : undefined }}>
                <strong>{c.businessName}</strong> {c.city && `· ${c.city}`} · {c.sellerKeys.length === 0 ? "no seller linked" : `${c.sellerKeys.length} seller${c.sellerKeys.length === 1 ? "" : "s"} linked`}
                <div><button type="button" className={prof.btnSecondary} onClick={() => { setCompany(c); setErrors((x) => ({ ...x, companyId: undefined })); }} aria-pressed={company?.companyId === c.companyId}>{company?.companyId === c.companyId ? "Selected" : "Select"}</button></div>
              </li>
            ))}
          </ul>
        )}
        {err("companyId")}
      </section>

      <section className={s.panel} aria-labelledby="cl-step2" style={{ padding: "1rem 1.25rem" }}>
        <h2 id="cl-step2" className={s.h2}>2. Choose the seller and confirm</h2>
        <div className={s.search} style={{ maxWidth: 420 }}>
          <label htmlFor="cl-sq" className={s.sr}>Search catalogue sellers by name</label>
          <Search size={16} aria-hidden className={s.searchIcon} />
          <input id="cl-sq" className={auth.control} placeholder="Seller name (at least 2 letters)" value={sq} onChange={(e) => setSq(e.target.value)} />
        </div>
        {sellers.length > 0 && (
          <ul className={s.msgs} style={{ marginTop: ".75rem" }}>
            {sellers.map((x) => (
              <li key={x.key}>
                <strong>{x.name}</strong> {x.city && `· ${x.city}`} {x.ownedByCompany && <span className={s.badge}>Already linked to a company</span>}
                <div><button type="button" className={prof.btnSecondary} disabled={x.ownedByCompany} onClick={() => { setSeller(x); setErrors((e) => ({ ...e, sellerKey: undefined })); }}>{seller?.key === x.key ? "Selected" : "Select"}</button></div>
              </li>
            ))}
          </ul>
        )}
        {err("sellerKey")}

        <p className={s.box} style={{ marginTop: "1rem" }} aria-live="polite">
          {company && seller ? `Link “${seller.name}” to “${company.businessName}”.` : "Select a company and a seller first."}
        </p>
        <div className={auth.field} style={{ marginTop: ".75rem" }}>
          <label htmlFor="cl-reason" className={auth.label}>Ownership evidence or ticket reference</label>
          <textarea id="cl-reason" className={auth.control} rows={3} maxLength={REASON_MAX} value={reason} onChange={(e) => { setReason(e.target.value); setErrors((x) => ({ ...x, reason: undefined })); }} aria-invalid={errors.reason ? true : undefined} aria-describedby={errors.reason ? "cl-e-reason" : undefined} />
          {err("reason")}
        </div>
        <label style={{ display: "flex", gap: ".6rem", alignItems: "flex-start", margin: ".75rem 0" }}>
          <input type="checkbox" checked={ack} onChange={(e) => { setAck(e.target.checked); setErrors((x) => ({ ...x, acknowledgeHistory: undefined })); }} style={{ marginTop: 3 }} />
          <span>I confirm the company will see this seller&apos;s existing inquiries, quotations, orders and messages.</span>
        </label>
        {err("acknowledgeHistory")}
        <button type="button" className={prof.btnGold} onClick={() => void submit()} disabled={busy}>{busy ? "Linking…" : "Link seller to company"}</button>
      </section>
    </>
  );
}
