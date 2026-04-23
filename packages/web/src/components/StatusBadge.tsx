import { CheckCircle, Loader2, XCircle } from "lucide-react";
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
        <Pill icon={Loader2} iconClassName="animate-spin" tone="amber">
          pending
        </Pill>
      );
  }
}
