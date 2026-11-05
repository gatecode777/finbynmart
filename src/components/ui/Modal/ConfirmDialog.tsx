"use client";

import clsx from "clsx";
import { Modal } from "./Modal";
import styles from "./Modal.module.css";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** "danger" for something that cannot be undone or discards work. */
  tone?: "primary" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The shared "are you sure?" dialog, instead of the browser's own confirm box: same look as the rest of the site, keyboard and
 * screen-reader friendly (alert dialog, focus starts on the safe choice, Escape cancels), and it does not block the page.
 */
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel = "Cancel", tone = "primary", busy = false, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onCancel} role="alertdialog" busy={busy}>
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.btn} onClick={onCancel} disabled={busy} data-autofocus>
          {cancelLabel}
        </button>
        <button type="button" className={clsx(styles.btn, tone === "danger" ? styles.btnDanger : styles.btnPrimary)} onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
