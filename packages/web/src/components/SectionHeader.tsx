import type { Section } from "../hooks";

interface Props {
  section: Section;
  label: string;
  count: number;
  isActive: boolean;
  isFetching: boolean;
  onClick: () => void;
}

export function SectionHeader({ label, count, isFetching, onClick }: Props) {
  return (
    <div
      className="flex cursor-pointer items-center justify-between pb-2"
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">{label}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {count}
        </span>
      </div>
      {isFetching && (
        <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
      )}
    </div>
  );
}
