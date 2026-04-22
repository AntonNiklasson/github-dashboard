import { useState } from "react";
import { PrCard } from "./PrCard";
import type { MergeStatus } from "./PrStateIcon";
import { Text } from "./Text";

export function PrCardPlayground() {
  const [title, setTitle] = useState(
    "AI-13890 mark and filter workflow-initiated chats",
  );
  const [repo, setRepo] = useState("sana-labs/sana-ai");
  const [number, setNumber] = useState(2224);
  const [author, setAuthor] = useState("anton-niklasson");
  const [headBranch, setHeadBranch] = useState(
    "an/chat-initiated-by-workflow-app",
  );
  const [baseBranch, setBaseBranch] = useState("release/2026-05");
  const [reviewDecision, setReviewDecision] =
    useState<string>("REVIEW_REQUIRED");
  const [approvedCount, setApprovedCount] = useState(2);
  const [changesRequestedCount, setChangesRequestedCount] = useState(1);
  const [ciStatus, setCiStatus] = useState("success");
  const [additions, setAdditions] = useState(28);
  const [deletions, setDeletions] = useState(3);
  const [commits, setCommits] = useState(3);
  const [commentCount, setCommentCount] = useState(11);
  const [mergeStatus, setMergeStatus] = useState<MergeStatus>("ready");
  const [autoMerge, setAutoMerge] = useState(true);
  const [conflict, setConflict] = useState(false);
  const [instanceId, setInstanceId] = useState("github.com");
  const [focused, setFocused] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showGrid, setShowGrid] = useState(false);

  const reviews = {
    approved: Array.from({ length: approvedCount }, (_, i) => `user-${i + 1}`),
    changesRequested: Array.from(
      { length: changesRequestedCount },
      (_, i) => `user-${i + 1}`,
    ),
  };
  const reviewDecisionVal = reviewDecision === "none" ? null : reviewDecision;

  return (
    <div className="grid gap-6 lg:h-[min(80vh,1000px)] lg:grid-cols-[280px_1fr]">
      <div className="space-y-4 lg:overflow-y-auto lg:pr-3">
        <Text bold size="small">
          Flags
        </Text>
        <Toggle
          label="Auto-merge"
          checked={autoMerge}
          onChange={setAutoMerge}
        />
        <Toggle label="Conflict" checked={conflict} onChange={setConflict} />
        <Toggle label="Focused" checked={focused} onChange={setFocused} />
        <Toggle label="Editing title" checked={editing} onChange={setEditing} />

        <Text bold size="small" className="mt-4">
          Content
        </Text>
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Repo">
          <input
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Number">
          <input
            type="number"
            value={number}
            onChange={(e) => setNumber(+e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Author">
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Head branch">
          <input
            value={headBranch}
            onChange={(e) => setHeadBranch(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Base branch">
          <input
            value={baseBranch}
            onChange={(e) => setBaseBranch(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Instance">
          <select
            value={instanceId}
            onChange={(e) => setInstanceId(e.target.value)}
            className={inputCls}
          >
            <option value="">none</option>
            <option value="github.com">github.com</option>
            <option value="ghe">ghe</option>
          </select>
        </Field>

        <Text bold size="small" className="mt-4">
          State
        </Text>
        <Field label="Merge status">
          <select
            value={mergeStatus}
            onChange={(e) => setMergeStatus(e.target.value as MergeStatus)}
            className={inputCls}
          >
            <option value="draft">draft</option>
            <option value="ready">ready</option>
            <option value="merge-queue">merge-queue</option>
            <option value="merged">merged</option>
            <option value="closed">closed</option>
          </select>
        </Field>
        <Field label="CI status">
          <select
            value={ciStatus}
            onChange={(e) => setCiStatus(e.target.value)}
            className={inputCls}
          >
            <option value="success">success</option>
            <option value="failure">failure</option>
            <option value="pending">pending</option>
            <option value="unknown">unknown</option>
          </select>
        </Field>
        <Field label="Review decision">
          <select
            value={reviewDecision}
            onChange={(e) => setReviewDecision(e.target.value)}
            className={inputCls}
          >
            <option value="none">none</option>
            <option value="APPROVED">APPROVED</option>
            <option value="CHANGES_REQUESTED">CHANGES_REQUESTED</option>
            <option value="REVIEW_REQUIRED">REVIEW_REQUIRED</option>
          </select>
        </Field>
        <Field label="Approved reviewers">
          <input
            type="number"
            min={0}
            value={approvedCount}
            onChange={(e) => setApprovedCount(+e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Changes requested">
          <input
            type="number"
            min={0}
            value={changesRequestedCount}
            onChange={(e) => setChangesRequestedCount(+e.target.value)}
            className={inputCls}
          />
        </Field>

        <Text bold size="small" className="mt-4">
          Stats
        </Text>
        <Field label="+ Additions">
          <input
            type="number"
            min={0}
            value={additions}
            onChange={(e) => setAdditions(+e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="− Deletions">
          <input
            type="number"
            min={0}
            value={deletions}
            onChange={(e) => setDeletions(+e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Commits">
          <input
            type="number"
            min={0}
            value={commits}
            onChange={(e) => setCommits(+e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Comments">
          <input
            type="number"
            min={0}
            value={commentCount}
            onChange={(e) => setCommentCount(+e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      <div className="lg:overflow-y-auto">
        <div className="mb-3 flex items-center gap-3">
          <Toggle label="Show grid" checked={showGrid} onChange={setShowGrid} />
        </div>
        <div className={`p-2 ${showGrid ? "playground-grid" : ""}`}>
          <PrCard
            title={title}
            url="#"
            repo={repo}
            number={number}
            createdAt={new Date(
              Date.now() - 3 * 24 * 60 * 60_000,
            ).toISOString()}
            updatedAt={new Date(Date.now() - 2 * 60 * 60_000).toISOString()}
            mergeStatus={mergeStatus}
            ciStatus={ciStatus}
            autoMerge={autoMerge}
            headBranch={headBranch || undefined}
            baseBranch={baseBranch || undefined}
            reviews={reviews}
            reviewDecision={reviewDecisionVal}
            additions={additions}
            deletions={deletions}
            commits={commits}
            commentCount={commentCount}
            focused={focused}
            instanceId={instanceId || undefined}
            author={author || undefined}
            editing={editing}
            conflict={conflict}
            onSaveTitle={(t) => {
              if (t) setTitle(t);
              setEditing(false);
            }}
          />
        </div>
        {showGrid && (
          <style>{`.playground-grid, .playground-grid * { outline: 1px dashed rgba(239, 68, 68, 0.4); }`}</style>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "h-7 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-inset focus:ring-ring";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <Text size="small" variant="secondary">
        {label}
      </Text>
      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <Text size="small">{label}</Text>
    </label>
  );
}
