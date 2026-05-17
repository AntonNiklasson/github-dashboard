import { cn } from "@/lib/utils";
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
  return (
    <div className="flex items-center gap-2">
      {fields.map((opt) => {
        const active = opt.field === value.field;
        return (
          <button
            key={opt.field}
            type="button"
            className={cn(
              "text-[10px] uppercase tracking-tight tabular-nums",
              active
                ? "text-foreground"
                : "text-muted-foreground/70 hover:text-foreground",
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (active) {
                onChange({
                  field: opt.field,
                  dir: value.dir === "asc" ? "desc" : "asc",
                });
              } else {
                onChange({ field: opt.field, dir: "desc" });
              }
            }}
          >
            {opt.label}
            {active && (
              <span className="ml-0.5">{value.dir === "asc" ? "↑" : "↓"}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
