import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { SupplierRegisterForm } from "@/components/auth/SupplierRegisterForm";
import styles from "@/components/auth/Auth.module.css";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Register as a Supplier | Finbyn Mart", robots: { index: false } };

export default async function RegisterSupplierPage() {
  if (await getCurrentUser().catch(() => null)) redirect("/");
  return (
    <AuthLayout breadcrumb="Register as a Supplier" variant="supplier">
      <h1 className={styles.heading}>Create Your Supplier Account</h1>
      <p className={styles.subheading}>Tell us about your business. Fields marked * are required.</p>
      <SupplierRegisterForm />
    </AuthLayout>
  );
}
