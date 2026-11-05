import Form from "next/form";
import Link from "next/link";
import { Search } from "lucide-react";
import { FilterDrawer } from "@/components/ui/FilterDrawer";
import styles from "./FilterBar.module.css";

export type FilterField =
  | { kind: "search"; name: string; label: string; placeholder?: string; value?: string }
  | { kind: "number"; name: string; label: string; placeholder?: string; value?: string }
  | { kind: "select"; name: string; label: string; value?: string; options: { label: string; value: string }[] };

interface FilterBarProps {
  action: string;
  fields: FilterField[];
  /** Carried through the submit unchanged (e.g. an active seller filter). */
  hidden?: Record<string, string | undefined>;
  resetHref: string;
}

/**
 * GET form: filters live in the URL and work without JavaScript. With JavaScript, next/form turns the submit
 * into a client-side navigation (no full page reload). The key makes the fields follow the URL after each navigation.
 */
export function FilterBar({ action, fields, hidden = {}, resetHref }: FilterBarProps) {
  return (
    <FilterDrawer breakpoint="md">
    <Form key={JSON.stringify([fields.map((f) => f.value ?? ""), hidden])} className={styles.bar} action={action} role="search">
      {Object.entries(hidden).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null,
      )}

      {fields.map((field) => (
        <label key={field.name} className={styles.field}>
          <span className={styles.label}>{field.label}</span>
          {field.kind === "select" ? (
            <select name={field.name} defaultValue={field.value ?? ""} className={styles.control}>
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              name={field.name}
              type={field.kind === "number" ? "number" : "search"}
              inputMode={field.kind === "number" ? "numeric" : undefined}
              min={field.kind === "number" ? 0 : undefined}
              defaultValue={field.value ?? ""}
              placeholder={field.placeholder}
              className={styles.control}
            />
          )}
        </label>
      ))}

      <div className={styles.actions}>
        <button type="submit" className={styles.apply}>
          <Search size={16} strokeWidth={2} aria-hidden />
          Apply
        </button>
        <Link href={resetHref} className={styles.reset}>
          Reset
        </Link>
      </div>
    </Form>
    </FilterDrawer>
  );
}
