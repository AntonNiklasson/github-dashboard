import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gauge } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type SyncBudget } from "../api";
import type { Instance } from "../types";

export function SyncHealth({ instances }: { instances: Instance[] }) {
  const { data, error, dataUpdatedAt } = useQuery({
    queryKey: ["sync-health"],
    queryFn: api.syncHealth,
    refetchInterval: 10_000,
    retry: false,
  });

  const { data: settings } = useQuery({
    queryKey: ["sync-settings"],
    queryFn: api.syncSettings,
    retry: false,
  });

  const now = useNow(5_000);

  if (error)
    return (
      <p role="alert" className="flex items-center gap-2 text-xs text-red-600">
        <span className="size-2 rounded-full bg-red-500" aria-hidden />
        Cannot reach sync status — data may be stale
      </p>
    );
  if (!data?.length) return null;
  const visible = data.filter((entry) =>
    instances.some((instance) => instance.id === entry.instanceId),
  );
  if (!visible.length) return null;
  const failed = visible.some((entry) => entry.status === "failed");
  const paused = visible.some((entry) => entry.status === "skipped");
  const waiting = visible.some((entry) => !entry.lastSuccessAt);
  const stale = visible.some(
    (entry) =>
      entry.lastSuccessAt &&
      dataUpdatedAt - Date.parse(entry.lastSuccessAt) >
        staleAfter(settings?.intervalMs),
  );
  const tone = failed
    ? "bg-red-500"
    : paused || stale || waiting
      ? "bg-amber-500"
      : "bg-emerald-500";
  const label = failed
    ? "Sync failed — data may be stale"
    : paused
      ? "Sync paused — data may be stale"
      : waiting
        ? "Waiting for first sync"
        : stale
          ? "Data is stale"
          : `Synced ${relativeTime(oldestSuccess(visible), now)}`;
  return (
    <div
      tabIndex={0}
      aria-label={`Sync status: ${label}`}
      className="group relative flex size-6 items-center justify-center rounded-sm text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [-webkit-app-region:no-drag]"
    >
      <span className="relative flex size-2" aria-hidden>
        <span
          className={`absolute inline-flex size-full animate-ping rounded-full opacity-60 [animation-duration:2.5s] ${tone}`}
        />
        <span className={`relative inline-flex size-2 rounded-full ${tone}`} />
      </span>
      <div className={POPOVER}>
        <div className="space-y-3 rounded-md border bg-popover p-3 text-popover-foreground shadow-md">
          {settings && <IntervalSwitch settings={settings} />}
          <p className="flex items-center gap-1.5 font-medium">
            <span className={`size-2 rounded-full ${tone}`} aria-hidden />
            {label}
          </p>
          {instances
            .map((instance) => ({
              instance,
              entries: visible.filter(
                (entry) => entry.instanceId === instance.id,
              ),
            }))
            .filter((group) => group.entries.length > 0)
            .map(({ instance, entries }) => (
              <section key={instance.id}>
                <p className="mb-1.5 font-semibold">{instance.label}</p>
                <ul className="space-y-1.5">
                  {entries.map((entry) => (
                    <li key={entry.kind}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`size-1.5 rounded-full ${STATUS_DOT[entry.status]}`}
                            aria-hidden
                          />
                          {KIND_LABEL[entry.kind]}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {entry.lastSuccessAt
                            ? relativeTime(Date.parse(entry.lastSuccessAt), now)
                            : "never synced"}
                        </span>
                      </div>
                      {(entry.status === "failed" ||
                        entry.status === "skipped" ||
                        entry.status === "syncing") && (
                        <p className="mt-0.5 pl-3 text-muted-foreground">
                          {STATUS_LABEL[entry.status]}
                          {entry.reason && <> · {entry.reason}</>}
                          {entry.retryAt && Date.parse(entry.retryAt) > now && (
                            <>
                              {" "}
                              · retry{" "}
                              {relativeTime(Date.parse(entry.retryAt), now)}
                            </>
                          )}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      </div>
    </div>
  );
}

export function RateLimits({ instances }: { instances: Instance[] }) {
  const { data } = useQuery({
    queryKey: ["sync-budgets"],
    queryFn: api.syncBudgets,
    refetchInterval: 10_000,
    retry: false,
  });

  const visible = (data ?? []).filter((budget) => budget.limit);
  const groups = instances
    .map((instance) => ({
      instance,
      budgets: visible.filter((budget) => budget.instanceId === instance.id),
    }))
    .filter((group) => group.budgets.length > 0);
  if (!groups.length) return null;
  // The header shows the most constrained budget: that one throttles first.
  const peak = Math.max(
    ...groups.flatMap((group) => group.budgets.map(usedShare)),
  );
  return (
    <div
      tabIndex={0}
      className="group relative flex items-center gap-2 rounded-sm px-1 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [-webkit-app-region:no-drag]"
      aria-label={`Rate limit: ${percent(peak)} used`}
    >
      <Gauge className="size-3.5 shrink-0" aria-hidden />
      <UsageBar used={peak} className="w-8" />
      <div className={POPOVER}>
        <div className="space-y-3 rounded-md border bg-popover p-3 text-popover-foreground shadow-md">
          {groups.map(({ instance, budgets }) => (
            <section key={instance.id}>
              <p className="mb-1.5 font-semibold">{instance.label}</p>
              <ul className="space-y-2">
                {budgets.map((budget) => (
                  <li key={budget.resource}>
                    <div className="mb-1 flex justify-between gap-3">
                      <span>{resourceLabel(budget.resource)}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {percent(usedShare(budget))} used ·{" "}
                        {budget.remaining.toLocaleString()}/
                        {budget.limit?.toLocaleString()} left
                      </span>
                    </div>
                    <UsageBar used={usedShare(budget)} className="w-full" />
                    {budget.resetAt &&
                      Date.parse(budget.resetAt) > Date.now() && (
                        <p className="mt-0.5 text-muted-foreground">
                          Resets {new Date(budget.resetAt).toLocaleTimeString()}
                        </p>
                      )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function resourceLabel(resource: string) {
  if (resource === "graphql") return "GraphQL API";
  if (resource === "rest") return "REST API";
  return resource;
}

function percent(share: number) {
  return `${Math.round(share * 100)}%`;
}

// Hover/focus popover. Electron drag regions swallow pointer events, so the
// panel opts out, and a short close delay bridges the gap from the trigger.
const POPOVER =
  "invisible absolute right-0 top-full z-50 w-72 pt-2 opacity-0 transition-[opacity,visibility] delay-150 group-hover:visible group-hover:opacity-100 group-hover:delay-0 group-focus-within:visible group-focus-within:opacity-100 [-webkit-app-region:no-drag]";

const KIND_LABEL = {
  prs: "My work",
  reviews: "Reviews",
  notifications: "Notifications",
} as const;

const STATUS_LABEL = {
  never: "Never synced",
  syncing: "Syncing",
  updated: "Updated",
  unchanged: "Unchanged",
  skipped: "Paused",
  failed: "Failed",
} as const;

const STATUS_DOT = {
  never: "bg-muted-foreground",
  syncing: "bg-sky-500",
  updated: "bg-emerald-500",
  unchanged: "bg-emerald-500",
  skipped: "bg-amber-500",
  failed: "bg-red-500",
} as const;

// Two missed cycles before warning: one slow cycle is normal.
function staleAfter(intervalMs = 60_000) {
  return Math.max(intervalMs * 2.5, 90_000);
}

function IntervalSwitch({
  settings,
}: {
  settings: { intervalMs: number; presets: number[] };
}) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: api.setSyncInterval,
    onSuccess: (next) => queryClient.setQueryData(["sync-settings"], next),
  });

  const current = mutation.isPending ? mutation.variables : settings.intervalMs;
  return (
    <div>
      <p className="mb-1.5 text-muted-foreground">Sync every</p>
      <div
        role="radiogroup"
        aria-label="Sync interval"
        className="grid grid-cols-4 gap-0.5 rounded-md bg-[oklch(0.94_0_0)] p-0.5 dark:bg-[oklch(0.22_0_0)]"
      >
        {settings.presets.map((ms) => (
          <button
            key={ms}
            type="button"
            role="radio"
            aria-checked={current === ms}
            onClick={() => mutation.mutate(ms)}
            className={`h-6 rounded-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
              current === ms
                ? "bg-background text-foreground shadow-sm dark:bg-[oklch(0.32_0_0)] dark:shadow-none"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {intervalLabel(ms)}
          </button>
        ))}
      </div>
      {mutation.isError && (
        <p className="mt-1 text-red-600">Could not save sync interval</p>
      )}
    </div>
  );
}

function intervalLabel(ms: number) {
  return ms < 60_000 ? `${ms / 1000}s` : `${ms / 60_000}m`;
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

// The oldest success is the honest bound: every visible list is at least
// this fresh.
function oldestSuccess(entries: Array<{ lastSuccessAt: string | null }>) {
  return Math.min(
    ...entries.map((entry) =>
      entry.lastSuccessAt ? Date.parse(entry.lastSuccessAt) : Date.now(),
    ),
  );
}

function relativeTime(at: number, now: number) {
  const future = at > now;
  const span = duration(Math.abs(now - at) / 1000);
  if (!span) return future ? "soon" : "just now";
  return future ? `in ${span}` : `${span} ago`;
}

function duration(totalSeconds: number) {
  const seconds = Math.round(totalSeconds);
  if (seconds < 10) return null;
  if (seconds < 60) return `${Math.floor(seconds / 10) * 10} seconds`;
  const minutes = Math.round(seconds / 60);
  if (minutes === 1) return "a minute";
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "an hour" : `${hours} hours`;
}

function usedShare(budget: SyncBudget) {
  if (!budget.limit) return 0;
  return Math.min(1, Math.max(0, 1 - budget.remaining / budget.limit));
}

function UsageBar({ used, className }: { used: number; className: string }) {
  return (
    <span
      className={`inline-block h-1.5 overflow-hidden rounded-full bg-muted ${className}`}
    >
      <span
        className={`block h-full ${used > 0.8 ? "bg-amber-500" : "bg-emerald-500"}`}
        style={{ width: `${Math.max(used * 100, used > 0 ? 2 : 0)}%` }}
      />
    </span>
  );
}
