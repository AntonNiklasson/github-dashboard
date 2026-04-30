---
name: review-pr-comments
description: Assess unresolved PR review comments — decide which warrant code changes and which to skip, with clear reasoning.
user_invocable: true
---

# Review PR Comments

You assess each unresolved PR review comment, deciding whether it warrants a code change or should be skipped, and explain your reasoning. The user relies on your judgment to filter signal from noise in review feedback — honest, well-reasoned assessments are the core deliverable.

**Be honest.** Don't skip comments just to save work — if the reviewer has a point, acknowledge it. Don't blindly agree with every comment either — if something is wrong or doesn't apply, say so with reasoning. The value of this skill is your independent judgment, not rubber-stamping.

## Prerequisites

Before running the fetch script, verify ZX is installed:

```bash
which zx || echo "ZX not found"
```

If ZX is not installed, you need it to execute the fetch script. ZX is Google's tool for writing shell scripts in JavaScript — see https://github.com/google/zx

**Install ZX:** `brew install zx`

Do not proceed with Step 1 until ZX is confirmed installed.

## Step 1: Fetch comments

Run the fetch script bundled with this skill. It handles GraphQL thread resolution filtering and formatting.

```bash
zx .claude/skills/review-pr-comments/fetch-comments.mjs [PR_NUMBER]
```

If an argument was provided by the user (number or URL), pass the PR number. Otherwise omit it to auto-detect from the current branch.

## Step 2: Research each comment

This is the most important step. For every unresolved comment thread:

1. **Read the source file** at the referenced path and line. Read enough surrounding context (50+ lines around the target) to understand the code structure.
2. **Understand what the reviewer is asking for.** Don't just parrot the comment — figure out the actual concern. Is it a bug? A convention violation? A performance issue? A stylistic preference?
3. **Verify the claim.** If the reviewer says "this will fail because X", check whether X is actually true by reading the relevant code. If they suggest an alternative approach, check whether it's feasible in this codebase.
4. **Check project conventions.** Read AGENTS.md files, existing patterns in the codebase, or CI config if the comment relates to standards or conventions.

Do this research in parallel across comments where possible (use the Task tool for independent investigations if needed).

## Step 3: Present assessment

Use `EnterPlanMode` to present results. Lead with the summary, then group by verdict.

### Output format

```markdown
Found **N comments to address** and **M comments to skip**.

---

## Comments to address

### 1. `file/path.ts:LINE` — Short description of the issue

> Quoted comment body (abbreviated if long)

@reviewer_name is right here — [explain why in 1-2 sentences, referencing what you found in the code].

**How to fix**: [Concrete approach — what to change, where, and why. Reference specific lines/functions. If there are multiple options, state which you'd recommend and why.]

### 2. ...

---

## Comments to skip

### 1. `file/path.ts:LINE` — Short description

> Quoted comment body (abbreviated if long)

**Why skip**: [Specific reasoning — e.g., "Already handled by X on line Y", "This is a style preference not matched by project conventions", "The suggested approach won't work because Z".]

### 2. ...
```

### Key rules for the output

- **Lead with the count.** The very first line should tell the user how many comments need action vs can be skipped.
- **Group by verdict.** All "address" comments first, then all "skip" comments. Don't interleave.
- **Short description in each heading.** Not just the file:line — summarize the issue in a few words so the user can scan.
- **Be concrete in fixes.** Don't say "you should fix this". Say exactly what the fix looks like — which function, which line, what the change is.
- **Be concrete in skips.** Don't say "this is fine". Explain specifically why — reference the code, the convention, or the context that makes it a non-issue.

## Verdicts

Every comment gets one of two verdicts:

- **Address**: The comment points out a real issue — bug, missing validation, unclear code, standards violation, etc.
- **Skip**: The comment is subjective preference, already handled, outdated, or doesn't apply.

The rationale is what matters most. A verdict without clear reasoning is useless.

## Important notes

- Do NOT make any code changes. This skill only produces an assessment.
- Group replies in a thread together — assess the thread as a whole, not individual replies.
- If a comment references other comments or previous discussion, note that context.
- If you can't determine whether a thread is resolved from the API response, err on the side of including it.
- Ignore bot comments that are purely informational (coverage reports, automated summaries) — only assess comments from human reviewers or bot comments that raise actionable issues.
