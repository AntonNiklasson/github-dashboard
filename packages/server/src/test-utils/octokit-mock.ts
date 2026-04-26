/**
 * Minimal Octokit stub used when code-under-test calls `new Octokit(...)`
 * directly (e.g. the PUT /config token validation path).
 */
export function octokitStub(
  opts: { login?: string; throws?: Error } = {},
): new (
  args?: unknown,
) => { users: { getAuthenticated: () => Promise<unknown> } } {
  const login = opts.login ?? "alice";
  return class {
    users = {
      getAuthenticated: async () => {
        if (opts.throws) throw opts.throws;
        return { data: { login } };
      },
    };
  };
}

/**
 * Holder that lets tests swap the Octokit constructor at runtime.
 * Use with `vi.mock("@octokit/rest", () => ({ get Octokit() { return holder.ctor; } }))`.
 */
export interface OctokitHolder {
  ctor: ReturnType<typeof octokitStub>;
}

export function createOctokitHolder(
  initial: ReturnType<typeof octokitStub> = octokitStub(),
): OctokitHolder {
  return { ctor: initial };
}
