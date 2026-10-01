import type {
  Notification as CachedNotification,
  Metadata,
} from "../../cache/store.js";
import type { GitHubInstance } from "../../config.js";
import { getClient } from "./client.js";
import { notificationHtmlUrl } from "./notificationUrl.js";

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
  instance: GitHubInstance,
  ifNoneMatch: string | null,
): Promise<{ data: CachedNotification[] | null; metadata: Metadata }> {
  const client = getClient(instance);
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
      const headers =
        (e as { response?: { headers?: Record<string, string> } }).response
          ?.headers ?? {};
      return { data: null, metadata: headersMetadata(headers) };
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

  const rows: CachedNotification[] = all
    .filter((n) => !isRedundant(n))
    .map((n) => ({
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
      unread: n.unread,
      updatedAt: n.updated_at,
    }));

  return {
    data: rows,
    metadata: {
      ...headersMetadata(firstPageResp.headers),
      etag: firstPageResp.headers.etag ?? null,
    },
  };
}

function headersMetadata(headers: Record<string, string>): Metadata {
  const remaining = headers["x-ratelimit-remaining"];
  const reset = headers["x-ratelimit-reset"];
  return {
    remaining: remaining === undefined ? null : Number(remaining),
    resetAt:
      reset === undefined ? null : new Date(Number(reset) * 1000).toISOString(),
  };
}
