"use client";

import { FilterSelect } from "./FilterSelect";

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
      <div className="collection-filter__mobile">
        <FilterSelect label={label} ariaLabel={ariaLabel} value={value} onChange={onChange} options={options} />
      </div>
      <div className="collection-filter__desktop" role="group" aria-label={ariaLabel}>
        {options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
          {option.count !== undefined ? <span className="collection-filter__count">{option.count}</span> : null}
        </button>)}
      </div>
    </div>
  );
}
