"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { Check, Scale } from "lucide-react";
import { productCompare } from "@/components/ui/WishlistButton/wishlistStore";
import styles from "./CompareButton.module.css";

/**
 * Adds a product to the buyer's comparison list (at most 4) or takes it out. Signed-out visitors are sent to sign in; the state shows
 * only what the server stored. Once added, "View comparison" appears next to the button. Buyer accounts only: for any other account
 * the server refuses and the button says it could not update.
 */
export function CompareButton({ productId, productName, variant = "label" }: { productId: string; productName: string; /** "icon" is the round button on a product card (top-left of the picture); "label" is the text button of a page. */ variant?: "label" | "icon" }) {
  const router = useRouter();
  const pathname = usePathname();
  const state = useSyncExternalStore(productCompare.subscribe, productCompare.getSnapshot, productCompare.getServerSnapshot);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void productCompare.load();
  }, []);

  const inList = state.keys.has(productId);

  async function toggle() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    const result = await productCompare.toggle(productId);
    setPending(false);
    if (result === "auth") router.push(`/sign-in?next=${encodeURIComponent(pathname)}`);
    else if (result === "error") setFailed(true);
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        className={clsx(styles.icon, inList && styles.iconOn)}
        aria-pressed={inList}
        aria-label={inList ? `Remove ${productName} from comparison` : `Add ${productName} to comparison`}
        title={failed ? "Couldn't update. You can compare up to 4 products, from a buyer account." : inList ? "In comparison" : "Compare"}
        disabled={pending}
        onClick={toggle}
      >
        {inList ? <Check size={18} aria-hidden /> : <Scale size={18} aria-hidden />}
      </button>
    );
  }

  return (
    <span className={styles.wrap}>
      <button
        type="button"
        className={clsx(styles.button, inList && styles.on)}
        aria-pressed={inList}
        aria-label={inList ? `Remove ${productName} from comparison` : `Add ${productName} to comparison`}
        disabled={pending}
        onClick={toggle}
      >
        {inList ? <Check size={16} aria-hidden /> : <Scale size={16} aria-hidden />}
        {inList ? "In Comparison" : "Compare"}
      </button>
      {inList && <Link href="/buyer/compare-products" className={styles.view}>View comparison</Link>}
      {failed && <span className={styles.failed} role="status">Couldn&apos;t update. You can compare up to 4 products, from a buyer account.</span>}
    </span>
  );
}
