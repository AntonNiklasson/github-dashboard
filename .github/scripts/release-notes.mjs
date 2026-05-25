#!/usr/bin/env node
// Reads GitHub's release-notes body on stdin, prints an author-grouped,
// minimal changelog block on stdout. One @-tag per contributor, then a
// flat list of their PR titles.

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  const byUser = new Map();
  for (const line of input.split("\n")) {
    const m = line.match(/^\* (.+?) by @(\S+) in .*\/pull\/(\d+)/);
    if (!m) continue;
    const [, title, user, num] = m;
    if (!byUser.has(user)) byUser.set(user, []);
    byUser.get(user).push({ title, num });
  }
  const out = [];
  for (const [user, prs] of byUser) {
    out.push(`**@${user}**`);
    for (const { title, num } of prs) out.push(`- ${title} (#${num})`);
    out.push("");
  }
  process.stdout.write(out.join("\n").trimEnd() + "\n");
});
