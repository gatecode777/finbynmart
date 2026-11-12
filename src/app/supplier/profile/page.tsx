import { redirect } from "next/navigation";

export default async function SupplierProfileRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const tab = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  redirect(tab ? `/supplier/company?tab=${tab}` : "/supplier/company");
}
