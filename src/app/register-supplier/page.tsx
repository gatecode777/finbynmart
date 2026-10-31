import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { RegisterSupplierForm } from "@/components/account/RegisterSupplierForm";

export const metadata: Metadata = { title: "Register as a Supplier | Finbyn Mart" };

export default function RegisterSupplierPage() {
  return (
    <AccountShell title="Register as a Supplier" subtitle="Tell us about your business to list your products.">
      <RegisterSupplierForm />
    </AccountShell>
  );
}
