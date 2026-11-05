"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import clsx from "clsx";
import styles from "./ShareButton.module.css";

/**
 * Share a page. Uses the browser's share sheet when it has one; otherwise copies the link and says so. "Link copied"
 * is shown only after the clipboard accepted it; if the browser refuses, the message says the copy failed.
 */
export function ShareButton({ title, path, className }: { title: string; /** Site-relative URL to share, e.g. /products/<slug>. */ path: string; className?: string }) {
  const [status, setStatus] = useState("");
  // Only known after hydration, so server and browser render the same first markup.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== "undefined" && "share" in navigator), []);

  async function share() {
    const url = `${window.location.origin}${path}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setStatus("Link copied to the clipboard.");
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") return;
      setStatus("Couldn't copy the link. Copy it from the address bar.");
    }
  }

  return (
    <span className={styles.wrap}>
      <button type="button" className={clsx(styles.share, className)} onClick={share}>
        {canShare ? <Share2 size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
        Share
      </button>
      <span className="visually-hidden" role="status">
        {status}
      </span>
      {status && (
        <span className={styles.status} aria-hidden>
          <Check size={14} aria-hidden /> {status}
        </span>
      )}
    </span>
  );
}
