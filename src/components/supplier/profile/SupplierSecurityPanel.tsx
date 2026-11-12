"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Lock,
  CheckCircle2,
  AlertCircle,
  Monitor,
  Smartphone,
  Tablet,
  LogOut,
  RefreshCw,
  X,
  ShieldCheck,
  SmartphoneNfc,
  Laptop,
} from "lucide-react";
import type { SupplierSecurityDto } from "@/lib/supplier/profileService";
import type { SupplierSessionItemDto } from "@/lib/supplier/securityService";
import { ChangePasswordForm } from "@/components/buyer/security/ChangePasswordForm";
import { ConfirmDialog } from "@/components/ui/Modal";
import { flashToast } from "@/components/ui/Toast";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import styles from "./SupplierProfile.module.css";

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not recorded";

export function SupplierSecurityPanel({ security }: { security: SupplierSecurityDto }) {
  // Reactive security states
  const [emailVerified, setEmailVerified] = useState(security.emailVerified);
  const [phoneVerified, setPhoneVerified] = useState(security.phoneVerified);
  const [passwordChangedAt, setPasswordChangedAt] = useState(security.passwordChangedAt);

  // Verification actions state
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpValue, setOtpValue] = useState("");
  const [submittingOtp, setSubmittingOtp] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  // Active Sessions state
  const [sessions, setSessions] = useState<SupplierSessionItemDto[] | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [showSessionsArea, setShowSessionsArea] = useState(true);
  const [showRevokeOthersDialog, setShowRevokeOthersDialog] = useState(false);
  const [targetSessionToRevoke, setTargetSessionToRevoke] = useState<SupplierSessionItemDto | null>(null);
  const [revoking, setRevoking] = useState(false);

  // Feedback banners
  const [banner, setBanner] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  // Fetch active sessions
  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch("/api/supplier/security/sessions", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok && json.data?.sessions) {
        setSessions(json.data.sessions);
      }
    } catch {
      // Non-fatal
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  // Handle Verify Email
  async function handleVerifyEmail() {
    if (verifyingEmail) return;
    setVerifyingEmail(true);
    setBanner(null);
    try {
      const res = await fetch("/api/supplier/security/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setEmailVerified(true);
        const msg = data.message || "Your email address has been verified successfully.";
        setBanner({ type: "ok", text: msg });
        flashToast("success", msg);
      } else {
        const msg = data?.message || "Failed to verify email address.";
        setBanner({ type: "error", text: msg });
        flashToast("error", msg);
      }
    } catch {
      const msg = "Network error. Please try again.";
      setBanner({ type: "error", text: msg });
      flashToast("error", msg);
    } finally {
      setVerifyingEmail(false);
    }
  }

  // Handle Verify Phone via OTP
  async function handleVerifyPhoneSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (submittingOtp) return;
    setOtpError(null);

    const clean = otpValue.trim();
    if (!/^\d{6}$/.test(clean)) {
      setOtpError("Please enter the 6-digit code.");
      return;
    }

    setSubmittingOtp(true);
    try {
      const res = await fetch("/api/supplier/security/verify-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: clean, phone: security.phone ?? undefined }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setPhoneVerified(true);
        setShowOtpModal(false);
        setOtpValue("");
        const msg = data.message || "Mobile number verified successfully.";
        setBanner({ type: "ok", text: msg });
        flashToast("success", msg);
      } else {
        setOtpError(data?.message || "Verification code incorrect. Please try again.");
      }
    } catch {
      setOtpError("Network error. Please try again.");
    } finally {
      setSubmittingOtp(false);
    }
  }

  // Handle Sign Out of Other Devices
  async function handleSignOutOthers() {
    if (revoking) return;
    setRevoking(true);
    try {
      const res = await fetch("/api/supplier/security/sessions/revoke-others", {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setShowRevokeOthersDialog(false);
        const msg = data.message || "Signed out of all other devices.";
        setBanner({ type: "ok", text: msg });
        flashToast("success", msg);
        await fetchSessions();
      } else {
        const msg = data?.message || "Could not sign out of other devices.";
        setBanner({ type: "error", text: msg });
        flashToast("error", msg);
      }
    } catch {
      setBanner({ type: "error", text: "Network error. Please try again." });
    } finally {
      setRevoking(false);
      setShowRevokeOthersDialog(false);
    }
  }

  // Handle Revoke Single Device Session
  async function handleRevokeSingle() {
    if (!targetSessionToRevoke || revoking) return;
    setRevoking(true);
    try {
      const res = await fetch(`/api/supplier/security/sessions/${targetSessionToRevoke.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setTargetSessionToRevoke(null);
        const msg = data.message || `Revoked session on ${targetSessionToRevoke.deviceLabel}.`;
        setBanner({ type: "ok", text: msg });
        flashToast("success", msg);
        await fetchSessions();
      } else {
        const msg = data?.message || "Could not revoke session.";
        setBanner({ type: "error", text: msg });
        flashToast("error", msg);
      }
    } catch {
      setBanner({ type: "error", text: "Network error. Please try again." });
    } finally {
      setRevoking(false);
      setTargetSessionToRevoke(null);
    }
  }

  const otherSessionsCount = sessions ? sessions.filter((s) => !s.current).length : 0;
  const currentCount = sessions ? sessions.length : security.sessions.activeCount ?? 1;

  return (
    <section className={dash.card} aria-labelledby="supplier-security-title">
      <h2 id="supplier-security-title" className={dash.cardTitle}>
        <Lock size={20} aria-hidden /> Account Security &amp; Credentials
      </h2>
      <p className={dash.legendNote}>Manage your account password, active sessions and credentials security.</p>

      {banner && (
        <div
          className={`${styles.alertBanner} ${
            banner.type === "ok" ? styles.alertBannerOk : styles.alertBannerError
          }`}
          role="status"
        >
          {banner.type === "ok" ? <CheckCircle2 size={16} aria-hidden /> : <AlertCircle size={16} aria-hidden />}
          <span>{banner.text}</span>
        </div>
      )}

      {/* Styled Status List with working buttons and badges */}
      <ul className={styles.statusList}>
        <li className={styles.statusRow}>
          <span className={styles.statusLabel}>Account Status</span>
          <div className={styles.statusValue}>
            <span className={security.accountStatus === "ACTIVE" ? styles.badgeOk : styles.badgeWarn}>
              <ShieldCheck size={14} aria-hidden /> {security.accountStatus === "ACTIVE" ? "Active" : security.accountStatus}
            </span>
          </div>
        </li>

        <li className={styles.statusRow}>
          <span className={styles.statusLabel}>Email Confirmation</span>
          <div className={styles.statusValue}>
            {emailVerified ? (
              <span className={styles.badgeOk}>
                <CheckCircle2 size={14} aria-hidden /> Confirmed
              </span>
            ) : (
              <>
                <span className={styles.badgeWarn}>
                  <AlertCircle size={14} aria-hidden /> Not confirmed
                </span>
                <button
                  type="button"
                  className={styles.actionBtnSm}
                  onClick={handleVerifyEmail}
                  disabled={verifyingEmail}
                  aria-label="Verify Email Address"
                >
                  {verifyingEmail ? "Verifying..." : "Verify Email"}
                </button>
              </>
            )}
          </div>
        </li>

        <li className={styles.statusRow}>
          <span className={styles.statusLabel}>Mobile Confirmation</span>
          <div className={styles.statusValue}>
            {phoneVerified ? (
              <span className={styles.badgeOk}>
                <CheckCircle2 size={14} aria-hidden /> Confirmed
              </span>
            ) : (
              <>
                <span className={styles.badgeWarn}>
                  <AlertCircle size={14} aria-hidden /> Not confirmed
                </span>
                <button
                  type="button"
                  className={`${styles.actionBtnSm} ${styles.actionBtnSmGold}`}
                  onClick={() => {
                    setOtpValue("");
                    setOtpError(null);
                    setShowOtpModal(true);
                  }}
                  aria-label="Verify Mobile Number"
                >
                  <SmartphoneNfc size={14} aria-hidden /> Verify Mobile
                </button>
              </>
            )}
          </div>
        </li>

        <li className={styles.statusRow}>
          <span className={styles.statusLabel}>Last Sign-In</span>
          <span className={styles.statusValue}>{when(security.lastLoginAt)}</span>
        </li>

        <li className={styles.statusRow}>
          <span className={styles.statusLabel}>Password Last Changed</span>
          <span className={styles.statusValue}>{when(passwordChangedAt)}</span>
        </li>

        <li className={styles.statusRow}>
          <span className={styles.statusLabel}>Active Signed-In Devices</span>
          <div className={styles.statusValue}>
            <span style={{ fontWeight: 600 }}>{currentCount} {currentCount === 1 ? "device" : "devices"}</span>
            <button
              type="button"
              className={styles.actionBtnSm}
              onClick={() => setShowSessionsArea((prev) => !prev)}
            >
              {showSessionsArea ? "Hide Devices" : "Manage Devices"}
            </button>
          </div>
        </li>
      </ul>

      {/* Active Sessions Management Section */}
      {showSessionsArea && (
        <div className={styles.sessionSection}>
          <div className={styles.sessionHeader}>
            <div>
              <h3 className={styles.sessionTitle}>Signed-In Devices</h3>
              <p className={styles.muted} style={{ fontSize: "0.8125rem", margin: "2px 0 0" }}>
                {security.sessions.reason}
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className={styles.actionBtnSm}
                onClick={fetchSessions}
                disabled={loadingSessions}
                title="Refresh sessions list"
              >
                <RefreshCw size={13} className={loadingSessions ? "spin" : ""} aria-hidden /> Refresh
              </button>
              {otherSessionsCount > 0 && (
                <button
                  type="button"
                  className={`${styles.actionBtnSm} ${styles.actionBtnSmDanger}`}
                  onClick={() => setShowRevokeOthersDialog(true)}
                  disabled={revoking}
                >
                  <LogOut size={13} aria-hidden /> Sign Out Other Devices ({otherSessionsCount})
                </button>
              )}
            </div>
          </div>

          <div className={styles.sessionTableWrap}>
            <table className={styles.sessionTable}>
              <thead>
                <tr>
                  <th>Device / Browser</th>
                  <th>Operating System</th>
                  <th>Last Active</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {sessions && sessions.length > 0 ? (
                  sessions.map((sess) => {
                    const isMob = sess.deviceType === "Mobile";
                    const isTab = sess.deviceType === "Tablet";
                    const DeviceIcon = isMob ? Smartphone : isTab ? Tablet : sess.os.includes("Mac") ? Laptop : Monitor;

                    return (
                      <tr key={sess.id}>
                        <td>
                          <div className={styles.sessionDeviceCell}>
                            <DeviceIcon size={18} className={styles.sessionDeviceIcon} aria-hidden />
                            <div>
                              <div className={styles.sessionDeviceTitle}>{sess.deviceLabel}</div>
                              <div className={styles.sessionDeviceSub}>{sess.browser}</div>
                            </div>
                          </div>
                        </td>
                        <td>{sess.os}</td>
                        <td>{when(sess.lastActiveAt)}</td>
                        <td>
                          {sess.current ? (
                            <span className={styles.currentTag}>This Device</span>
                          ) : (
                            <span className={styles.badgeMuted}>Active</span>
                          )}
                        </td>
                        <td>
                          {sess.current ? (
                            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Current Session</span>
                          ) : (
                            <button
                              type="button"
                              className={`${styles.actionBtnSm} ${styles.actionBtnSmDanger}`}
                              onClick={() => setTargetSessionToRevoke(sess)}
                              disabled={revoking}
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "16px", color: "var(--text-secondary)" }}>
                      {loadingSessions ? "Loading active devices..." : "1 active session on this device."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Change Password Form */}
      <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border, #dce8e5)" }}>
        <h3 className={dash.cardTitle} style={{ fontSize: "1.125rem", marginBottom: "8px" }}>
          Change Password
        </h3>
        <p className={styles.muted} style={{ marginBottom: "1rem" }}>
          Choose a strong password with at least 8 characters including uppercase, lowercase, numbers and symbols.
        </p>
        <ChangePasswordForm
          onChanged={() => {
            setPasswordChangedAt(new Date().toISOString());
            void fetchSessions();
            setBanner({
              type: "ok",
              text: "Your password was changed successfully. Other active sessions were signed out.",
            });
            flashToast("success", "Password updated successfully.");
          }}
        />
      </div>

      {/* Phone OTP Verification Modal */}
      {showOtpModal && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="otp-title">
          <div className={styles.modalDialog}>
            <div className={styles.modalHeader}>
              <h4 id="otp-title" className={styles.modalTitle}>
                Verify Mobile Number
              </h4>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setShowOtpModal(false)}
                aria-label="Close"
              >
                <X size={18} aria-hidden />
              </button>
            </div>
            <form onSubmit={handleVerifyPhoneSubmit}>
              <div className={styles.modalBody}>
                <p style={{ margin: "0 0 8px", fontSize: "0.875rem", color: "var(--text-primary)" }}>
                  Enter the 6-digit verification code sent to your registered mobile number:
                </p>
                <p style={{ margin: "0 0 14px", fontWeight: 700, color: "var(--primary)" }}>
                  {security.phone || "+91 98765 43210"}
                </p>
                <div
                  style={{
                    background: "var(--light-mint, #eaf5f3)",
                    border: "1px dashed var(--primary, #04534f)",
                    borderRadius: "6px",
                    padding: "8px 12px",
                    fontSize: "0.8125rem",
                    color: "var(--primary, #04534f)",
                    marginBottom: "12px",
                  }}
                >
                  💡 <strong>Demo Code:</strong> Use code <code>123456</code> to verify immediately.
                </div>

                <label htmlFor="otp-input" className="sr-only">6-Digit Verification Code</label>
                <input
                  id="otp-input"
                  type="text"
                  maxLength={6}
                  value={otpValue}
                  onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className={styles.otpInput}
                  autoFocus
                />

                {otpError && (
                  <p style={{ color: "#dc2626", fontSize: "0.8125rem", margin: "6px 0 0" }} role="alert">
                    {otpError}
                  </p>
                )}
              </div>
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setShowOtpModal(false)}
                  disabled={submittingOtp}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.btnPrimary}
                  disabled={submittingOtp || otpValue.trim().length !== 6}
                >
                  {submittingOtp ? "Verifying..." : "Verify & Confirm"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Sign Out of Other Devices */}
      {showRevokeOthersDialog && (
        <ConfirmDialog
          title="Sign Out of All Other Devices?"
          message={`This will terminate ${otherSessionsCount} other active session${
            otherSessionsCount === 1 ? "" : "s"
          }. This browser will stay signed in.`}
          confirmLabel="Sign Out Others"
          cancelLabel="Keep Devices"
          tone="danger"
          busy={revoking}
          onConfirm={handleSignOutOthers}
          onCancel={() => setShowRevokeOthersDialog(false)}
        />
      )}

      {/* Confirm Single Session Revocation */}
      {targetSessionToRevoke && (
        <ConfirmDialog
          title="Revoke Device Session?"
          message={`Are you sure you want to sign out the active session on ${targetSessionToRevoke.deviceLabel}?`}
          confirmLabel="Revoke Session"
          cancelLabel="Cancel"
          tone="danger"
          busy={revoking}
          onConfirm={handleRevokeSingle}
          onCancel={() => setTargetSessionToRevoke(null)}
        />
      )}
    </section>
  );
}
