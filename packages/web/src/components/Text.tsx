import { cn } from "@/lib/utils";

type Size = "small" | "normal" | "large";
type Variant = "primary" | "secondary" | "tertiary";

const sizeClasses: Record<Size, string> = {
  small: "text-xs",
  normal: "text-sm",
  large: "text-base",
};

const variantClasses: Record<Variant, string> = {
  primary: "text-foreground",
  secondary: "text-muted-foreground",
  tertiary: "text-muted-foreground/60",
};

interface Props {
  size?: Size;
  variant?: Variant;
  bold?: boolean;
  debug?: boolean;
  className?: string;
  title?: string;
  children: React.ReactNode;
}

export function Text({
  size = "normal",
  variant = "primary",
  bold = false,
  debug = false,
  className,
  title,
  children,
}: Props) {
  return (
    <span
      title={title}
      className={cn(
        sizeClasses[size],
        variantClasses[variant],
        bold && "font-semibold",
        className,
        debug && "text-red-500",
      )}
    >
      {children}
    </span>
  );
}
