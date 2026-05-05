#!/usr/bin/env zx

$.verbose = false;

const prNumber =
  argv._[0] ||
  (await $`gh pr view --json number --jq '.number'`
    .then((r) => r.stdout.trim())
    .catch(() => {
      console.error("No PR found for current branch.");
      process.exit(1);
    }));

const owner = (
  await $`gh repo view --json owner --jq '.owner.login'`
).stdout.trim();
const repo = (await $`gh repo view --json name --jq '.name'`).stdout.trim();

const THREADS_QUERY = `
  query($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        reviewThreads(first: 100) {
          nodes {
            isResolved
            comments(first: 100) {
              nodes {
                body
                path
                line
                originalLine
                diffHunk
                author { login }
                url
              }
            }
          }
        }
      }
    }
  }
`;

const threads = JSON.parse(
  (
    await $`gh api graphql -f query=${THREADS_QUERY} -f owner=${owner} -f repo=${repo} -F number=${prNumber}`
  ).stdout,
);

const reviews = JSON.parse(
  (await $`gh api repos/${owner}/${repo}/pulls/${prNumber}/reviews --paginate`)
    .stdout,
);

const unresolvedThreads =
  threads.data.repository.pullRequest.reviewThreads.nodes.filter(
    (t) => !t.isResolved,
  );

// Output
console.log(`## PR #${prNumber} — Unresolved Comments\n`);

if (unresolvedThreads.length === 0) {
  console.log("No unresolved review threads.");
} else {
  // TLDR table
  console.log("| # | File | Author | Preview |");
  console.log("|---|------|--------|---------|");
  unresolvedThreads.forEach((thread, i) => {
    const first = thread.comments.nodes[0];
    const line = first.line ?? first.originalLine;
    const preview = first.body
      .split("\n")[0]
      .slice(0, 80)
      .replace(/\|/g, "\\|");
    console.log(
      `| ${i + 1} | \`${first.path}:${line}\` | @${first.author.login} | ${preview} |`,
    );
  });
  console.log("");

  // Detailed threads
  unresolvedThreads.forEach((thread, i) => {
    const [first, ...replies] = thread.comments.nodes;
    const line = first.line ?? first.originalLine;
    const file = first.path;

    console.log(`### Thread ${i + 1}: \`${file}:${line}\`\n`);

    if (first.diffHunk) {
      console.log("```diff");
      console.log(first.diffHunk);
      console.log("```\n");
    }

    console.log(`**@${first.author.login}**:`);
    console.log(
      first.body
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n"),
    );
    console.log("");

    for (const reply of replies) {
      console.log(`  **@${reply.author.login}** (reply):`);
      console.log(
        reply.body
          .split("\n")
          .map((l) => `  > ${l}`)
          .join("\n"),
      );
      console.log("");
    }

    console.log("---\n");
  });
}

// Review-level summary comments
const summaryReviews = reviews.filter(
  (r) => r.body && (r.state === "CHANGES_REQUESTED" || r.state === "COMMENTED"),
);

if (summaryReviews.length > 0) {
  console.log("## Review Summary Comments\n");
  for (const review of summaryReviews) {
    console.log(`**@${review.user.login}** (${review.state}):`);
    console.log(
      review.body
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n"),
    );
    console.log("\n---\n");
  }
}
