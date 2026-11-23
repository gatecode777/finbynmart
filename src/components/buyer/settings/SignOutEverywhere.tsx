"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { LogOut } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/Modal";
import dash from "../Dashboard.module.css";
import profile from "../profile/Profile.module.css";
import styles from "./Settings.module.css";

/** Sign out of every other device in one step (the same service as Account Security, where each device is listed and can be ended on its own). */
export function SignOutEverywhere() {
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    if (busy) return;
    setAsk(false);
    setBusy(true);
    setBanner(null);
    const res = await fetch("/api/buyer/settings/sign-out-everywhere", { method: "POST" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    setBanner({ ok: Boolean(res?.ok && data.ok), text: res ? (data.message ?? "Could not sign out other devices.") : "Could not reach the server. Nothing was changed." });
  }

  return (
    <section className={dash.card} aria-labelledby="devices-title">
      <h2 id="devices-title" className={dash.cardTitle}><LogOut size={20} aria-hidden /> Signed-in devices</h2>
      <p className={styles.sectionIntro}>You can sign out of every other device at once; this device stays signed in. To see each signed-in device, sign-in activity and security alerts, open <Link prefetch={false} href="/buyer/security?tab=sessions" className={dash.viewAll}>Account Security</Link>.</p>
      {banner && <p className={clsx(profile.banner, banner.ok ? profile.bannerOk : profile.bannerError)} role={banner.ok ? "status" : "alert"}>{banner.text}</p>}
      <button type="button" className={profile.dangerButton} onClick={() => setAsk(true)} disabled={busy}>
        <LogOut size={18} aria-hidden /> {busy ? "Signing out..." : "Sign out of all other devices"}
      </button>
      {ask && <ConfirmDialog title="Sign out of all other devices?" message="Every other device where you are signed in will be signed out and will need your password again. This device stays signed in." confirmLabel="Sign out other devices" cancelLabel="Keep them signed in" tone="danger" onConfirm={run} onCancel={() => setAsk(false)} />}
    </section>
  );
}
