import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type Tone = "green" | "amber" | "red" | "blue" | "muted";

const toneClasses: Record<Tone, string> = {
  green: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  muted: "bg-muted text-muted-foreground",
};

interface Props {
  icon?: LucideIcon;
  iconClassName?: string;
  tone?: Tone;
  children: React.ReactNode;
}

export function Pill({
  icon: Icon,
  iconClassName,
  tone = "muted",
  children,
}: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium ${toneClasses[tone]}`}
    >
      {Icon && <Icon className={cn("h-3 w-3", iconClassName)} />}
      {children}
    </span>
  );
}
