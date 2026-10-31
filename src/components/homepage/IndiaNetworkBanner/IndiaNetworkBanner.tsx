import Link from "next/link";
import { ArrowRight, MapPinned } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { NETWORK_STATS } from "@/lib/constants/trust";
import styles from "./IndiaNetworkBanner.module.css";

export function IndiaNetworkBanner() {
  return (
    <section className={styles.section} aria-labelledby="network-heading">
      <Container>
        <div className={styles.panel}>
          <div className={styles.copy}>
            <h2 id="network-heading">
              Trusted by
              <br />
              Businesses Across India
            </h2>
            <p>
              Join thousands of companies who source smarter with Finbyn Kart.
            </p>
            <Link href="/register-supplier" className={styles.cta}>
              Join as Supplier
              <ArrowRight size={16} strokeWidth={2} aria-hidden />
            </Link>
          </div>

          <div className={styles.stats}>
            {NETWORK_STATS.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className={styles.stat}>
                  <span className={styles.statIcon}>
                    <Icon size={18} strokeWidth={2} aria-hidden />
                  </span>
                  <span>
                    <span className={styles.statValue}>{stat.value}</span>
                    <span className={styles.statLabel}>{stat.label}</span>
                  </span>
                </div>
              );
            })}
          </div>

          {/* Licensed India map asset pending — see docs/MISSING_ASSETS.md */}
          <div className={styles.mapPlaceholder}>
            <MapPinned size={40} strokeWidth={1.25} aria-hidden />
            <span>India network map pending</span>
          </div>
        </div>
      </Container>
    </section>
  );
}
