import { SelectHTMLAttributes, useId } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import styles from "./Select.module.css";

interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hideLabel?: boolean;
  options: SelectOption[];
}

export function Select({
  label,
  hideLabel,
  options,
  id,
  className,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className={styles.field}>
      {label && (
        <label
          htmlFor={selectId}
          className={clsx(styles.label, hideLabel && "visually-hidden")}
        >
          {label}
        </label>
      )}
      <div className={styles.wrap}>
        <select
          id={selectId}
          className={clsx(styles.select, className)}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown size={16} className={styles.chevron} aria-hidden />
      </div>
    </div>
  );
}
