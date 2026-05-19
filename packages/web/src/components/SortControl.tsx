import type { SortFieldOption, SortState } from "../sort";

interface Props<F extends string> {
  fields: readonly SortFieldOption<F>[];
  value: SortState<F>;
  onChange: (next: SortState<F>) => void;
}

export function SortControl<F extends string>({
  fields,
  value,
  onChange,
}: Props<F>) {
  const activeIdx = fields.findIndex((f) => f.field === value.field);
  const active = fields[activeIdx] ?? fields[0];

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="text-[10px] uppercase tracking-tight tabular-nums text-foreground"
        title="Click to flip direction · press s to cycle dimensions"
        onClick={(e) => {
          e.stopPropagation();
          onChange({
            field: active.field,
            dir: value.dir === "asc" ? "desc" : "asc",
          });
        }}
      >
        {active.label}
        <span className="ml-0.5">{value.dir === "asc" ? "↑" : "↓"}</span>
      </button>
    </div>
  );
}
