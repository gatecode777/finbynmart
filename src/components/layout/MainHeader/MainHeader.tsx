import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { SearchBar } from "@/components/layout/SearchBar";
import { HeaderActions } from "./HeaderActions";
import { MobileNavigation } from "@/components/layout/MobileNavigation";
import styles from "./MainHeader.module.css";

export function MainHeader() {
  return (
    <header className={styles.header}>
      <Container>
        <div className={styles.inner}>
          <div className={styles.mobileToggle}>
            <MobileNavigation />
          </div>

          <Link prefetch={false} href="/" className={styles.logoLink} aria-label="Finbyn Mart home">
            <Image
              src="/images/brand/finbyn-mart-logo.png"
              alt="Finbyn Mart"
              width={600}
              height={132}
              className={styles.logo}
              priority
            />
          </Link>

          <div className={styles.searchSlot}>
            <SearchBar />
          </div>

          <HeaderActions />
        </div>
      </Container>
    </header>
  );
}
