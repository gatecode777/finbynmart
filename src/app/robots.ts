import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * Keeps crawlers (and the CPU they cost) off paths that are private, are APIs, or only re-sort the same listing. Public pages stay crawlable.
 * A path that is private is protected by its own guard; this only stops well-behaved bots from requesting it.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/", "/super-admin/", "/buyer/", "/supplier/", "/account/", "/inquiry/", "/sign-in", "/sign-up", "/login", "/forgot-password", "/reset-password", "/password-reset/", "/verify-email", "/forbidden", "/unauthorized", "/maintenance", "/*?*sort=", "/*?*view="],
      },
    ],
    ...(base ? { host: base } : {}),
  };
}
