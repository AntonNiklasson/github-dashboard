import { useQuery } from "@tanstack/react-query";
import { ArrowRight, GitBranch, GitCommit } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { MarkdownBody } from "./MarkdownBody";
import { ReviewStamp } from "./ReviewStamp";
import { StatusBadge } from "./StatusBadge";
import { TimeAgo } from "./TimeAgo";

interface PanelPr {
  title: string;
  body: string;
  url: string;
  repo: string;
  number: number;
  additions: number;
  deletions: number;
  reviews: { approved: string[]; changesRequested: string[] };
  reviewDecision?: string | null;
  headBranch?: string;
  baseBranch?: string;
  commentCount?: number;
  author?: string;
  instanceId: string;
}

interface Props {
  pr: PanelPr;
  onOpenActionMenu: () => void;
  actionMenuOpen: boolean;
  onClose: () => void;
}

type Tab = "overview" | "comments" | "files";
const tabs: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "comments", label: "Comments" },
  { id: "files", label: "Files" },
];

const ANIM_MS = 200;

export function PrPanel({
  pr,
  onOpenActionMenu,
  actionMenuOpen,
  onClose,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [closing, setClosing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, ANIM_MS);
  };

  const { data: meta, isLoading: metaLoading } = useQuery({
    queryKey: ["pr-meta", pr.instanceId, pr.repo, pr.number],
    queryFn: () => api.prMeta(pr.instanceId, pr.repo, pr.number),
  });

  const { data: comments, isLoading: commentsLoading } = useQuery({
    queryKey: ["pr-comments", pr.instanceId, pr.repo, pr.number],
    queryFn: () => api.prComments(pr.instanceId, pr.repo, pr.number),
    enabled: activeTab === "comments",
  });

  const tabCounts: Partial<Record<Tab, number>> = {
    comments: pr.commentCount,
    files: meta?.files.length,
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (actionMenuOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        requestClose();
        return;
      }
      if (e.key === ".") {
        e.preventDefault();
        onOpenActionMenu();
        return;
      }
      if (e.key === "l" || e.key === "ArrowRight") {
        e.preventDefault();
        setActiveTab((cur) => {
          const idx = tabs.findIndex((t) => t.id === cur);
          return tabs[(idx + 1) % tabs.length].id;
        });
        return;
      }
      if (e.key === "h" || e.key === "ArrowLeft") {
        e.preventDefault();
        setActiveTab((cur) => {
          const idx = tabs.findIndex((t) => t.id === cur);
          return tabs[(idx - 1 + tabs.length) % tabs.length].id;
        });
        return;
      }
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        scrollRef.current?.scrollBy({ top: 80 });
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        scrollRef.current?.scrollBy({ top: -80 });
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, [closing, actionMenuOpen]);

  return (
    <div className="fixed inset-0 z-40 flex">
      <div
        className={`flex w-[60vw] max-w-[1100px] shrink-0 flex-col border-r bg-background shadow-xl ${
          closing
            ? "animate-out slide-out-to-left duration-200 ease-in"
            : "animate-in slide-in-from-left duration-200 ease-out"
        }`}
      >
        {/* Header */}
        <div className="shrink-0 border-b bg-background px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold truncate">{pr.title}</h2>
              <p className="text-xs text-muted-foreground">
                {pr.repo}#{pr.number}
              </p>
            </div>
            <button
              onClick={requestClose}
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6L6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="mt-3 flex gap-1">
            {tabs.map((tab) => {
              const count = tabCounts[tab.id];
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    activeTab === tab.id
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {tab.label}
                  {typeof count === "number" && count > 0 && (
                    <span
                      className={`ml-1.5 ${
                        activeTab === tab.id
                          ? "opacity-70"
                          : "text-muted-foreground/70"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
        >
          {activeTab === "overview" && (
            <OverviewTab pr={pr} meta={meta} isLoading={metaLoading} />
          )}
          {activeTab === "comments" && (
            <CommentsTab
              pr={pr}
              comments={comments}
              isLoading={commentsLoading}
            />
          )}
          {activeTab === "files" && (
            <FilesTab files={meta?.files} isLoading={metaLoading} />
          )}
        </div>
      </div>
      <div
        className={`flex-1 bg-black/20 dark:bg-black/50 ${
          closing
            ? "animate-out fade-out duration-200 ease-in"
            : "animate-in fade-in duration-200 ease-out"
        }`}
        onClick={requestClose}
      />
    </div>
  );
}

function OverviewTab({
  pr,
  meta,
  isLoading,
}: {
  pr: PanelPr;
  meta: Awaited<ReturnType<typeof api.prMeta>> | undefined;
  isLoading: boolean;
}) {
  const approvedCount = pr.reviews.approved.length;
  const changesCount = pr.reviews.changesRequested.length;
  const missingCodeOwner =
    approvedCount > 0 && pr.reviewDecision === "REVIEW_REQUIRED";
  const hasReviewSignal =
    approvedCount > 0 || changesCount > 0 || missingCodeOwner;

  return (
    <div className="space-y-5">
      {/* Branches + Stats */}
      <section className="rounded-md border bg-muted/30 px-3 py-2.5">
        {(pr.headBranch || pr.baseBranch) && (
          <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <GitBranch className="h-3 w-3 shrink-0" />
            {pr.headBranch && (
              <span className="truncate text-foreground">{pr.headBranch}</span>
            )}
            {pr.baseBranch && (
              <>
                <ArrowRight className="h-3 w-3 shrink-0" />
                <span className="truncate">{pr.baseBranch}</span>
              </>
            )}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-0.5 font-mono">
            <span className="text-green-600">+{pr.additions}</span>
            <span>/</span>
            <span className="text-red-600">-{pr.deletions}</span>
          </span>
          {meta?.commits && (
            <span className="flex items-center gap-1">
              <GitCommit className="h-3 w-3" />
              <span>
                {meta.commits.length} commit
                {meta.commits.length === 1 ? "" : "s"}
              </span>
            </span>
          )}
        </div>
      </section>

      {/* Reviews */}
      {hasReviewSignal && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Reviews
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {approvedCount > 0 && (
              <ReviewStamp kind="approved" count={approvedCount} />
            )}
            {changesCount > 0 && (
              <ReviewStamp kind="changes-requested" count={changesCount} />
            )}
            {missingCodeOwner && <ReviewStamp kind="missing-code-owner" />}
          </div>
          {(approvedCount > 0 || changesCount > 0) && (
            <div className="mt-2 space-y-1 text-sm">
              {pr.reviews.approved.map((user) => (
                <div key={user} className="flex items-center gap-2">
                  <span className="text-green-600">✓</span>
                  <span>{user}</span>
                </div>
              ))}
              {pr.reviews.changesRequested.map((user) => (
                <div key={user} className="flex items-center gap-2">
                  <span className="text-red-600">✗</span>
                  <span>{user}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* CI Checks + Commits (two-column) */}
      <div className="grid gap-5 sm:grid-cols-2">
        <CiSection meta={meta} isLoading={isLoading} />
        <CommitsSection commits={meta?.commits} />
      </div>

      {/* Description */}
      {pr.body && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Description
          </h3>
          <MarkdownBody body={pr.body} prUrl={pr.url} repo={pr.repo} />
        </section>
      )}
    </div>
  );
}

function CiSection({
  meta,
  isLoading,
}: {
  meta: Awaited<ReturnType<typeof api.prMeta>> | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          CI Checks
        </h3>
        <p className="text-xs text-muted-foreground">Loading...</p>
      </section>
    );
  }
  if (!meta || meta.checks.length === 0) return <div />;
  const allPassing = meta.checks.every((c) => c.conclusion === "success");
  if (allPassing) {
    return (
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          CI Checks
        </h3>
        <div className="flex items-center gap-2">
          <StatusBadge status="success" />
          <span className="text-xs text-muted-foreground">
            {meta.checks.length} checks
          </span>
        </div>
      </section>
    );
  }
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        CI Checks
      </h3>
      <div className="space-y-1">
        {meta.checks.map((check) => (
          <div key={check.name} className="flex items-center gap-2 text-sm">
            <CheckIcon conclusion={check.conclusion} status={check.status} />
            <span className="truncate">{check.name}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function CommitsSection({
  commits,
}: {
  commits: Awaited<ReturnType<typeof api.prMeta>>["commits"] | undefined;
}) {
  if (!commits || commits.length === 0) return <div />;
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Commits ({commits.length})
      </h3>
      <div className="overflow-hidden rounded-md border">
        {commits.map((c, i) => (
          <div
            key={c.sha}
            className={`flex items-baseline gap-2 px-3 py-1.5 text-sm ${
              i > 0 ? "border-t" : ""
            }`}
          >
            <code className="shrink-0 font-mono text-xs text-muted-foreground">
              {c.sha.slice(0, 7)}
            </code>
            <span className="truncate">{c.message.split("\n")[0]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function CommentsTab({
  pr,
  comments,
  isLoading,
}: {
  pr: PanelPr;
  comments: Awaited<ReturnType<typeof api.prComments>> | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading comments...</p>;
  }

  if (!comments || comments.length === 0) {
    return <p className="text-sm text-muted-foreground">No comments</p>;
  }

  return (
    <div className="space-y-3">
      {comments.map((c) => (
        <div
          key={c.id}
          className="rounded-md border bg-card shadow-sm overflow-hidden"
        >
          <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{c.author}</span>
            <TimeAgo date={c.createdAt} />
            {c.path && (
              <span className="ml-auto truncate font-mono text-[11px]">
                {c.path}
              </span>
            )}
          </div>
          <div className="px-3 py-2">
            <MarkdownBody body={c.body} prUrl={pr.url} repo={pr.repo} />
          </div>
        </div>
      ))}
    </div>
  );
}

function FilesTab({
  files,
  isLoading,
}: {
  files: Awaited<ReturnType<typeof api.prMeta>>["files"] | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading files...</p>;
  }

  if (!files || files.length === 0) {
    return <p className="text-sm text-muted-foreground">No changed files</p>;
  }

  return (
    <div className="space-y-4">
      {files.map((f) => (
        <div key={f.filename}>
          <div className="flex items-center gap-2 text-xs">
            <span className="truncate font-mono font-medium">{f.filename}</span>
            <span className="shrink-0 text-green-600">+{f.additions}</span>
            <span className="shrink-0 text-red-600">-{f.deletions}</span>
          </div>
          {f.patch && (
            <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 font-mono text-[11px] leading-relaxed">
              {f.patch.split("\n").map((line, i) => (
                <div
                  key={i}
                  className={
                    line.startsWith("+")
                      ? "text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/30"
                      : line.startsWith("-")
                        ? "text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-900/30"
                        : line.startsWith("@@")
                          ? "text-blue-600 dark:text-blue-400"
                          : ""
                  }
                >
                  {line}
                </div>
              ))}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

function CheckIcon({
  conclusion,
  status,
}: {
  conclusion: string | null;
  status: string;
}) {
  if (status === "in_progress" || status === "queued") {
    return (
      <svg
        className="h-3.5 w-3.5 animate-spin text-yellow-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          strokeDasharray="60"
          strokeDashoffset="20"
        />
      </svg>
    );
  }
  if (conclusion === "success") {
    return (
      <svg
        className="h-3.5 w-3.5 text-green-600"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 6L9 17l-5-5" />
      </svg>
    );
  }
  if (conclusion === "failure") {
    return (
      <svg
        className="h-3.5 w-3.5 text-red-600"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 6L6 18" />
        <path d="M6 6l12 12" />
      </svg>
    );
  }
  if (conclusion === "skipped" || conclusion === "neutral") {
    return (
      <span className="h-3.5 w-3.5 text-center text-xs text-muted-foreground">
        –
      </span>
    );
  }
  return <span className="h-3.5 w-3.5" />;
}
