// Read GitHub's auto-generated release notes from stdin and rewrite the
// "What's Changed" section so PRs are grouped under one `### @author`
// heading per contributor, instead of repeating "by @author" on each line.
// Other sections ("New Contributors", "Full Changelog") pass through untouched.

import { readFileSync } from "node:fs";

const lines = readFileSync(0, "utf8").split("\n");
const out = [];
const byUser = new Map();
let inSection = false;

function flush() {
  if (byUser.size === 0) return;
  const blocks = [];
  for (const [user, prs] of byUser) {
    blocks.push(
      [`### ${user}`, ...prs.map((p) => `- ${p.title} (#${p.num})`)].join("\n"),
    );
  }
  byUser.clear();
  out.push(blocks.join("\n\n"));
}

for (const line of lines) {
  if (!inSection) {
    out.push(line);
    if (/^## What['’]s Changed$/.test(line)) inSection = true;
    continue;
  }
  const m = line.match(/^\* (.+) by (@\S+) in .+\/pull\/(\d+)$/);
  if (m) {
    const [, title, user, num] = m;
    if (!byUser.has(user)) byUser.set(user, []);
    byUser.get(user).push({ title, num });
    continue;
  }
  flush();
  inSection = false;
  out.push(line);
}
flush();

process.stdout.write(out.join("\n"));
