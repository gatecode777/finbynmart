"use client";

import { FormEvent, KeyboardEvent, Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Search, X } from "lucide-react";
import clsx from "clsx";
import { MAX_QUERY_LENGTH } from "@/lib/catalog/listingQuery";
import styles from "./SearchBar.module.css";

const SEARCH_TYPES = [
  { label: "Products", value: "products" },
  { label: "Suppliers", value: "suppliers" },
  { label: "Services", value: "services" },
];

interface Suggestion {
  type: "product" | "category";
  label: string;
  href: string;
}

interface SearchBarProps {
  size?: "default" | "large";
  placeholder?: string;
}

/** Keeps the box in step with the address on the search page (the search text lives in `?q=`). */
function QuerySync({ onChange }: { onChange: (query: string, type: string | undefined) => void }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const type = params.get("type") ?? undefined;
  useEffect(() => {
    if (pathname === "/search") onChange(q, type);
  }, [pathname, q, type, onChange]);
  return null;
}

const DEBOUNCE_MS = 250;
const MIN_LENGTH = 2;

export function SearchBar({
  size = "default",
  placeholder = "Enter product / service / company name...",
}: SearchBarProps) {
  const router = useRouter();
  const uid = useId();
  const typeId = `${uid}-type`;
  const menuId = `${uid}-type-menu`;
  const queryId = `${uid}-query`;
  const listId = `${uid}-suggestions`;
  const inputRef = useRef<HTMLInputElement>(null);
  const typeButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuActive, setMenuActive] = useState(0);
  const [type, setType] = useState(SEARCH_TYPES[0].value);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const controller = useRef<AbortController | undefined>(undefined);

  const sync = useCallback((q: string, t: string | undefined) => {
    clearTimeout(timer.current);
    controller.current?.abort();
    setQuery(q.slice(0, MAX_QUERY_LENGTH));
    if (t && SEARCH_TYPES.some((option) => option.value === t)) setType(t);
    setOpen(false);
  }, []);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      controller.current?.abort();
    },
    [],
  );

  function ask(text: string) {
    clearTimeout(timer.current);
    controller.current?.abort();
    const trimmed = text.trim();
    if (type !== "products" || trimmed.length < MIN_LENGTH) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      // A newer keystroke aborts this request, so a slow answer can never replace a fresher one.
      const request = new AbortController();
      controller.current = request;
      try {
        const response = await fetch(`/api/public/products/suggest?q=${encodeURIComponent(trimmed)}`, { signal: request.signal });
        const data = await response.json();
        if (response.ok && data.ok) {
          setSuggestions(data.data.suggestions);
          setActive(-1);
          setOpen(data.data.suggestions.length > 0);
        } else {
          setOpen(false);
        }
      } catch {
        // aborted or offline: the search itself still works without suggestions
      }
    }, DEBOUNCE_MS);
  }

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function openMenu() {
    setOpen(false);
    setMenuActive(Math.max(0, SEARCH_TYPES.findIndex((option) => option.value === type)));
    setMenuOpen(true);
    // The listbox takes focus so the arrow keys move through the choices.
    requestAnimationFrame(() => menuRef.current?.focus());
  }

  function closeMenu(returnFocus = true) {
    setMenuOpen(false);
    if (returnFocus) typeButtonRef.current?.focus();
  }

  function chooseType(value: string) {
    setType(value);
    setSuggestions([]);
    closeMenu();
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setMenuActive((value) => (value + 1) % SEARCH_TYPES.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setMenuActive((value) => (value - 1 + SEARCH_TYPES.length) % SEARCH_TYPES.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setMenuActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setMenuActive(SEARCH_TYPES.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      chooseType(SEARCH_TYPES[menuActive].value);
    } else if (event.key === "Tab") {
      closeMenu(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim().slice(0, MAX_QUERY_LENGTH);
    if (!trimmed) return;
    clearTimeout(timer.current);
    controller.current?.abort();
    const chosen = open && active >= 0 ? suggestions[active] : undefined;
    if (chosen) return go(chosen.href);
    go(`/search?${type === "products" ? "" : `type=${type}&`}q=${encodeURIComponent(trimmed)}`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => (value + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => (value <= 0 ? suggestions.length - 1 : value - 1));
    }
  }

  return (
    <div className={styles.wrap}>
      <Suspense fallback={null}>
        <QuerySync onChange={sync} />
      </Suspense>
      <form className={clsx(styles.form, size === "large" && styles.large)} onSubmit={handleSubmit} role="search">
        <button
          ref={typeButtonRef}
          id={typeId}
          type="button"
          className={styles.typeButton}
          aria-label={`Search in: ${SEARCH_TYPES.find((option) => option.value === type)?.label}`}
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          // Pressing the button while the menu is open must not blur (and so close) the menu before the click toggles it.
          onMouseDown={(event) => {
            if (menuOpen) event.preventDefault();
          }}
          onClick={() => (menuOpen ? closeMenu() : openMenu())}
        >
          {SEARCH_TYPES.find((option) => option.value === type)?.label}
          <ChevronDown size={14} strokeWidth={2.25} className={clsx(styles.typeChevron, menuOpen && styles.typeChevronOpen)} aria-hidden />
        </button>

        <label className="visually-hidden" htmlFor={queryId}>
          Search
        </label>
        <input
          ref={inputRef}
          id={queryId}
          type="text"
          className={styles.input}
          placeholder={placeholder}
          value={query}
          maxLength={MAX_QUERY_LENGTH}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(event) => {
            setQuery(event.target.value);
            ask(event.target.value);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
        />
        {query && (
          <button
            type="button"
            className={styles.clear}
            aria-label="Clear search"
            onClick={() => {
              // Cancel anything still pending so a late answer cannot reopen the list.
              clearTimeout(timer.current);
              controller.current?.abort();
              setQuery("");
              setSuggestions([]);
              setOpen(false);
              inputRef.current?.focus();
            }}
          >
            <X size={16} strokeWidth={2} aria-hidden />
          </button>
        )}

        <button type="submit" className={styles.submit}>
          <Search size={17} strokeWidth={2} aria-hidden />
          <span className={styles.submitLabel}>Search</span>
        </button>
      </form>

      <ul
        ref={menuRef}
        id={menuId}
        role="listbox"
        aria-label="Search in"
        tabIndex={-1}
        aria-activedescendant={menuOpen ? `${menuId}-${menuActive}` : undefined}
        className={styles.typeMenu}
        hidden={!menuOpen}
        onKeyDown={onMenuKeyDown}
        onBlur={() => closeMenu(false)}
      >
        {SEARCH_TYPES.map((option, index) => (
          <li
            key={option.value}
            id={`${menuId}-${index}`}
            role="option"
            aria-selected={option.value === type}
            className={clsx(styles.typeOption, index === menuActive && styles.typeOptionActive, option.value === type && styles.typeOptionOn)}
            // mousedown (not click) so the list does not blur and close before the choice is made
            onMouseDown={(event) => {
              event.preventDefault();
              chooseType(option.value);
            }}
          >
            <span>{option.label}</span>
            {option.value === type && <Check size={16} strokeWidth={2.25} aria-hidden />}
          </li>
        ))}
      </ul>

      <ul id={listId} role="listbox" aria-label="Search suggestions" className={styles.suggestions} hidden={!open}>
        {suggestions.map((item, index) => (
          <li
            key={`${item.type}-${item.href}`}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            className={clsx(styles.option, index === active && styles.optionActive)}
            // mousedown (not click) so the input does not blur and close the list first
            onMouseDown={(event) => {
              event.preventDefault();
              go(item.href);
            }}
          >
            <Search size={14} strokeWidth={2} aria-hidden />
            <span className={styles.optionLabel}>{item.label}</span>
            {item.type === "category" && <span className={styles.optionKind}>Category</span>}
          </li>
        ))}
      </ul>
      <span className="visually-hidden" role="status" aria-live="polite">
        {open ? `${suggestions.length} suggestions available. Use the arrow keys to choose.` : ""}
      </span>
    </div>
  );
}
