import { ReactNode } from "react";
import { ClipboardList, FileText, Heart, KeyRound, LifeBuoy, Lock, Mail, MailCheck, ShieldCheck, Zap, MessageSquareText, Package, Store, UserRound, type LucideIcon } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import styles from "./Auth.module.css";

interface PanelContent {
  title: string;
  lead: string;
  benefits: { icon: LucideIcon; title: string; text: string }[];
  note: string;
}

/** Every account form sits beside one of these panels. The wording promises only what exists today. */
const PANELS = {
  buyer: {
    title: "Join Finbyn Mart",
    lead: "Create a free buyer account to find suppliers and ask for quotes.",
    benefits: [
      { icon: FileText, title: "Post your requirements", text: "Describe what you need once and keep it on your account." },
      { icon: MessageSquareText, title: "Contact suppliers", text: "Send inquiries to suppliers and read their status in one place." },
      { icon: Heart, title: "Save what you like", text: "Keep products and suppliers on a list to come back to." },
      { icon: ClipboardList, title: "Review suppliers", text: "Share your experience to help other buyers decide." },
    ],
    note: "Finbyn Mart does not verify companies or mobile numbers at sign-up. What you enter is stored as you typed it.",
  },
  supplier: {
    title: "List Your Business",
    lead: "Create a supplier account for your business on Finbyn Mart.",
    benefits: [
      { icon: Store, title: "Your supplier account", text: "Register your business details in one place." },
      { icon: Package, title: "Describe what you supply", text: "Tell buyers and Finbyn Mart which products you offer." },
      { icon: UserRound, title: "One sign-in", text: "Use the same sign-in for your account as it grows." },
    ],
    note: "A supplier account is not a verified supplier, and a supplier dashboard and inbox are not available yet. What you enter is stored as you typed it.",
  },
  signin: {
    title: "Welcome Back",
    lead: "Sign in to manage your requirements and inquiries.",
    benefits: [
      { icon: MessageSquareText, title: "Your inquiries", text: "See the inquiries you sent and their status." },
      { icon: Heart, title: "Saved items", text: "Open the products and suppliers you saved." },
      { icon: ClipboardList, title: "Your reviews", text: "Write and manage your supplier reviews." },
    ],
    note: "Never share your password. Finbyn Mart will not ask for it by email.",
  },
  contact: {
    title: "We Are Here To Help",
    lead: "Send us a message about your account, an inquiry or the site.",
    benefits: [
      { icon: LifeBuoy, title: "Buyers and suppliers", text: "Pick the topic that fits so your message is easy to sort." },
      { icon: ClipboardList, title: "A reference number", text: "Every saved message gets a reference you can quote." },
    ],
    note: "Messages are saved on our side. Nobody is notified by email yet, so a reply time cannot be promised.",
  },
  forgot: {
    title: "Reset Your Password Securely",
    lead: "Forgot your password? No worries. We will help you get back to your Finbyn Mart account in a few simple steps.",
    benefits: [
      { icon: Mail, title: "Check Your Email", text: "If an eligible account exists, we send a single-use reset link to that address." },
      { icon: Lock, title: "Create a New Password", text: "Choose a strong password of your own." },
      { icon: ShieldCheck, title: "Get Back to Business", text: "Sign in and continue your sourcing or selling." },
    ],
    note: "For your safety this page never says whether an email address has an account. Finbyn Mart will never ask for your password by email.",
  },
  reset: {
    title: "Create a New Password",
    lead: "Set a strong and secure password to recover your Finbyn Mart account.",
    benefits: [
      { icon: Lock, title: "Keep Your Account Safe", text: "Use a unique password that you do not use anywhere else." },
      { icon: ShieldCheck, title: "Protect Your Business Data", text: "Help prevent unauthorised access to your account and inquiries." },
      { icon: Zap, title: "Continue Your Business", text: "Sign in with your new password and get back to sourcing or selling." },
    ],
    note: "Changing your password signs you out of every device. This link works once.",
  },
  resetDone: {
    title: "You're All Set!",
    lead: "Your password has been successfully reset. You can now sign in to your Finbyn Mart account using your new password.",
    benefits: [
      { icon: Lock, title: "Secure & Updated", text: "Your account now uses the new password you chose." },
      { icon: ShieldCheck, title: "Account Safety", text: "Older sign-ins on this account stop working after a reset." },
      { icon: Zap, title: "Continue Your Business", text: "Sign in and get back to sourcing or selling on Finbyn Mart." },
    ],
    note: "If you did not make this change, contact support straight away.",
  },
  recovery: {
    title: "Account Help",
    lead: "Recover access or confirm your email address.",
    benefits: [
      { icon: KeyRound, title: "Reset your password", text: "A single-use link lets you choose a new password." },
      { icon: MailCheck, title: "Confirm your email", text: "Links work once and expire, for your safety." },
    ],
    note: "Links are sent only when email is set up on this site. If it is not, the page says so.",
  },
} satisfies Record<string, PanelContent>;

export type AuthVariant = keyof typeof PANELS;

interface AuthLayoutProps {
  breadcrumb: string;
  variant: AuthVariant;
  children: ReactNode;
}

export function AuthLayout({ breadcrumb, variant, children }: AuthLayoutProps) {
  const panel = PANELS[variant];
  return (
    <Container>
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: breadcrumb }]} />
      <div className={styles.layout}>
        <aside className={styles.panel} aria-labelledby="panel-heading">
          <h2 id="panel-heading" className={styles.panelTitle}>
            {panel.title}
          </h2>
          <p className={styles.panelLead}>{panel.lead}</p>
          <ul className={styles.benefits}>
            {panel.benefits.map(({ icon: Icon, title, text }) => (
              <li key={title} className={styles.benefit}>
                <span className={styles.benefitIcon}>
                  <Icon size={20} aria-hidden />
                </span>
                <span>
                  <span className={styles.benefitTitle}>{title}</span>
                  <span className={styles.benefitText}>{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className={styles.panelNote}>{panel.note}</p>
        </aside>
        <section className={styles.card}>{children}</section>
      </div>
    </Container>
  );
}
