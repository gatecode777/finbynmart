"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { FileText, Paperclip, Send, RotateCcw, UploadCloud, X } from "lucide-react";
import { flashToast } from "@/components/ui/Toast";
import { DESCRIPTION_MAX, DESCRIPTION_MIN, SUBJECT_MAX, SUBJECT_MIN, type RelatedType } from "@/lib/support/ticketRules";
import inq from "../inquiries/Inquiries.module.css";
import styles from "./Support.module.css";

export interface SupportFormConfig {
  categories: readonly { value: string; label: string }[];
  relatedTypes: readonly { value: string; label: string }[];
  attachments: { maxFiles: number; maxMb: number; types: readonly string[] };
}

interface Props {
  config: SupportFormConfig;
  /** Called after the server saved the ticket (so the list and the numbers are read again). */
  onCreated: () => void;
}

const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
const EXT = /\.(pdf|png|jpe?g)$/i;
const size = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * The ticket form. The server is the authority (category, related-record ownership, content of the files, duplicates); this form only
 * gives instant feedback with the same limits, shows a real upload progress bar, and shows success only after the server saved the
 * ticket. One submission key per form: a double click or a retry is the same ticket, and the key is renewed after success or Reset.
 */
export function RaiseSupportTicketForm({ config, onCreated }: Props) {
  const id = useId();
  const [category, setCategory] = useState("");
  const [relatedType, setRelatedType] = useState("");
  const [relatedRef, setRelatedRef] = useState("");
  const [options, setOptions] = useState<{ reference: string; label: string }[] | null>(null);
  const [optionsError, setOptionsError] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ error: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const key = useRef(newKey());
  const lim = config.attachments;

  // the buyer's OWN records of the chosen kind
  useEffect(() => {
    setRelatedRef("");
    setOptions(null);
    setOptionsError(false);
    if (!relatedType) return;
    let alive = true;
    void fetch(`/api/buyer/support/related?type=${relatedType}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!alive) return;
        if (b?.ok) setOptions(b.data.options);
        else setOptionsError(true);
      })
      .catch(() => alive && setOptionsError(true));
    return () => {
      alive = false;
    };
  }, [relatedType]);

  function addFiles(list: FileList | File[]) {
    const next = [...files];
    const found: string[] = [];
    for (const f of Array.from(list)) {
      if (!EXT.test(f.name)) found.push(`${f.name}: only PDF, JPG and PNG files can be attached.`);
      else if (f.size === 0) found.push(`${f.name} is empty.`);
      else if (f.size > lim.maxMb * 1024 * 1024) found.push(`${f.name} is larger than ${lim.maxMb} MB.`);
      else if (next.length >= lim.maxFiles) found.push(`You can attach at most ${lim.maxFiles} files.`);
      else next.push(f);
    }
    setFiles(next);
    setErrors((e) => {
      const { attachments, ...rest } = e;
      void attachments;
      return found.length > 0 ? { ...rest, attachments: found[0] } : rest;
    });
  }

  function reset() {
    setCategory("");
    setRelatedType("");
    setSubject("");
    setDescription("");
    setFiles([]);
    setErrors({});
    setBanner(null);
    setProgress(null);
    key.current = newKey();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const found: Record<string, string> = {};
    if (!category) found.category = "Choose an issue category.";
    const s = subject.trim();
    if (s.length < SUBJECT_MIN) found.subject = `Describe the issue briefly (at least ${SUBJECT_MIN} characters).`;
    const d = description.trim();
    if (d.length === 0) found.description = "Describe the issue.";
    else if (d.length < DESCRIPTION_MIN) found.description = `Give a little more detail (at least ${DESCRIPTION_MIN} characters).`;
    if (relatedType && !relatedRef) found.related = "Choose which record this is about, or set Related To back to None.";
    setErrors(found);
    setBanner(null);
    if (Object.keys(found).length > 0) return;

    const form = new FormData();
    form.set("payload", JSON.stringify({ category, subject: s, description, idempotencyKey: key.current, ...(relatedType ? { related: { type: relatedType as RelatedType, reference: relatedRef } } : {}) }));
    for (const f of files) form.append("files", f);

    setBusy(true);
    setProgress(0);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/buyer/support/tickets");
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => {
      setBusy(false);
      setProgress(null);
      setBanner({ error: true, text: "Could not reach the server. Nothing was saved." });
    };
    xhr.onload = () => {
      setBusy(false);
      setProgress(null);
      let body: { ok?: boolean; message?: string; fields?: Record<string, string>; ticket?: { reference: string }; duplicate?: boolean } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.ok) {
        flashToast("success", body.message ?? "Your ticket was saved.");
        reset();
        onCreated();
        return;
      }
      if (body.fields) setErrors(body.fields);
      setBanner({ error: true, text: body.message ?? "The ticket could not be saved. Nothing was saved." });
    };
    xhr.send(form);
  }

  const fieldId = (n: string) => `${id}-${n}`;
  const err = (n: string) => errors[n];
  const d = (n: string) => (err(n) ? `${fieldId(n)}-err` : undefined);

  return (
    <section className={styles.panel} id="raise-ticket" aria-labelledby={fieldId("title")} tabIndex={-1}>
      <h2 id={fieldId("title")} className={styles.panelTitle}><FileText size={22} aria-hidden /> Raise a Support Ticket</h2>
      <p className={styles.panelIntro}>Facing an issue? Let us know. Your ticket is saved with a reference you can quote. No support team replies through this site yet.</p>
      <form className={styles.form} onSubmit={submit} noValidate aria-busy={busy}>
        {banner && <p className={`${styles.banner} ${banner.error ? styles.bannerError : styles.bannerInfo}`} role="alert">{banner.text}</p>}

        <div className={styles.twoCols}>
          <div className={styles.field}>
            <label htmlFor={fieldId("category")} className={styles.label}>Issue Category <span className={styles.required} aria-hidden>*</span><span className="visually-hidden"> (required)</span></label>
            <select id={fieldId("category")} className={styles.select} value={category} onChange={(e) => setCategory(e.target.value)} aria-invalid={Boolean(err("category"))} aria-describedby={d("category")} required>
              <option value="">Select a category</option>
              {config.categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            {err("category") && <p className={styles.error} id={d("category")} role="alert">{err("category")}</p>}
          </div>
          <div className={styles.field}>
            <label htmlFor={fieldId("related-type")} className={styles.label}>Related To (Optional)</label>
            <select id={fieldId("related-type")} className={styles.select} value={relatedType} onChange={(e) => setRelatedType(e.target.value)}>
              <option value="">None</option>
              {config.relatedTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>

        {relatedType && (
          <div className={styles.field}>
            <label htmlFor={fieldId("related")} className={styles.label}>Which {config.relatedTypes.find((t) => t.value === relatedType)?.label.toLowerCase()}?</label>
            <select id={fieldId("related")} className={styles.select} value={relatedRef} onChange={(e) => setRelatedRef(e.target.value)} disabled={options === null || options.length === 0} aria-invalid={Boolean(err("related"))} aria-describedby={d("related")}>
              <option value="">{options === null ? (optionsError ? "Could not load" : "Loading...") : options.length === 0 ? "You have none yet" : "Select a record"}</option>
              {options?.map((o) => <option key={o.reference} value={o.reference}>{o.label}</option>)}
            </select>
            {err("related") && <p className={styles.error} id={d("related")} role="alert">{err("related")}</p>}
            <p className={styles.hint}>Only your own records are listed.</p>
          </div>
        )}

        <div className={styles.field}>
          <label htmlFor={fieldId("subject")} className={styles.label}>Subject <span className={styles.required} aria-hidden>*</span><span className="visually-hidden"> (required)</span></label>
          <input id={fieldId("subject")} className={styles.input} value={subject} maxLength={SUBJECT_MAX} onChange={(e) => setSubject(e.target.value)} placeholder="Briefly describe your issue" aria-invalid={Boolean(err("subject"))} aria-describedby={d("subject")} required />
          {err("subject") && <p className={styles.error} id={d("subject")} role="alert">{err("subject")}</p>}
        </div>

        <div className={styles.field}>
          <label htmlFor={fieldId("description")} className={styles.label}>Description <span className={styles.required} aria-hidden>*</span><span className="visually-hidden"> (required)</span></label>
          <textarea id={fieldId("description")} className={styles.textarea} value={description} maxLength={DESCRIPTION_MAX} onChange={(e) => setDescription(e.target.value)} placeholder="Provide detailed information about the issue..." aria-invalid={Boolean(err("description"))} aria-describedby={d("description")} required />
          <p className={styles.counter} aria-live="polite">{description.length} / {DESCRIPTION_MAX}</p>
          {err("description") && <p className={styles.error} id={d("description")} role="alert">{err("description")}</p>}
        </div>

        <div className={styles.field}>
          <span className={styles.label} id={fieldId("att-label")}>Attachments (Optional)</span>
          <label className={`${styles.drop} ${drag ? styles.dropActive : ""}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}>
            <UploadCloud size={28} aria-hidden />
            <span>Drag &amp; drop files here or click to upload</span>
            <span className={styles.hint}>PDF, JPG or PNG, up to {lim.maxMb} MB each, at most {lim.maxFiles} files</span>
            <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" aria-labelledby={fieldId("att-label")} aria-describedby={d("attachments")} onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
          </label>
          {err("attachments") && <p className={styles.error} id={d("attachments")} role="alert">{err("attachments")}</p>}
          {files.length > 0 && (
            <ul className={styles.files} aria-label="Files to attach">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`}>
                  <span><Paperclip size={14} aria-hidden /> {f.name} <span className={styles.hint}>({size(f.size)})</span></span>
                  <button type="button" className={styles.fileRemove} aria-label={`Remove ${f.name}`} onClick={() => setFiles((cur) => cur.filter((_, n) => n !== i))} disabled={busy}><X size={16} aria-hidden /></button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {progress !== null && (
          <progress className={styles.progress} value={progress} max={100} aria-label="Upload progress" />
        )}

        <div className={styles.actions}>
          <button type="submit" className={`${inq.btn} ${inq.btnPrimary}`} disabled={busy}><Send size={16} aria-hidden /> {busy ? (progress !== null && progress < 100 ? `Uploading ${progress}%` : "Saving...") : "Submit Ticket"}</button>
          <button type="button" className={inq.btn} onClick={reset} disabled={busy}><RotateCcw size={16} aria-hidden /> Reset</button>
        </div>
      </form>
    </section>
  );
}
