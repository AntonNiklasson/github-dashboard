import { CheckCircle, XCircle } from "lucide-react";
import { Pill } from "./Pill";

export type CiStatus = "success" | "failure" | "pending";

export function toCiStatus(status: string): CiStatus | null {
  if (status === "success") return "success";
  if (status === "failure" || status === "error") return "failure";
  if (status === "pending") return "pending";
  return null;
}

export function StatusBadge({ status }: { status: CiStatus }) {
  switch (status) {
    case "success":
      return (
        <Pill icon={CheckCircle} tone="green">
          passing
        </Pill>
      );
    case "failure":
      return (
        <Pill icon={XCircle} tone="red">
          failing
        </Pill>
      );
    case "pending":
      return (
        <Pill tone="amber">
          <span
            className="relative flex size-3 items-center justify-center"
            aria-hidden
          >
            <span className="absolute inline-flex size-2 animate-ping rounded-full bg-amber-500 opacity-75 [animation-duration:2s]" />
            <span className="relative inline-flex size-1.5 rounded-full bg-amber-500" />
          </span>
          running checks
        </Pill>
      );
  }
}
