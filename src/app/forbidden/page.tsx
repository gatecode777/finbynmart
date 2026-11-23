import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldX } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { portalHome } from "@/lib/auth/portals";
import { withPagePerf } from "@/lib/perf/instrument";
import styles from "./Forbidden.module.css";

// A private, never-indexed page. It carries no account detail: only the generic message and where the signed-in role's own portal is.
export const metadata: Metadata = { title: "Access Denied | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /forbidden (tracker ID 77). Reached by redirect when a signed-in user opens a portal that is not theirs. An anonymous visitor is not
 * "forbidden": they are sent to sign-in. The destination of "Return to Authorized Dashboard" is resolved HERE from the signed-in account's
 * real role; nothing the browser sends (the `portal` query value included) can change it. (The page itself answers 200: Next's 403 helper is
 * experimental and is deliberately not enabled; the protected URL never renders its data, it redirects.)
 */
async function ForbiddenPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect("/sign-in");
  const home = portalHome(user.role);
  return (
    <section className={styles.wrap} aria-labelledby="forbidden-title">
      <div className={styles.card}>
        <Image src="/images/brand/finbyn-mart-logo.png" alt="Finbyn Mart" width={180} height={50} className={styles.logo} priority />
        <span className={styles.icon} aria-hidden>
          <ShieldX size={44} strokeWidth={1.75} />
        </span>
        <h1 id="forbidden-title" className={styles.title}>Access Denied</h1>
        <p className={styles.text}>You don&apos;t have permission to access this page.</p>
        <div className={styles.actions}>
          <Link prefetch={false} href={home} className={styles.primary}>Return to Authorized Dashboard</Link>
          <Link prefetch={false} href="/" className={styles.secondary}>Go to Homepage</Link>
        </div>
      </div>
    </section>
  );
}

export default withPagePerf("page forbidden", ForbiddenPage);
