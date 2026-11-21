import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { portalOfPath, resolvePostLoginPath } from "@/lib/auth/portals";
import { safeReturnPath, signInHref } from "@/lib/auth/safeReturn";
import styles from "./Unauthorized.module.css";

// A recovery page: never indexed, never cached (it depends on the session and echoes a validated return path).
export const metadata: Metadata = { title: "Sign-in required | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /unauthorized (tracker ID 76): "sign-in required". It is a normal public recovery route, so it answers 200 like /forbidden (the framework's 401 helper is experimental and is deliberately not
 * enabled); protected pages still redirect straight to /sign-in, and APIs still answer a real 401 JSON. It reads no private record and shows no account or record detail.
 *  - `?next=` is validated here (`safeReturnPath`), validated again by /sign-in and the login API, and once more at the final redirect; it only decides where the person lands after signing in, and the
 *    destination enforces its own authorization.
 *  - An already signed-in visitor is not shown a sign-in loop: they follow the same landing rule as /sign-in (their requested page if it is theirs to open, else their portal home).
 *  - "Join as a Buyer" is offered only on a public or buyer journey, never for an admin or supplier destination.
 */
export default async function UnauthorizedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).next;
  const next = safeReturnPath(Array.isArray(raw) ? raw[0] : raw);
  const user = await getCurrentUser().catch(() => null);
  if (user) redirect(resolvePostLoginPath(user.role, next));
  const portal = next ? portalOfPath(next) : "PUBLIC";
  const showJoin = portal === "PUBLIC" || portal === "BUYER";
  return (
    <div className={styles.page}>
      <header className={styles.brand}>
        <Link href="/" aria-label="Finbyn Mart, home" className={styles.logoLink}>
          <Image src="/images/brand/finbyn-mart-logo.png" alt="Finbyn Mart" width={160} height={44} priority className={styles.logo} />
        </Link>
      </header>
      <section className={styles.wrap} aria-labelledby="unauthorized-title">
        <span className={styles.icon} aria-hidden="true"><LockKeyhole size={46} strokeWidth={1.75} /></span>
        <p className={styles.label}>Sign-in required</p>
        <h1 id="unauthorized-title" className={styles.title}>Please sign in to continue.</h1>
        <p className={styles.text}>You need to sign in to access this page.</p>
        <div className={styles.actions}>
          <Link href={signInHref(next)} className={styles.primary}>Sign In</Link>
          <Link href="/" className={styles.secondary}>Go to Homepage</Link>
        </div>
        {showJoin && <p className={styles.join}>New to Finbyn Mart? <Link href="/sign-up" className={styles.link}>Join as a Buyer</Link></p>}
      </section>
      <footer className={styles.foot}><span>Finbyn Mart</span></footer>
    </div>
  );
}
