import { createHmac } from "node:crypto";

/**
 * What a sign-in can honestly say about a device: the browser, operating system and kind of device the browser's own User-Agent header
 * claims. That header is sent by the client and can be changed, so the label is informational only and is never used to grant or
 * deny anything. The raw header is never stored (only these labels), and no IP address or location is derived: there is no approved
 * location source, so a place is never shown.
 */
export interface DeviceInfo {
  browser: string;
  os: string;
  deviceType: "Desktop" | "Mobile" | "Tablet" | "Unknown";
  /** "Chrome on Windows", or "Unknown device" when nothing could be read. */
  label: string;
}

const BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\b(?:OPR|Opera)\//, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bFxiOS\//, "Firefox"],
  [/\bFirefox\//, "Firefox"],
  [/\bCriOS\//, "Chrome"],
  [/\bChrome\//, "Chrome"],
  [/\bVersion\/[\d.]+.*Safari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/\b(?:iPhone|iPad|iPod)\b/, "iOS"],
  [/\bAndroid\b/, "Android"],
  [/\bWindows\b/, "Windows"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bLinux\b|\bX11\b/, "Linux"],
];

export function parseUserAgent(header: string | null | undefined): DeviceInfo {
  const ua = (header ?? "").slice(0, 300);
  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1] ?? "Unknown browser";
  const os = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1] ?? "Unknown system";
  const deviceType: DeviceInfo["deviceType"] = /\biPad\b|\bTablet\b/.test(ua) || (/\bAndroid\b/.test(ua) && !/\bMobile\b/.test(ua))
    ? "Tablet"
    : /\bMobi|iPhone|iPod/.test(ua)
      ? "Mobile"
      : os === "Unknown system"
        ? "Unknown"
        : "Desktop";
  const known = browser !== "Unknown browser" || os !== "Unknown system";
  const label = !known ? "Unknown device" : browser === "Unknown browser" ? os : os === "Unknown system" ? browser : `${browser} on ${os}`;
  return { browser, os, deviceType, label };
}

/**
 * A stable, per-account fingerprint of the browser/OS/type combination, used only to tell "a device this account has signed in from
 * before" from "a first sign-in from this combination". It is keyed with AUTH_SECRET and the account id, so two accounts' values
 * cannot be compared and the value cannot be reversed to a header.
 */
export function deviceKeyFor(userId: string, info: DeviceInfo): string {
  const secret = process.env.AUTH_SECRET ?? "";
  return createHmac("sha256", secret).update(`device:${userId}:${info.browser}|${info.os}|${info.deviceType}`).digest("hex").slice(0, 24);
}
