import { MessageSquareWarning, ShieldAlert, ThumbsUp } from "lucide-react";
import { Pill } from "./Pill";

export type ReviewStampKind =
  | "approved"
  | "changes-requested"
  | "missing-code-owner";

interface Props {
  kind: ReviewStampKind;
  count?: number;
}

function withCount(label: string, count?: number): string {
  if (!count || count <= 1) return label;
  return `${label} (${count})`;
}

export function ReviewStamp({ kind, count }: Props) {
  switch (kind) {
    case "approved":
      return (
        <Pill icon={ThumbsUp} tone="green">
          {withCount("Approved", count)}
        </Pill>
      );
    case "changes-requested":
      return (
        <Pill icon={MessageSquareWarning} tone="red">
          {withCount("Changes requested", count)}
        </Pill>
      );
    case "missing-code-owner":
      return (
        <Pill icon={ShieldAlert} tone="blue">
          Missing code owner
        </Pill>
      );
  }
}
