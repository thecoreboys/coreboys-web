"use client";

import { ChevronDown } from "lucide-react";

type FilterOption = { value: string; label: string; count?: number };

/** One selection, presented as quiet text buttons or a compact device picker. */
export function CollectionFilter({ label = "Creator", ariaLabel, options, value, onChange }: {
  label?: string;
  ariaLabel: string;
  options: readonly FilterOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="collection-filter">
      <label className="collection-filter__mobile">
        <span>{label}</span>
        <span className="collection-filter__select">
          <select aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)}>
            {options.map((option) => <option key={option.value} value={option.value}>
              {option.label}{option.count !== undefined ? ` (${option.count})` : ""}
            </option>)}
          </select>
          <ChevronDown size={15} aria-hidden="true" />
        </span>
      </label>
      <div className="collection-filter__desktop" role="group" aria-label={ariaLabel}>
        {options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
          {option.count !== undefined ? <span className="collection-filter__count">{option.count}</span> : null}
        </button>)}
      </div>
    </div>
  );
}
