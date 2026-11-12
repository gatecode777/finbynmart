"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { LogOut, Monitor, Smartphone, Tablet } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/Modal";
import { flashToast } from "@/components/ui/Toast";
import type { SessionDto, SessionsAnswer } from "@/lib/buyer/securitySessions";
import { Loading, StatusBadge } from "./securityShared";
import inq from "../inquiries/Inquiries.module.css";
import s from "./Security.module.css";

const DeviceIcon = ({ type }: { type: string }) => (type === "Mobile" ? <Smartphone size={18} aria-hidden /> : type === "Tablet" ? <Tablet size={18} aria-hidden /> : <Monitor size={18} aria-hidden />);

/**
 * The buyer's active sessions, read from the server on opening and again after every action. Revoking asks first and shows success only after
 * the server revoked the session (the list is then read again, so a revoked row never lingers). The session in use has no revoke button.
 */
export function ActiveSessionsPanel({ onChanged, signOutOthersRequest }: { onChanged: () => void; signOutOthersRequest: number }) {
  const [data, setData] = useState<SessionsAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState<SessionDto | null>(null);
  const [askOthers, setAskOthers] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);
  const counter = useRef(0);

  const load = useCallback(async () => {
    const mine = ++counter.current;
    setError(null);
    try {
      const res = await fetch("/api/buyer/security/sessions", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (mine !== counter.current) return;
      if (!res.ok || !body?.ok) throw new Error(body?.message ?? "Your sessions could not be loaded.");
      setData(body.data as SessionsAnswer);
    } catch (e) {
      if (mine === counter.current) setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // the header's "Sign Out Other Devices" asks the panel to open its confirmation
  useEffect(() => {
    if (signOutOthersRequest > 0) setAskOthers(true);
  }, [signOutOthersRequest]);

  async function send(url: string, method: "DELETE" | "POST", key: string) {
    if (busy) return;
    setBusy(key);
    setBanner(null);
    try {
      const res = await fetch(url, { method });
      const body = await res.json().catch(() => ({}));
      const ok = res.ok && body.ok;
      setBanner({ ok, text: ok ? body.message : (res.status === 429 ? "Too many attempts. Wait a few minutes and try again." : (body.message ?? "That did not work. Nothing was changed.")) });
      if (ok) flashToast("success", body.message);
      await load();
      onChanged();
    } catch {
      setBanner({ ok: false, text: "Could not reach the server. Nothing was changed." });
    } finally {
      setBusy(null);
      setAsk(null);
      setAskOthers(false);
    }
  }

  if (error && !data) {
    return (
      <div role="alert">
        <p className={s.note}>{error}</p>
        <button type="button" className={inq.btn} onClick={() => void load()}>Try again</button>
      </div>
    );
  }
  if (!data) return <Loading label="Loading your sessions" />;

  const others = data.sessions.filter((x) => !x.current);
  return (
    <div>
      <div className={s.toolbar}>
        <p className={s.intro} style={{ margin: 0 }}>{data.sessions.length} active {data.sessions.length === 1 ? "session" : "sessions"}.</p>
        {others.length > 0 && <button type="button" className={s.rowBtn} onClick={() => setAskOthers(true)} disabled={busy !== null}><LogOut size={16} aria-hidden /> Sign Out Other Devices</button>}
      </div>
      {banner && <p className={clsx(s.banner, banner.ok ? s.bannerOk : s.bannerError)} role={banner.ok ? "status" : "alert"}>{banner.text}</p>}
      {error && <p className={s.note} role="alert">{error}</p>}
      {!data.currentTracked && <p className={s.note}>This browser signed in before session tracking started, so it is not in this list and cannot be ended individually. Signing out of other devices still ends it. Sign in again to see this browser here.</p>}
      {data.sessions.length === 0 ? (
        <p className={s.note}>There are no tracked sessions yet. A session appears here the next time you sign in.</p>
      ) : (
        <>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <caption>Your active sessions</caption>
              <thead>
                <tr>
                  <th scope="col">Device</th>
                  <th scope="col">Signed in</th>
                  <th scope="col">Last active</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.map((x) => (
                  <tr key={x.id}>
                    <td><DeviceIcon type={x.deviceType} /> {x.deviceLabel}</td>
                    <td>{x.createdLabel}</td>
                    <td>{x.lastActiveLabel}</td>
                    <td>{x.current ? <StatusBadge status="current" label="This device" /> : <StatusBadge status="info" label="Active" />}</td>
                    <td>{x.current ? <span className={inq.muted}>Current session</span> : <button type="button" className={s.rowBtn} onClick={() => setAsk(x)} disabled={busy !== null} aria-label={`Sign out ${x.deviceLabel}, signed in ${x.createdLabel}`}>Revoke</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className={s.cards} aria-label="Your active sessions">
            {data.sessions.map((x) => (
              <li key={x.id} className={s.card}>
                <div className={s.cardTop}>
                  <p className={s.cardName}><DeviceIcon type={x.deviceType} /> {x.deviceLabel}</p>
                  {x.current ? <StatusBadge status="current" label="This device" /> : <StatusBadge status="info" label="Active" />}
                </div>
                <dl className={s.facts}>
                  <div><dt>Signed in</dt><dd>{x.createdLabel}</dd></div>
                  <div><dt>Last active</dt><dd>{x.lastActiveLabel}</dd></div>
                  <div><dt>Location</dt><dd>{x.region}</dd></div>
                </dl>
                {x.current ? <p className={inq.muted}>This is the session you are using.</p> : <button type="button" className={s.rowBtn} onClick={() => setAsk(x)} disabled={busy !== null} aria-label={`Sign out ${x.deviceLabel}, signed in ${x.createdLabel}`}>Revoke Session</button>}
              </li>
            ))}
          </ul>
          <p className={s.note}>Devices are named from what each browser reports about itself, so a label can be wrong. Location is shown as Unknown: no location source is used.</p>
        </>
      )}

      {ask && <ConfirmDialog title="Sign out this device?" message={`${ask.deviceLabel} (signed in ${ask.createdLabel}) will be signed out and will need your password again. This device is not affected.`} confirmLabel="Sign out device" cancelLabel="Keep it signed in" tone="danger" onConfirm={() => void send(`/api/buyer/security/sessions/${ask.id}`, "DELETE", ask.id)} onCancel={() => setAsk(null)} />}
      {askOthers && <ConfirmDialog title="Sign out other devices?" message={others.length === 0 ? "No other tracked devices are signed in. Any sessions started before session tracking began will still be ended. This device stays signed in." : `${others.length} other ${others.length === 1 ? "device" : "devices"} will be signed out and will need your password again. Sessions started before session tracking began are also ended. This device stays signed in.`} confirmLabel="Sign out other devices" cancelLabel="Cancel" tone="danger" onConfirm={() => void send("/api/buyer/security/sessions/revoke-others", "POST", "others")} onCancel={() => setAskOthers(false)} />}
    </div>
  );
}
