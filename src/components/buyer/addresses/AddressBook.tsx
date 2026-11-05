"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Building2, Home, MapPin, Plus, Search, Truck, X } from "lucide-react";
import { ADDRESS_FILTERS, SEARCH_MAX, type AddressFilter } from "@/lib/buyer/addressRules";
import type { AddressDto, AddressList } from "@/lib/buyer/addresses";
import dash from "../Dashboard.module.css";
import profile from "../profile/Profile.module.css";
import { AddressCard } from "./AddressCard";
import { AddressFormDialog } from "./AddressFormDialog";
import styles from "./Addresses.module.css";

interface Props {
  initial: AddressList;
  initialType: AddressFilter;
  initialQuery: string;
  hasCompany: boolean;
}

const DEBOUNCE_MS = 300;

/**
 * The buyer's address book. The list, filter counts and statistics come from the buyer-scoped API; filter and search state live in
 * the address (?type=&q=) so a reload restores them. Nothing is shown as a default, saved or removed until the server confirmed it.
 */
export function AddressBook({ initial, initialType, initialQuery, hasCompany }: Props) {
  const [data, setData] = useState(initial);
  const [type, setType] = useState<AddressFilter>(initialType);
  const [q, setQ] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<{ address: AddressDto | null } | null>(null);
  const [confirm, setConfirm] = useState<AddressDto | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const request = useRef(0);
  const first = useRef(true);

  const load = useCallback(async (nextType: AddressFilter, nextQ: string) => {
    const mine = ++request.current;
    setLoading(true);
    setLoadError(false);
    const params = new URLSearchParams();
    if (nextType !== "all") params.set("type", nextType);
    if (nextQ) params.set("q", nextQ);
    const response = await fetch(`/api/buyer/addresses?${params}`).catch(() => null);
    const body = response ? await response.json().catch(() => null) : null;
    if (mine !== request.current) return; // a newer search replaced this one
    setLoading(false);
    if (response?.ok && body?.ok) setData(body.data as AddressList);
    else setLoadError(true);
  }, []);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (type !== "all") params.set("type", type);
      if (q) params.set("q", q);
      window.history.replaceState(null, "", params.size ? `/buyer/addresses?${params}` : "/buyer/addresses");
      void load(type, q);
    }, q === initialQuery && type === initialType ? 0 : DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [type, q, load, initialQuery, initialType]);

  async function setDefault(address: AddressDto, kind: "BILLING" | "DELIVERY") {
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/buyer/addresses/${address.id}/default`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: kind }) }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    setMessage({ ok: Boolean(response?.ok && body.ok), text: response ? (body.message ?? "Done.") : "Could not reach the server. Nothing was changed." });
    if (response?.ok && body.ok) await load(type, q);
  }

  async function remove(address: AddressDto) {
    setConfirm(null);
    setBusy(true);
    const response = await fetch(`/api/buyer/addresses/${address.id}`, { method: "DELETE" }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    setMessage({ ok: Boolean(response?.ok && body.ok), text: response ? (body.message ?? "Done.") : "Could not reach the server. Nothing was removed." });
    if (response?.ok && body.ok) await load(type, q);
  }

  const s = data.statistics;
  const defaultOf = (kind: "billing" | "delivery") => data.addresses.find((a) => (kind === "billing" ? a.isDefaultBilling : a.isDefaultDelivery))?.label;
  const counts: Record<AddressFilter, number> = { all: s.total, delivery: s.delivery, billing: s.billing, business: s.business };
  const filtered = type !== "all" || q !== "";

  return (
    <>
      <div className={styles.addRow}>
        <button type="button" className={profile.primaryButton} onClick={() => setDialog({ address: null })}>
          <Plus size={18} aria-hidden /> Add New Address
        </button>
      </div>
      <ul className={styles.stats} aria-label="Address summary">
        <li className={styles.stat}>
          <span className={styles.statIcon}><MapPin size={22} aria-hidden /></span>
          <div><p className={styles.statLabel}>Total Addresses</p><p className={styles.statValue}>{s.total}</p></div>
        </li>
        <li className={styles.stat}>
          <span className={styles.statIcon}><Home size={22} aria-hidden /></span>
          <div><p className={styles.statLabel}>Default Billing</p><p className={styles.statValue}>{s.hasDefaultBilling ? "Set" : "Not set"}</p>{s.hasDefaultBilling && defaultOf("billing") && <p className={styles.statNote}>{defaultOf("billing")}</p>}</div>
        </li>
        <li className={styles.stat}>
          <span className={styles.statIcon}><Truck size={22} aria-hidden /></span>
          <div><p className={styles.statLabel}>Default Delivery</p><p className={styles.statValue}>{s.hasDefaultDelivery ? "Set" : "Not set"}</p>{s.hasDefaultDelivery && defaultOf("delivery") && <p className={styles.statNote}>{defaultOf("delivery")}</p>}</div>
        </li>
        <li className={styles.stat}>
          <span className={styles.statIcon}><Building2 size={22} aria-hidden /></span>
          <div><p className={styles.statLabel}>Business Addresses</p><p className={styles.statValue}>{s.business}</p></div>
        </li>
      </ul>

      {message && <p className={clsx(profile.banner, message.ok ? profile.bannerOk : profile.bannerError)} role={message.ok ? "status" : "alert"}>{message.text}</p>}

      <div className={styles.toolbar}>
        <ul className={styles.filters} aria-label="Filter addresses by purpose">
          {ADDRESS_FILTERS.map((f) => (
            <li key={f.value}>
              <button type="button" className={clsx(styles.filter, type === f.value && styles.filterActive)} aria-pressed={type === f.value} onClick={() => setType(f.value)}>
                {f.label} ({counts[f.value]})
              </button>
            </li>
          ))}
        </ul>
        <div className={styles.search} role="search">
          <label htmlFor="address-search" className="visually-hidden">Search addresses by label, name, company, city, state or PIN code</label>
          <Search size={18} className={styles.searchIcon} aria-hidden />
          <input id="address-search" type="search" className={styles.searchInput} placeholder="Search by name, city or PIN code..." value={q} maxLength={SEARCH_MAX} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          {q && (
            <button type="button" className={styles.clearSearch} onClick={() => setQ("")} aria-label="Clear search">
              <X size={16} aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div aria-live="polite" aria-busy={loading}>
        {loadError ? (
          <div className={dash.sectionError} role="alert">
            <p>Your addresses could not be loaded just now.</p>
            <button type="button" className={dash.linkButtonSmall} onClick={() => void load(type, q)}>Retry</button>
          </div>
        ) : data.addresses.length === 0 ? (
          <div className={dash.card}>
            <p className={dash.emptyNote}>
              {s.total === 0 ? "You have no saved addresses yet." : q ? `No address matches "${q}".` : type === "delivery" ? "You have no delivery addresses." : type === "billing" ? "You have no billing addresses." : "You have no business addresses."}
            </p>
            {s.total === 0 ? (
              <>
                <p className={dash.legendNote}>Saved addresses let you choose where to deliver goods and where to send invoices without typing them again for each inquiry, quotation or order.</p>
                <button type="button" className={profile.primaryButton} onClick={() => setDialog({ address: null })}><Plus size={18} aria-hidden /> Add New Address</button>
              </>
            ) : filtered ? (
              <button type="button" className={profile.secondaryButton} onClick={() => { setType("all"); setQ(""); }}>Clear filters</button>
            ) : null}
          </div>
        ) : (
          <ul className={styles.list}>
            {data.addresses.map((a) => (
              <AddressCard key={a.id} address={a} busy={busy} onEdit={(address) => setDialog({ address })} onDelete={setConfirm} onDefault={setDefault} />
            ))}
          </ul>
        )}
        {loading && <p className={dash.legendNote} role="status">Loading...</p>}
      </div>

      {dialog && (
        <AddressFormDialog
          address={dialog.address}
          hasCompany={hasCompany}
          onClose={async (saved) => {
            setDialog(null);
            if (saved) {
              setMessage({ ok: true, text: dialog.address ? "The address was saved." : "The address was added." });
              await load(type, q);
            }
          }}
        />
      )}
      {confirm && (
        <div className={profile.dialogBackdrop} role="presentation" onKeyDown={(e) => e.key === "Escape" && setConfirm(null)}>
          <div className={profile.dialog} role="alertdialog" aria-modal="true" aria-labelledby="del-title" aria-describedby="del-text">
            <h3 id="del-title" className={dash.cardTitle}>Delete this address?</h3>
            <p id="del-text" className={dash.legendNote}>
              {confirm.label} ({confirm.city}) will be removed from your address book. Inquiries you already sent keep the location you gave them.
              {(confirm.isDefaultBilling || confirm.isDefaultDelivery) && " It is currently a default address: you will have no default of that kind until you choose another."}
            </p>
            <div className={profile.actions}>
              <button type="button" className={profile.dangerButton} onClick={() => remove(confirm)} autoFocus>Delete</button>
              <button type="button" className={profile.secondaryButton} onClick={() => setConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
