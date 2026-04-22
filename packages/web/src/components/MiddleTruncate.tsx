import { truncateMiddle } from "../utils/truncate";
import { Text } from "./Text";

type Size = "small" | "normal" | "large";
type Variant = "primary" | "secondary" | "tertiary";

interface Props {
  children: string;
  max?: number;
  size?: Size;
  variant?: Variant;
  bold?: boolean;
  className?: string;
}

export function MiddleTruncate({ children, max = 16, ...textProps }: Props) {
  return (
    <Text title={children} {...textProps}>
      {truncateMiddle(children, max)}
    </Text>
  );
}
