"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import styles from "./Dropdown.module.css";

export interface DropdownOption {
  value: string;
  label: string;
  /** Options with the same group are shown under one heading. */
  group?: string;
}

interface Props {
  /** Put the matching <label htmlFor={id}> next to it (it may be visually hidden). */
  id: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  describedBy?: string;
  className?: string;
}

/**
 * Styled replacement for a native <select> (the browser draws the native list and a page cannot style it).
 * Button + listbox pattern: Enter/Space/ArrowDown opens, arrows/Home/End move, typing jumps, Enter selects, Escape closes and returns focus, Tab closes.
 */
export function Dropdown({ id, value, options, onChange, disabled, describedBy, className }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();

  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options[selectedIndex];
  const rows = useMemo(() => options.map((o, i) => ({ o, i, heading: o.group && o.group !== options[i - 1]?.group ? o.group : null })), [options]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const openList = () => { setActive(selectedIndex); setOpen(true); };
  const choose = (i: number) => { onChange(options[i].value); setOpen(false); wrap.current?.querySelector<HTMLElement>("button")?.focus(); };

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) { e.preventDefault(); openList(); }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    else if (e.key === "Tab") setOpen(false);
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(active); }
    else if (e.key.length === 1) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at > 700 ? "" : typed.current.text) + e.key.toLowerCase(), at: now };
      const hit = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
      if (hit >= 0) setActive(hit);
    }
  }

  return (
    <div className={`${styles.wrap} ${className ?? ""}`} ref={wrap} onKeyDown={onKeyDown}>
      <button
        type="button"
        id={id}
        className={styles.button}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
      >
        <span className={styles.value}>{selected?.label ?? ""}</span>
        <ChevronDown size={18} aria-hidden className={`${styles.chev} ${open ? styles.chevOpen : ""}`} />
      </button>
      {open && (
        <ul ref={list} id={listId} role="listbox" className={styles.list} aria-labelledby={id}>
          {rows.map(({ o, i, heading }) => (
            <li key={o.value} role="presentation">
              {heading && <span className={styles.heading} role="presentation">{heading}</span>}
              <span
                id={`${listId}-${i}`}
                data-i={i}
                role="option"
                aria-selected={o.value === value}
                className={`${styles.option} ${i === active ? styles.active : ""} ${o.value === value ? styles.selected : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
              >
                <span>{o.label}</span>
                {o.value === value && <Check size={16} aria-hidden />}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
