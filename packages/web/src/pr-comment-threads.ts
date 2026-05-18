import type { api } from "./api";

export type Comment = Awaited<ReturnType<typeof api.prComments>>[number];

export interface Thread {
  root: Comment;
  replies: Comment[];
}

export function buildThreads(comments: Comment[]): Thread[] {
  const byId = new Map<number, Comment>();
  for (const c of comments) byId.set(c.id, c);

  // rootOf[id] = id of ultimate root (== id when itself a root).
  // Path-compressed so each node resolves in O(1) amortized.
  const rootOf = new Map<number, number>();
  const resolveRoot = (start: Comment): number => {
    const cached = rootOf.get(start.id);
    if (cached != null) return cached;
    const path: number[] = [];
    let cur: Comment | undefined = start;
    while (cur && cur.inReplyToId != null) {
      const hit = rootOf.get(cur.id);
      if (hit != null) {
        for (const id of path) rootOf.set(id, hit);
        return hit;
      }
      path.push(cur.id);
      const parent = byId.get(cur.inReplyToId);
      if (!parent || parent.id === cur.id) break;
      cur = parent;
    }
    const rootId = cur?.id ?? start.id;
    for (const id of path) rootOf.set(id, rootId);
    rootOf.set(rootId, rootId);
    return rootId;
  };

  const repliesByRoot = new Map<number, Comment[]>();
  const roots: Comment[] = [];

  // Input is already sorted asc by createdAt (server-side), so push order
  // is chronological — no per-thread resort needed.
  for (const c of comments) {
    if (c.inReplyToId != null && byId.has(c.inReplyToId)) {
      const rootId = resolveRoot(c);
      if (rootId === c.id) {
        roots.push(c);
      } else {
        const arr = repliesByRoot.get(rootId);
        if (arr) arr.push(c);
        else repliesByRoot.set(rootId, [c]);
      }
    } else {
      roots.push(c);
    }
  }

  return roots.map((root) => ({
    root,
    replies: repliesByRoot.get(root.id) ?? [],
  }));
}
