/**
 * The public origin of the site, used for canonical URLs and structured data. Returns undefined
 * when it is not configured, in which case callers omit absolute URLs rather than guess a host.
 * Set NEXT_PUBLIC_SITE_URL (for example https://www.example.com); on Vercel the production
 * domain is picked up automatically.
 */
export function siteUrl(): string | undefined {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);
  return configured?.replace(/\/+$/, "");
}
