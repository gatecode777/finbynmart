import type { ObjectId } from "mongodb";
import { emailConfigured, sendEmail, type EmailResult } from "@/lib/email/provider";
import { clientIp } from "@/lib/security/rateLimit";
import { issueToken, type TokenPurpose } from "./tokens";
import { resetTtlMinutes, verifyTtlHours } from "./securityConfig";

/**
 * The emails the account flows send. Links are built from APP_URL, never from the request's Host header (a forged Host
 * would otherwise put an attacker's domain in a password-reset link). Outside production the request origin is accepted so
 * local development works without configuration. Dynamic text is HTML-escaped; the raw token appears only in the link.
 */
export function appBaseUrl(request: Request): string | null {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? null : new URL(request.url).origin;
}

const SUBJECT: Record<TokenPurpose, string> = {
  verify_email: "Confirm your email address for Finbyn Mart",
  reset_password: "Reset Your Finbyn Mart Password",
};

const PATH: Record<TokenPurpose, string> = { verify_email: "/verify-email", reset_password: "/reset-password" };

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const validity = (purpose: TokenPurpose) => (purpose === "reset_password" ? `${resetTtlMinutes()} minutes` : `${verifyTtlHours()} hours`);

function content(purpose: TokenPurpose, name: string, link: string, logoUrl: string | null): { text: string; html: string } {
  const reset = purpose === "reset_password";
  const heading = reset ? "Reset your password" : "Confirm your email address";
  const lead = reset ? "We received a request to reset the password of your Finbyn Mart account. Use the button below to choose a new password." : "Confirm your email address to finish setting up your Finbyn Mart account.";
  const button = reset ? "Reset Password" : "Confirm Email Address";
  const tail = reset ? "If you did not ask for this, ignore this email: your password stays as it is and no one can use this link without access to your mailbox." : "If you did not create this account you can ignore this email.";
  const expiry = `The link works once and expires in ${validity(purpose)}.`;
  const text = `Hello ${name},\n\n${lead}\n\n${link}\n\n${expiry}\n${tail}\n\nFinbyn Mart will never ask for your password by email.\n`;
  const safeLink = escapeHtml(link);
  const html = `<!doctype html><html><body style="margin:0;background:#f6f8f7;font-family:Arial,Helvetica,sans-serif;color:#183a38"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border:1px solid #dce8e5;border-radius:12px"><tr><td style="padding:24px 28px 0">${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Finbyn Mart" height="40" style="height:40px;border:0">` : "<strong>Finbyn Mart</strong>"}</td></tr><tr><td style="padding:16px 28px 28px"><h1 style="margin:0 0 12px;font-size:22px;color:#04534f">${heading}</h1><p style="margin:0 0 8px">Hello ${escapeHtml(name)},</p><p style="margin:0 0 20px;line-height:1.5">${lead}</p><p style="margin:0 0 20px"><a href="${safeLink}" style="display:inline-block;background:#04534f;color:#fff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:8px">${button}</a></p><p style="margin:0 0 8px;font-size:13px;color:#526563">Or paste this link into your browser:<br><a href="${safeLink}" style="color:#04534f;word-break:break-all">${safeLink}</a></p><p style="margin:16px 0 0;font-size:13px;color:#526563">${expiry}<br>${tail}</p><p style="margin:16px 0 0;font-size:12px;color:#526563">Finbyn Mart will never ask for your password by email.</p></td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}

/**
 * Issues a fresh token and emails the link. With no provider configured no token is created and nothing is sent.
 * The result separates what happened: token created (always when a send is attempted) and provider acceptance ("sent").
 * It says nothing about inbox delivery, which is unknowable from here.
 */
export async function sendAccountEmail(request: Request, user: { _id: ObjectId; name: string; email: string }, purpose: TokenPurpose): Promise<EmailResult> {
  if (!emailConfigured()) return { status: "not_configured" };
  const base = appBaseUrl(request);
  if (!base) return { status: "failed", reason: "APP_URL is not set" };
  const { token } = await issueToken(user._id, purpose, clientIp(request));
  const link = `${base}${PATH[purpose]}?token=${token}`;
  const message = content(purpose, user.name, link, `${base}/images/brand/finbyn-mart-logo.png`);
  const result = await sendEmail({ to: user.email, subject: SUBJECT[purpose], ...message });
  if (result.status === "failed") console.error(`${purpose} email failed:`, result.reason);
  return result;
}
