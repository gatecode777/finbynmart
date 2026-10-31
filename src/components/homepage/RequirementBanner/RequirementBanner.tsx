import { ClipboardList, Clock3, Scale, ShieldCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { RequirementForm } from "./RequirementForm";
import styles from "./RequirementBanner.module.css";

const BENEFITS = [
  { title: "Save Time", subtitle: "Get multiple quotes", icon: Clock3 },
  { title: "Compare Offers", subtitle: "Choose the best deal", icon: Scale },
  { title: "Verified Suppliers", subtitle: "Connect with trusted businesses", icon: ShieldCheck },
];

export function RequirementBanner() {
  return (
    <section className={styles.section} aria-labelledby="requirement-heading">
      <Container>
        <div className={styles.panel}>
          <div className={styles.top}>
            <div className={styles.heading}>
              <span className={styles.headingIcon}>
                <ClipboardList size={22} strokeWidth={2} aria-hidden />
              </span>
              <div>
                <p className={styles.eyebrow}>Tell Us Your Requirement</p>
                <h2 id="requirement-heading" className={styles.title}>
                  Get Best Quotes from Verified Suppliers
                </h2>
              </div>
            </div>

            <div className={styles.benefits}>
              {BENEFITS.map((benefit) => {
                const Icon = benefit.icon;
                return (
                  <div key={benefit.title} className={styles.benefit}>
                    <span className={styles.benefitIcon}>
                      <Icon size={16} strokeWidth={2} aria-hidden />
                    </span>
                    <span>
                      <span className={styles.benefitTitle}>{benefit.title}</span>
                      <span className={styles.benefitSubtitle}>{benefit.subtitle}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <RequirementForm />
        </div>
      </Container>
    </section>
  );
}
