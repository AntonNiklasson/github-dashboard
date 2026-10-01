import { expect, test } from "vitest";
import { render } from "ink-testing-library";
import {
  NotificationRow,
  notificationNumber,
  notificationReason,
  onComment,
} from "./notifications.js";

test("parses numbers and comment anchors from notification URLs", () => {
  expect(
    notificationNumber("https://github.com/o/r/pull/12#issuecomment-1"),
  ).toBe(12);
  expect(notificationNumber("https://github.com/o/r/issues/7")).toBe(7);
  expect(
    notificationNumber("https://github.com/o/r/releases/tag/v1"),
  ).toBeNull();
  expect(onComment("https://github.com/o/r/pull/12#issuecomment-1")).toBe(true);
  expect(onComment("https://github.com/o/r/pull/12")).toBe(false);
});

test("labels known reasons and humanizes unknown ones", () => {
  expect(notificationReason("review_requested").label).toBe("Review requested");
  expect(notificationReason("team_mention").label).toBe("Team mentioned");
  expect(notificationReason("some_new_reason").label).toBe("some new reason");
});

test("row shows number, repo, reason and an unread dot only when unread", () => {
  const notification = {
    id: "n",
    title: "Fix \x1b[2J things",
    type: "PullRequest",
    reason: "mention",
    repo: "o/r",
    url: "https://github.com/o/r/pull/12#issuecomment-1",
    unread: true,
    updatedAt: new Date().toISOString(),
  };
  const unread = render(
    <NotificationRow repo="o/r" notification={notification} active={false} />,
  );
  const frame = unread.lastFrame()!;
  expect(frame).toContain("#12");
  expect(frame).toContain("o/r");
  expect(frame).toContain("Mentioned in a comment");
  expect(frame).toContain("just now");
  expect(frame).toContain("");
  expect(frame).not.toContain("\x1b[2J");
  unread.unmount();
  const read = render(
    <NotificationRow
      repo="o/r"
      notification={{ ...notification, unread: false }}
      active={false}
    />,
  );
  expect(read.lastFrame()).not.toContain("");
  read.unmount();
});
