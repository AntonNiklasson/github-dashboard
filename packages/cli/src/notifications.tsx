import { Box, Text } from "ink";
import type { Notification } from "sync";
import { ago } from "./time.js";

const colors = {
  accent: "#67e8f9",
  warning: "#fbbf24",
  failure: "#fb7185",
  muted: "#a5b4d4",
  subtle: "#64748b",
  selected: "#27334d",
} as const;

// Nerd Font octicons; requires a patched terminal font.
const icons = {
  pr: "", // oct-git_pull_request
  issue: "", // oct-issue_opened
  release: "", // oct-tag
  discussion: "", // oct-comment_discussion
  commit: "", // oct-git_commit
  checks: "", // oct-checklist
  shield: "", // oct-shield
  shieldCheck: "", // oct-shield_check
  bell: "", // oct-bell
  eye: "", // oct-eye
  mention: "", // oct-mention
  people: "", // oct-people
  person: "", // oct-person
  comment: "", // oct-comment
  pencil: "", // oct-pencil
  sync: "", // oct-sync
  workflow: "", // oct-workflow
  mail: "", // oct-mail
  repo: "", // oct-repo
  clock: "", // oct-clock
} as const;

// Provider text is untrusted: strip control characters (ANSI escapes).
function safe(text: string): string {
  // eslint-disable-next-line no-control-regex -- terminal content must not execute provider escape sequences
  return text.replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
}

const typeIcons: Record<string, string> = {
  PullRequest: icons.pr,
  Issue: icons.issue,
  Release: icons.release,
  Discussion: icons.discussion,
  Commit: icons.commit,
  CheckSuite: icons.checks,
  RepositoryVulnerabilityAlert: icons.shield,
  RepositoryDependabotAlertsThread: icons.shield,
};

// GitHub's notification `reason`, as a short label with an icon.
const reasons: Record<string, { label: string; icon: string; color?: string }> =
  {
    review_requested: {
      label: "Review requested",
      icon: icons.eye,
      color: colors.warning,
    },
    mention: { label: "Mentioned", icon: icons.mention, color: colors.accent },
    team_mention: {
      label: "Team mentioned",
      icon: icons.people,
      color: colors.accent,
    },
    comment: { label: "New comment", icon: icons.comment },
    author: { label: "Your thread", icon: icons.pencil },
    assign: { label: "Assigned", icon: icons.person, color: colors.warning },
    state_change: { label: "State changed", icon: icons.sync },
    ci_activity: { label: "CI activity", icon: icons.workflow },
    subscribed: { label: "Watching", icon: icons.bell },
    manual: { label: "Subscribed", icon: icons.bell },
    security_alert: {
      label: "Security alert",
      icon: icons.shield,
      color: colors.failure,
    },
    approval_requested: {
      label: "Approval requested",
      icon: icons.shieldCheck,
      color: colors.warning,
    },
    invitation: { label: "Invitation", icon: icons.mail },
  };

export function notificationReason(reason: string) {
  return (
    reasons[reason] ?? {
      label: safe(reason).replace(/_/g, " ") || "Notification",
      icon: icons.bell,
    }
  );
}

export function notificationTypeIcon(type: string | null): string {
  return (type && typeIcons[type]) || icons.bell;
}

export function onComment(url: string): boolean {
  return /#(issuecomment|discussion_r|discussioncomment)-/.test(url);
}

// PR/issue/discussion number from the notification's web URL, if any.
export function notificationNumber(url: string): number | null {
  const match = /\/(?:pull|issues|discussions)\/(\d+)/.exec(url);
  return match ? Number(match[1]) : null;
}

// Same shape as a PR row: header, title, meta, spacer.
// Read state isn't shown: a notification is either in the inbox or done.
export function NotificationRow({
  repo,
  notification,
  active,
}: {
  repo: string;
  notification: Notification;
  active: boolean;
}) {
  const reason = notificationReason(notification.reason);
  const number = notificationNumber(notification.url);
  const updated = ago(notification.updatedAt);
  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        backgroundColor={active ? colors.selected : undefined}
      >
        <Text color={colors.subtle} wrap="truncate-end">
          {"    "}
          {number !== null && (
            <>
              #{number}
              {"  "}
            </>
          )}
          <Text color="white">
            {icons.repo} {safe(repo)}
          </Text>
        </Text>
        <Text wrap="truncate-end">
          <Text color="cyan" bold>
            {active ? "❯" : " "}
          </Text>{" "}
          <Text color={colors.accent}>
            {notificationTypeIcon(notification.type)}
          </Text>{" "}
          <Text bold color={active ? "cyan" : "white"}>
            {safe(notification.title)}
          </Text>
        </Text>
        <Text color={colors.muted} wrap="truncate-end">
          {"    "}
          <Text color={reason.color ?? colors.muted}>
            {reason.icon} {reason.label}
            {/* The comment anchor means the activity is a specific comment. */}
            {onComment(notification.url) && " in a comment"}
          </Text>
          {updated && (
            <>
              <Text color={colors.muted}> · </Text>
              {icons.clock} {updated}
            </>
          )}
        </Text>
      </Box>
      <Text> </Text>
    </Box>
  );
}
