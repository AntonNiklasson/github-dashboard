import type { createSync, NormalizedPr, SyncKind } from "sync";

// Second key after `.`: write actions on the selected PR. Mirrors the web
// action menu (packages/web/src/App.tsx getActionsForItem).
type Runtime = ReturnType<typeof createSync>;
type Actionable = { instanceId: string; pr?: NormalizedPr };

export type ActionOption = {
  key: string;
  label: string;
  /** Ask before running; for actions others will see (e.g. approving). */
  confirm?: string;
  /** Expected result, shown immediately while the action runs. */
  optimistic: Partial<NormalizedPr>;
  /** Resolves with the confirmed fields to show until a resync catches up. */
  run: () => Promise<Partial<NormalizedPr>>;
};

export function actionOptions(
  item: Actionable,
  tab: SyncKind,
  runtime: Runtime,
): ActionOption[] {
  const pr = item.pr;
  if (!pr) return [];
  const target = {
    instanceId: item.instanceId,
    repo: pr.repo,
    number: pr.number,
  };
  const options: ActionOption[] = [];
  if (tab === "prs") {
    options.push({
      key: "d",
      label: pr.draft ? "mark ready" : "convert to draft",
      optimistic: { draft: !pr.draft },
      run: async () => runtime.togglePullRequestDraft(target),
    });
    // GitHub rejects arming auto-merge on drafts.
    if (pr.autoMerge || !pr.draft)
      options.push({
        key: "m",
        label: pr.autoMerge ? "disable auto-merge" : "enable auto-merge",
        optimistic: { autoMerge: !pr.autoMerge },
        run: async () => runtime.togglePullRequestAutoMerge(target),
      });
  }
  // You can't approve your own PRs, so only offer it for review requests.
  if (tab === "reviews")
    options.push({
      key: "a",
      label: "approve",
      confirm: `Approve ${pr.repo}#${pr.number}?`,
      optimistic: { reviewDecision: "APPROVED" },
      run: async () => {
        await runtime.approvePullRequest(target);
        return { reviewDecision: "APPROVED" };
      },
    });
  return options;
}
