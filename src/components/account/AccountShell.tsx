import { ReactNode } from "react";
import { Container } from "@/components/ui/Container";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PageIntro } from "@/components/ui/PageIntro";
import { PageBody } from "@/components/ui/PageBody";
import styles from "./AccountShell.module.css";

interface AccountShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function AccountShell({ title, subtitle, children }: AccountShellProps) {
  return (
    <Container>
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: title }]} />
      <PageBody>
        <PageIntro title={title} subtitle={subtitle} />
        <div className={styles.card}>{children}</div>
      </PageBody>
    </Container>
  );
}
