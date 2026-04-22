import { ShieldAlert } from "lucide-react";

export function CodeOwnerReviewBadge() {
  return (
    <div className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 dark:bg-blue-900/30">
      <ShieldAlert className="h-3 w-3 text-blue-700 dark:text-blue-400" />
      <span className="text-[10px] font-medium text-blue-700 dark:text-blue-400">
        Missing code owner approval
      </span>
    </div>
  );
}
