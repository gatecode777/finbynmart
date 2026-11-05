"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import clsx from "clsx";
import { productWishlist, supplierWishlist, type WishlistStore } from "./wishlistStore";
import styles from "./WishlistButton.module.css";

/**
 * The saved state of one item and the action that changes it. Signed-out visitors are sent to sign in; nothing is
 * shown as saved unless the server stored it.
 */
function useSaved(store: WishlistStore, id: string) {
  const router = useRouter();
  const wishlist = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void store.load();
  }, [store]);

  async function toggle() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    const result = await store.toggle(id);
    setPending(false);
    if (result === "auth") router.push("/sign-in");
    else if (result === "error") setFailed(true);
  }

  return { saved: wishlist.keys.has(id), pending, failed, toggle };
}

interface HeartProps {
  store: WishlistStore;
  id: string;
  name: string;
  /** Plural noun for the labels: "products" or "suppliers". */
  noun: string;
}

function HeartButton({ store, id, name, noun }: HeartProps) {
  const { saved, pending, failed, toggle } = useSaved(store, id);
  return (
    <button
      type="button"
      className={clsx(styles.button, saved && styles.saved)}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from saved ${noun}` : `Save ${name}`}
      title={failed ? "Couldn't update. Try again." : saved ? "Saved" : "Save"}
      disabled={pending}
      onClick={toggle}
    >
      <Heart size={18} strokeWidth={2} fill={saved ? "currentColor" : "none"} aria-hidden />
    </button>
  );
}

/** Heart on a product card or product page. */
export function WishlistButton({ productId, productName }: { productId: string; productName: string }) {
  return <HeartButton store={productWishlist} id={productId} name={productName} noun="products" />;
}

/** Heart on a supplier card. Saves to the buyer's saved suppliers. */
export function SupplierWishlistButton({ supplierId, supplierName }: { supplierId: string; supplierName: string }) {
  return <HeartButton store={supplierWishlist} id={supplierId} name={supplierName} noun="suppliers" />;
}

/** "Save Supplier" with a label, for the supplier profile header. */
export function SupplierSaveButton({ supplierId, supplierName }: { supplierId: string; supplierName: string }) {
  const { saved, pending, failed, toggle } = useSaved(supplierWishlist, supplierId);
  return (
    <>
      <button
        type="button"
        className={clsx(styles.labelled, saved && styles.labelledOn)}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${supplierName} from saved suppliers` : `Save supplier ${supplierName}`}
        disabled={pending}
        onClick={toggle}
      >
        <Heart size={18} strokeWidth={2} fill={saved ? "currentColor" : "none"} aria-hidden />
        {saved ? "Saved" : "Save Supplier"}
      </button>
      {failed && (
        <span className={styles.failed} role="status">
          Couldn&apos;t update. Try again.
        </span>
      )}
    </>
  );
}
