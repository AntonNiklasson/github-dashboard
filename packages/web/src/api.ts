import type {
  Instance,
  Notification,
  PR,
  ReviewRequest,
  SearchPR,
} from "./types";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export type ConfigError =
  | { kind: "not_found"; path: string }
  | { kind: "parse"; message: string }
  | { kind: "schema"; path: string; message: string }
  | { kind: "missing_tokens" }
  | { kind: "duplicate_domain"; domain: string }
  | { kind: "placeholder_token"; domain: string }
  | { kind: "auth"; domain: string; message: string };

export type ConfigStatus =
  | { kind: "ready"; instances: Instance[] }
  | { kind: "error"; errors: ConfigError[] };

export interface ConfigResponse {
  path: string;
  example: string;
  theme: "system" | "light" | "dark";
  status: ConfigStatus;
}

export class AutoMergeNotAllowedError extends Error {
  constructor() {
    super("Auto-merge is not allowed for this repository");
  }
}

export const api = {
  getConfig: () => fetchJson<ConfigResponse>("/api/config"),
  createConfig: async () => {
    const res = await fetch("/api/config/create", { method: "POST" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json() as Promise<{ created: boolean; path: string }>;
  },
  reloadConfig: async (): Promise<ConfigResponse> => {
    const res = await fetch("/api/config/reload", { method: "POST" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },
  prs: (instanceId: string, fresh = false) =>
    fetchJson<PR[]>(`/api/${instanceId}/prs${fresh ? "?fresh=1" : ""}`),
  reviews: (instanceId: string, fresh = false) =>
    fetchJson<ReviewRequest[]>(
      `/api/${instanceId}/reviews${fresh ? "?fresh=1" : ""}`,
    ),
  notifications: (instanceId: string, fresh = false) =>
    fetchJson<Notification[]>(
      `/api/${instanceId}/notifications${fresh ? "?fresh=1" : ""}`,
    ),
  searchPrs: (instanceId: string, q: string) =>
    fetchJson<SearchPR[]>(
      `/api/${instanceId}/search/prs?q=${encodeURIComponent(q)}`,
    ),
  userPrs: (instanceId: string, username: string) =>
    fetchJson<PR[]>(
      `/api/${instanceId}/users/${encodeURIComponent(username)}/prs`,
    ),
  dismissNotification: async (instanceId: string, threadId: string) => {
    const res = await fetch(`/api/${instanceId}/notifications/${threadId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },
  toggleDraft: async (instanceId: string, repo: string, prNumber: number) => {
    const [owner, name] = repo.split("/");
    const res = await fetch(
      `/api/${instanceId}/prs/${owner}/${name}/${prNumber}/toggle-draft`,
      {
        method: "POST",
      },
    );
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json() as Promise<{ ok: boolean; draft: boolean }>;
  },
  prMeta: (instanceId: string, repo: string, prNumber: number) => {
    const [owner, name] = repo.split("/");
    return fetchJson<{
      files: {
        filename: string;
        additions: number;
        deletions: number;
        status: string;
        patch: string;
      }[];
      commits: { sha: string; message: string }[];
      checks: { name: string; status: string; conclusion: string | null }[];
    }>(`/api/${instanceId}/prs/${owner}/${name}/${prNumber}/meta`);
  },
  toggleAutoMerge: async (
    instanceId: string,
    repo: string,
    prNumber: number,
  ) => {
    const [owner, name] = repo.split("/");
    const res = await fetch(
      `/api/${instanceId}/prs/${owner}/${name}/${prNumber}/auto-merge`,
      {
        method: "POST",
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      if (body?.error === "auto_merge_not_allowed") {
        throw new AutoMergeNotAllowedError();
      }
      throw new Error(`${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<{ ok: boolean; autoMerge: boolean }>;
  },
  mergePr: async (instanceId: string, repo: string, prNumber: number) => {
    const [owner, name] = repo.split("/");
    const res = await fetch(
      `/api/${instanceId}/prs/${owner}/${name}/${prNumber}/merge`,
      {
        method: "POST",
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message ?? `${res.status} ${res.statusText}`);
    }
    return res.json();
  },
  closePr: async (instanceId: string, repo: string, prNumber: number) => {
    const [owner, name] = repo.split("/");
    const res = await fetch(
      `/api/${instanceId}/prs/${owner}/${name}/${prNumber}/close`,
      {
        method: "POST",
      },
    );
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },
  updatePrTitle: async (
    instanceId: string,
    repo: string,
    prNumber: number,
    title: string,
  ) => {
    const [owner, name] = repo.split("/");
    const res = await fetch(
      `/api/${instanceId}/prs/${owner}/${name}/${prNumber}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      },
    );
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },
  prComments: (instanceId: string, repo: string, prNumber: number) => {
    const [owner, name] = repo.split("/");
    return fetchJson<
      {
        id: number;
        author: string;
        body: string;
        createdAt: string;
        path: string | null;
        inReplyToId: number | null;
      }[]
    >(`/api/${instanceId}/prs/${owner}/${name}/${prNumber}/comments`);
  },
  approvePr: async (instanceId: string, repo: string, prNumber: number) => {
    const [owner, name] = repo.split("/");
    const res = await fetch(
      `/api/${instanceId}/prs/${owner}/${name}/${prNumber}/approve`,
      {
        method: "POST",
      },
    );
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },
  rerunCi: async (instanceId: string, repo: string, prNumber: number) => {
    const [owner, name] = repo.split("/");
    const res = await fetch(
      `/api/${instanceId}/prs/${owner}/${name}/${prNumber}/rerun-ci`,
      {
        method: "POST",
      },
    );
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },
  postComment: async (
    instanceId: string,
    repo: string,
    prNumber: number,
    body: string,
  ) => {
    const [owner, name] = repo.split("/");
    const res = await fetch(
      `/api/${instanceId}/prs/${owner}/${name}/${prNumber}/comment`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      },
    );
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },
};
