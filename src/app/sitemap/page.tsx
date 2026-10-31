import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PageIntro } from "@/components/ui/PageIntro";
import { PageBody } from "@/components/ui/PageBody";
import styles from "./sitemap.module.css";

export const metadata: Metadata = { title: "Sitemap | Finbyn Mart" };

const GROUPS = [
  {
    title: "Browse",
    links: [
      { label: "Home", href: "/" },
      { label: "All Categories", href: "/categories" },
      { label: "Browse Products", href: "/products" },
      { label: "Find Suppliers", href: "/suppliers" },
      { label: "Industry Solutions", href: "/industries" },
      { label: "Search", href: "/search" },
    ],
  },
  {
    title: "For Buyers",
    links: [
      { label: "Post Requirement", href: "/post-requirement" },
      { label: "How It Works", href: "/how-it-works" },
    ],
  },
  {
    title: "For Suppliers",
    links: [
      { label: "Register as a Supplier", href: "/register-supplier" },
      { label: "Sign In", href: "/sign-in" },
    ],
  },
];

export default function SitemapPage() {
  return (
    <Container>
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Sitemap" }]} />
      <PageBody>
        <PageIntro title="Sitemap" subtitle="Every published page on Finbyn Mart." />
        <div className={styles.groups}>
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h2 className={styles.title}>{group.title}</h2>
              <ul className={styles.list}>
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </PageBody>
    </Container>
  );
}
