import Link from "next/link";
import { ChevronRight, Headphones, LifeBuoy, Mail, MessageCircle, MessageSquareText, Phone } from "lucide-react";
import type { SupportChannel } from "@/lib/support/channels";
import styles from "./Support.module.css";

const ICONS = { ticket: LifeBuoy, contact: MessageSquareText, email: Mail, phone: Phone, chat: MessageCircle } as const;

/**
 * Only the channels that are really set up (see src/lib/support/channels.ts). An e-mail address, a phone number and opening hours appear
 * only when configured; live chat is shown as not available, never as Online. Nothing is copied from a design.
 */
export function SupportContactChannels({ channels }: { channels: SupportChannel[] }) {
  return (
    <section className={styles.panel} id="other-ways" aria-labelledby="other-ways-title">
      <h2 id="other-ways-title" className={styles.panelTitle}><Headphones size={22} aria-hidden /> Other Ways to Get Help</h2>
      <ul className={styles.channels}>
        {channels.map((c) => {
          const Icon = ICONS[c.key];
          const external = c.href?.startsWith("mailto:") || c.href?.startsWith("tel:");
          return (
            <li key={c.key} className={`${styles.channel} ${c.available ? "" : styles.channelOff}`}>
              <span className={styles.channelIcon} aria-hidden><Icon size={20} /></span>
              <span>
                <p className={styles.channelName}>{c.label}</p>
                {c.detail && <p className={styles.channelNote}>{c.detail}</p>}
                {c.note && <p className={styles.channelNote}>{c.note}</p>}
              </span>
              {c.available && c.href ? (
                external || c.href.startsWith("#") ? <a href={c.href} className={styles.channelLink} aria-label={`${c.label}: open`}><ChevronRight size={18} aria-hidden /></a> : <Link href={c.href} className={styles.channelLink} aria-label={`${c.label}: open`}><ChevronRight size={18} aria-hidden /></Link>
              ) : (
                <span />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
