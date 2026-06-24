// Convert a GitHub *API* URL into its corresponding *HTML* URL.
// Ported from packages/server/src/fetchers.ts — the notifications API only
// returns the subject's API URL; we have to derive the html link ourselves.

export function notificationHtmlUrl(
  apiUrl: string | null | undefined,
  type: string | null | undefined,
  repoFullName: string,
  apiBaseUrl: string,
  latestCommentUrl?: string | null,
): string {
  const htmlBase = htmlBaseFromApiBase(apiBaseUrl);
  const repoUrl = `${htmlBase}/${repoFullName}`;

  if (!apiUrl) {
    if (type === "Discussion") return `${repoUrl}/discussions`;
    if (type === "Release") return `${repoUrl}/releases`;
    return repoUrl;
  }

  let path: string;
  try {
    path = new URL(apiUrl).pathname;
  } catch {
    return repoUrl;
  }

  path = path.replace(/^\/api\/v3\/repos\//, "/").replace(/^\/repos\//, "/");
  path = path
    .replace(/^\/([^/]+\/[^/]+)\/pulls\//, "/$1/pull/")
    .replace(/^\/([^/]+\/[^/]+)\/commits\//, "/$1/commit/");
  const releaseMatch = path.match(/^\/([^/]+\/[^/]+)\/releases\/\d+$/);
  if (releaseMatch) return `${htmlBase}/${releaseMatch[1]}/releases`;

  const fragment = commentFragment(latestCommentUrl);
  return `${htmlBase}${path}${fragment ?? ""}`;
}

function commentFragment(
  commentApiUrl: string | null | undefined,
): string | null {
  if (!commentApiUrl) return null;
  let path: string;
  try {
    path = new URL(commentApiUrl).pathname;
  } catch {
    return null;
  }
  path = path.replace(/^\/api\/v3/, "");
  let m: RegExpMatchArray | null;
  if ((m = path.match(/\/issues\/comments\/(\d+)$/)))
    return `#issuecomment-${m[1]}`;
  if ((m = path.match(/\/pulls\/comments\/(\d+)$/)))
    return `#discussion_r${m[1]}`;
  if ((m = path.match(/\/repos\/[^/]+\/[^/]+\/comments\/(\d+)$/)))
    return `#commitcomment-${m[1]}`;
  return null;
}

function htmlBaseFromApiBase(apiBaseUrl: string): string {
  try {
    const u = new URL(apiBaseUrl);
    if (u.hostname === "api.github.com") return "https://github.com";
    return `${u.protocol}//${u.host}`;
  } catch {
    return "https://github.com";
  }
}
