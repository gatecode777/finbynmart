"use client";

import { FormEvent, useId, useRef, useState } from "react";
import { Paperclip, Send, X } from "lucide-react";
import { MESSAGE_MAX, MESSAGE_MIN } from "@/lib/support/conversationRules";
import type { MessageDto } from "@/lib/support/conversationService";
import inq from "../inquiries/Inquiries.module.css";
import { fileSize } from "./SupportMessageBubble";
import styles from "./Support.module.css";
import t from "./TicketDetails.module.css";

interface Props {
  reference: string;
  limits: { maxFiles: number; maxMb: number; canAttach: boolean };
  /** Controlled by the parent so a draft survives switching tabs. */
  text: string;
  files: File[];
  onText: (v: string) => void;
  onFiles: (f: File[]) => void;
  /** Called with the message the server saved (never a guess), and the ticket's status after it. */
  onSent: (message: MessageDto, status: string, statusChanged: boolean) => void;
}

const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
const EXT = /\.(pdf|png|jpe?g)$/i;

/** Reply box: validates like the server (which decides), uploads with a real progress bar, announces the result, and renews its send key only after success. */
export function SupportReplyComposer({ reference, limits, text, files, onText, onFiles, onSent }: Props) {
  const id = useId();
  const key = useRef(newKey());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);

  function addFiles(list: FileList) {
    const next = [...files];
    let problem: string | null = null;
    for (const f of Array.from(list)) {
      if (!EXT.test(f.name)) problem = `${f.name}: only PDF, JPG and PNG files can be attached.`;
      else if (f.size === 0) problem = `${f.name} is empty.`;
      else if (f.size > limits.maxMb * 1024 * 1024) problem = `${f.name} is larger than ${limits.maxMb} MB.`;
      else if (next.length >= limits.maxFiles) problem = `You can attach at most ${limits.maxFiles} files.`;
      else next.push(f);
    }
    onFiles(next);
    setFileError(problem);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const message = text.trim();
    setStatus("");
    if (message.length < MESSAGE_MIN) {
      setError(message.length === 0 ? "Write your reply." : `Write at least ${MESSAGE_MIN} characters.`);
      area.current?.focus();
      return;
    }
    setError(null);
    const form = new FormData();
    form.set("payload", JSON.stringify({ message, idempotencyKey: key.current }));
    for (const f of files) form.append("files", f);
    setBusy(true);
    setProgress(0);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/buyer/support/tickets/${reference}/messages`);
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => {
      setBusy(false);
      setProgress(null);
      setError("Could not reach the server. Your reply was not sent.");
    };
    xhr.onload = () => {
      setBusy(false);
      setProgress(null);
      let body: { ok?: boolean; message?: string; fields?: Record<string, string>; data?: { message: MessageDto; status: string; statusChanged: boolean } } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.ok && body.data) {
        key.current = newKey();
        onText("");
        onFiles([]);
        setFileError(null);
        setStatus("Your reply was sent.");
        onSent(body.data.message, body.data.status, body.data.statusChanged);
        return;
      }
      setError(body.fields?.message ?? body.fields?.attachments ?? body.message ?? "Your reply could not be sent.");
    };
    xhr.send(form);
  }

  return (
    <form className={t.composer} onSubmit={submit} noValidate aria-busy={busy} aria-label="Reply to support">
      <label htmlFor={`${id}-text`} className={styles.label}>Your reply</label>
      <textarea id={`${id}-text`} ref={area} className={styles.textarea} value={text} maxLength={MESSAGE_MAX} onChange={(e) => onText(e.target.value)} placeholder="Type your reply here..." aria-invalid={Boolean(error && !fileError)} aria-describedby={error ? `${id}-err` : undefined} disabled={busy} />
      {error && <p className={styles.error} id={`${id}-err`} role="alert">{error}</p>}
      {fileError && <p className={styles.error} role="alert">{fileError}</p>}
      {files.length > 0 && (
        <ul className={styles.files} aria-label="Files to attach">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <span><Paperclip size={14} aria-hidden /> {f.name} <span className={styles.hint}>({fileSize(f.size)})</span></span>
              <button type="button" className={styles.fileRemove} aria-label={`Remove ${f.name}`} onClick={() => onFiles(files.filter((_, n) => n !== i))} disabled={busy}><X size={16} aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
      {progress !== null && <progress className={styles.progress} value={progress} max={100} aria-label="Upload progress" />}
      <div className={t.composerRow}>
        <label className={t.pick}>
          <Paperclip size={16} aria-hidden /> Attach Files
          <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} disabled={busy || !limits.canAttach} aria-label={`Attach files (PDF, JPG or PNG, up to ${limits.maxMb} MB each, at most ${limits.maxFiles})`} />
        </label>
        <span className={styles.hint}>{limits.canAttach ? `PDF, JPG, PNG (max ${limits.maxMb} MB, up to ${limits.maxFiles} files)` : "File uploads are not available on this server yet."}</span>
        <span className={t.composerSpacer} />
        <span className={styles.counter} aria-live="off">{text.length} / {MESSAGE_MAX}</span>
        <button type="submit" className={`${inq.btn} ${inq.btnPrimary}`} disabled={busy}><Send size={16} aria-hidden /> {busy ? (progress !== null && progress < 100 ? `Uploading ${progress}%` : "Sending...") : "Send Reply"}</button>
      </div>
      <p className="visually-hidden" role="status" aria-live="polite">{status}</p>
    </form>
  );
}
