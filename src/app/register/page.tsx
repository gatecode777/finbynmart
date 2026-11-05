import { redirect } from "next/navigation";
import { safeNext } from "@/lib/inquiries/rules";

/** /register is the entry point of registration. Buyers are the only account type with a full registration page so far. */
export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).next;
  const next = safeNext(Array.isArray(raw) ? raw[0] : raw);
  redirect(next ? `/register/buyer?next=${encodeURIComponent(next)}` : "/register/buyer");
}
