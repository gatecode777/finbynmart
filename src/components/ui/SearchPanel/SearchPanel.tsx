"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { MAX_QUERY_LENGTH, normalizeSearchQuery } from "@/lib/catalog/listingQuery";
import styles from "./SearchPanel.module.css";

interface SearchPanelProps {
  /** Page the search belongs to, e.g. /products. */
  action: string;
  label: string;
  placeholder: string;
  /** The search text in the URL. */
  value: string;
  /** Every other active parameter (filters, sort, view), kept when the text changes. The page number is dropped. */
  hidden: [string, string][];
  /** Sits in the page flow (no overlap with a hero above) and is a little more compact. */
  inline?: boolean;
}

const DEBOUNCE_MS = 400;
const MIN_INSTANT_LENGTH = 2;

/**
 * Search card that floats over the bottom edge of the hero. Without JavaScript it is a plain GET form
 * (Enter or the button reloads the page). With JavaScript, typing updates the results after a short pause
 * (no reload) and Enter or the button applies at once. The text lives in the URL (`?q=`), so a refresh or
 * a shared link restores it.
 */
export function SearchPanel({ action, label, placeholder, value, hidden, inline = false }: SearchPanelProps) {
  const router = useRouter();
  const inputId = useId();
  const [text, setText] = useState(value);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSent = useRef(value);

  // Follow the URL when it changes by other means (removing the search chip, Clear search, back button).
  useEffect(() => {
    if (value !== lastSent.current) {
      lastSent.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const go = (next: string, push: boolean) => {
    const normalized = normalizeSearchQuery(next);
    lastSent.current = normalized;
    const params = new URLSearchParams(hidden);
    if (normalized) params.set("q", normalized);
    const qs = params.toString();
    const url = qs ? `${action}?${qs}` : action;
    startTransition(() => {
      if (push) router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    });
  };

  const onChange = (next: string) => {
    setText(next);
    clearTimeout(timer.current);
    const trimmed = next.trim();
    if (trimmed.length === 0 || trimmed.length >= MIN_INSTANT_LENGTH) {
      timer.current = setTimeout(() => go(next, false), DEBOUNCE_MS);
    }
  };

  return (
    <Container>
      <form
        className={clsx(styles.search, inline && styles.inline)}
        role="search"
        method="get"
        action={action}
        aria-busy={pending}
        onSubmit={(event) => {
          event.preventDefault();
          clearTimeout(timer.current);
          go(text, true);
        }}
      >
        {hidden.map(([name, v], index) => (
          <input key={`${name}-${index}`} type="hidden" name={name} value={v} />
        ))}
        <label htmlFor={inputId} className={styles.label}>
          <Search size={26} strokeWidth={2} aria-hidden />
          {label}
        </label>
        <div className={styles.field}>
          <input
            id={inputId}
            name="q"
            type="search"
            className={styles.input}
            placeholder={placeholder}
            value={text}
            maxLength={MAX_QUERY_LENGTH}
            onChange={(event) => onChange(event.target.value)}
            autoComplete="off"
            enterKeyHint="search"
          />
          {pending ? (
            <span className={styles.spinner} aria-hidden>
              <Loader2 size={18} strokeWidth={2} />
            </span>
          ) : (
            text && (
              <button
                type="button"
                className={styles.clear}
                onClick={() => {
                  clearTimeout(timer.current);
                  setText("");
                  go("", true);
                }}
                aria-label="Clear search"
              >
                <X size={18} strokeWidth={2} aria-hidden />
              </button>
            )
          )}
        </div>
        <Button type="submit" className={styles.button}>
          <Search size={17} strokeWidth={2} aria-hidden />
          Search
        </Button>
        <span className="visually-hidden" role="status">
          {pending ? "Searching…" : ""}
        </span>
      </form>
    </Container>
  );
}
