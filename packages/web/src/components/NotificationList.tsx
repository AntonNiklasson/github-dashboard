import { getInstanceColor } from "../instance-colors";
import type { Notification } from "../types";
import { FocusLi } from "./FocusLi";
import { TimeAgo } from "./TimeAgo";

interface Props {
  notifications: Notification[];
  focusIndex: number;
  isFocusedSection: boolean;
}

const reasonLabels: Record<string, string> = {
  mention: "Mention",
  review_requested: "Review requested",
  author: "Author",
  comment: "Comment",
  assign: "Assigned",
  state_change: "Status changed",
  ci_activity: "CI",
  approval_requested: "Approval requested",
  security_alert: "Security alert",
  team_mention: "Team mention",
  subscribed: "Subscribed",
  manual: "Manual",
};

export function NotificationList({
  notifications,
  focusIndex,
  isFocusedSection,
}: Props) {
  if (notifications.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No notifications
      </p>
    );
  }

  return (
    <ul className="space-y-0.5">
      {notifications.map((n, i) => {
        const focused = isFocusedSection && focusIndex === i;
        return (
          <FocusLi key={n.id} focused={focused}>
            <div
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent ${
                focused ? "outline-2 outline-blue-500" : ""
              }`}
              style={
                n.instanceId
                  ? {
                      borderLeft: `4px solid ${getInstanceColor(n.instanceId)}`,
                    }
                  : undefined
              }
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">{n.repo}</div>
                <div className="truncate">{n.title}</div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{reasonLabels[n.reason] ?? n.reason}</span>
                  <TimeAgo date={n.updatedAt} />
                </div>
              </div>
            </div>
          </FocusLi>
        );
      })}
    </ul>
  );
}
