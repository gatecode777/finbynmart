import Image from "next/image";
import { SignInForm } from "@/components/auth/SignInForm";
import styles from "./AdminSignIn.module.css";

/**
 * What an anonymous visitor sees at /admin/dashboard: a sign-in form for administrator accounts (no shell, no data, no registration links: an administrator account is created by an operator,
 * never self-registered). After sign-in the server returns the landing path (the dashboard for an administrator; another role goes to its own portal). The requested page stays /admin/dashboard.
 */
export function AdminSignIn() {
  return (
    <main className={styles.wrap}>
      <section className={styles.card} aria-labelledby="admin-signin-heading">
        <Image src="/images/brand/finbyn-mart-logo.png" alt="Finbyn Mart" width={160} height={44} priority className={styles.logo} />
        <h1 id="admin-signin-heading" className={styles.title}>Admin sign in</h1>
        <p className={styles.lead}>Sign in with an administrator account to open the admin dashboard.</p>
        <SignInForm next="/admin/dashboard" hideRegister />
      </section>
    </main>
  );
}
