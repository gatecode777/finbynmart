"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import clsx from "clsx";
import styles from "./SearchBar.module.css";

const SEARCH_TYPES = [
  { label: "Products", value: "products" },
  { label: "Suppliers", value: "suppliers" },
  { label: "Services", value: "services" },
];

interface SearchBarProps {
  size?: "default" | "large";
  placeholder?: string;
}

export function SearchBar({
  size = "default",
  placeholder = "Enter product / service / company name...",
}: SearchBarProps) {
  const router = useRouter();
  const [type, setType] = useState(SEARCH_TYPES[0].value);
  const [query, setQuery] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/search?type=${type}&q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form
      className={clsx(styles.form, size === "large" && styles.large)}
      onSubmit={handleSubmit}
      role="search"
    >
      <label className="visually-hidden" htmlFor="search-type">
        Search type
      </label>
      <select
        id="search-type"
        className={styles.typeSelect}
        value={type}
        onChange={(event) => setType(event.target.value)}
      >
        {SEARCH_TYPES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <label className="visually-hidden" htmlFor="search-query">
        Search
      </label>
      <input
        id="search-query"
        type="text"
        className={styles.input}
        placeholder={placeholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <button type="submit" className={styles.submit}>
        <Search size={17} strokeWidth={2} aria-hidden />
        Search
      </button>
    </form>
  );
}
