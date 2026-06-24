import type { NotificationRow, Repository } from "../../cache/store.js";
import type { GitHubInstance } from "../../config.js";
import { getClient } from "./client.js";
import { notificationHtmlUrl } from "./notificationUrl.js";

export interface FetchNotificationsResult {
  count: number;
  notModified: boolean;
  rateRemaining: number | null;
}

const PAGES = 3;
const PER_PAGE = 50;

type Notification = {
  id: string;
  reason: string;
  unread: boolean;
  updated_at: string;
  subject: {
    title: string;
    type: string | null;
    url: string | null;
    latest_comment_url: string | null;
  };
  repository: { full_name: string };
};

const redundantRules: ReadonlyArray<(n: Notification) => boolean> = [
  (n) => n.reason === "review_requested",
  (n) => n.reason === "ci_activity",
  (n) => n.subject.type === "PullRequest" && n.reason === "author",
  (n) => n.subject.type === "PullRequest" && n.reason === "state_change",
  (n) => n.reason === "subscribed",
];

function isRedundant(n: Notification): boolean {
  return redundantRules.some((rule) => rule(n));
}

export async function fetchNotifications(
  repo: Repository,
  instance: GitHubInstance,
): Promise<FetchNotificationsResult> {
  const client = getClient(instance);
  const state = repo.getSyncState(instance.id, "notifications");
  const ifNoneMatch = state?.last_etag ?? null;

  let firstPageResp: { data: Notification[]; headers: Record<string, string> };
  try {
    firstPageResp =
      (await client.activity.listNotificationsForAuthenticatedUser({
        all: true,
        per_page: PER_PAGE,
        page: 1,
        headers: ifNoneMatch ? { "if-none-match": ifNoneMatch } : {},
      })) as unknown as {
        data: Notification[];
        headers: Record<string, string>;
      };
  } catch (err) {
    const e = err as { status?: number };
    if (e.status === 304) {
      repo.upsertSyncState({
        instance_id: instance.id,
        kind: "notifications",
        last_run_at: new Date().toISOString(),
        last_etag: null,
        last_modified: null,
        rate_remaining: null,
        rate_reset_at: null,
      });
      return { count: 0, notModified: true, rateRemaining: null };
    }
    throw err;
  }

  // A short first page means there are no further pages — skip the extra
  // REST calls (which are charged against the rate limit, unlike 304s).
  const remainingPages =
    firstPageResp.data.length < PER_PAGE
      ? []
      : await Promise.all(
          Array.from({ length: PAGES - 1 }, (_, i) =>
            client.activity.listNotificationsForAuthenticatedUser({
              all: true,
              per_page: PER_PAGE,
              page: i + 2,
            }),
          ),
        );

  const all: Notification[] = [
    ...firstPageResp.data,
    ...remainingPages.flatMap((r) => r.data as unknown as Notification[]),
  ];

  const rows: NotificationRow[] = all
    .filter((n) => !isRedundant(n))
    .map((n) => ({
      instance_id: instance.id,
      id: n.id,
      title: n.subject.title,
      type: n.subject.type,
      reason: n.reason,
      repo: n.repository.full_name,
      url: notificationHtmlUrl(
        n.subject.url,
        n.subject.type,
        n.repository.full_name,
        instance.baseUrl,
        n.subject.latest_comment_url,
      ),
      unread: n.unread ? 1 : 0,
      updated_at: n.updated_at,
    }));

  repo.replaceNotifications(instance.id, rows);

  const rateRemainingRaw = firstPageResp.headers["x-ratelimit-remaining"];
  const rateRemaining = rateRemainingRaw
    ? Number.parseInt(rateRemainingRaw, 10)
    : null;
  const rateResetRaw = firstPageResp.headers["x-ratelimit-reset"];
  const rateResetAt = rateResetRaw
    ? new Date(Number.parseInt(rateResetRaw, 10) * 1000).toISOString()
    : null;

  repo.upsertSyncState({
    instance_id: instance.id,
    kind: "notifications",
    last_run_at: new Date().toISOString(),
    last_etag: firstPageResp.headers.etag ?? null,
    last_modified: firstPageResp.headers["last-modified"] ?? null,
    rate_remaining: rateRemaining,
    rate_reset_at: rateResetAt,
  });

  return {
    count: rows.length,
    notModified: false,
    rateRemaining,
  };
}
