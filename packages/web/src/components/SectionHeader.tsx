import type { Section } from "../hooks";
import { Text } from "./Text";

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
      className="flex cursor-pointer items-center justify-between"
      onClick={onClick}
    >
      <div className="flex items-baseline gap-2">
        <Text
          size="small"
          bold
          variant="secondary"
          className="uppercase tracking-tight"
        >
          {label}
        </Text>
        <Text size="small" variant="tertiary" className="tabular-nums">
          {count}
        </Text>
      </div>
      {isFetching && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/60" />
      )}
    </div>
  );
}
