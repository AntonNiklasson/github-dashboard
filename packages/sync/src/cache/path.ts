import { homedir } from "node:os";
import { join } from "node:path";

export function resolveCachePath(): string {
  const xdg = process.env.XDG_CACHE_HOME?.trim();
  const base =
    xdg && xdg.length > 0
      ? xdg
      : process.env.HOME
        ? join(homedir(), ".cache")
        : null;
  if (!base) {
    throw new Error(
      "cannot resolve cache path: neither $XDG_CACHE_HOME nor $HOME is set",
    );
  }
  return join(base, "github-dashboard", "cache.sqlite");
}
