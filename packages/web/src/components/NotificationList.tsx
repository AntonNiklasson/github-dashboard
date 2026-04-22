import { getInstanceColor } from "../instance-colors";
import type { Notification } from "../types";
import { FocusLi } from "./FocusLi";
import { Text } from "./Text";
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
      <p className="py-4 text-center text-muted-foreground">
        <Text>No notifications</Text>
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
            >
              <div className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  {n.instanceId && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: getInstanceColor(n.instanceId),
                      }}
                      title={`Instance: ${n.instanceId}`}
                    />
                  )}
                  <Text size="small" variant="secondary">
                    {n.repo}
                  </Text>
                </span>
                <Text className="block truncate">{n.title}</Text>
                <div className="mt-0.5 flex items-center gap-2 text-muted-foreground">
                  <Text size="small">{reasonLabels[n.reason] ?? n.reason}</Text>
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
