const { rmSync } = require("node:fs");
const { dirname, join } = require("node:path");

module.exports = () => {
  // pnpm shares this addon with the Node server/CLI. Rebuilding for Node does
  // not remove electron-rebuild's marker, so a later package can silently ship
  // the wrong ABI unless we invalidate that marker before its dependency pass.
  const addon = dirname(require.resolve("better-sqlite3/package.json"));
  rmSync(join(addon, "build", "Release", ".forge-meta"), { force: true });
  return true;
};
