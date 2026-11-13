import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { Instance } from "../types";

export function SyncHealth({ instances }: { instances: Instance[] }) {
  const { data, error, dataUpdatedAt } = useQuery({
    queryKey: ["sync-health"],
    queryFn: api.syncHealth,
    refetchInterval: 10_000,
    retry: false,
  });

  if (error)
    return (
      <p role="alert" className="px-3 pb-2 text-xs text-amber-600">
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
      dataUpdatedAt - Date.parse(entry.lastSuccessAt) > 90_000,
  );
  const label = failed
    ? "Sync failed — data may be stale"
    : paused
      ? "Sync paused — data may be stale"
      : waiting
        ? "Waiting for first sync"
        : stale
          ? "Data is stale"
          : "Up to date";
  return (
    <details
      className={`px-3 pb-2 text-xs ${failed || paused || stale ? "text-amber-600" : "text-muted-foreground"}`}
    >
      <summary className="cursor-pointer" aria-label={`Sync status: ${label}`}>
        {label}
      </summary>
      <ul className="mt-2 space-y-1">
        {visible.map((entry) => (
          <li key={`${entry.instanceId}:${entry.kind}`}>
            {
              instances.find((instance) => instance.id === entry.instanceId)
                ?.label
            }{" "}
            · {entry.kind}: {entry.status} · Last successful sync:{" "}
            {entry.lastSuccessAt
              ? new Date(entry.lastSuccessAt).toLocaleTimeString()
              : "never"}
            {entry.reason && <> · {entry.reason}</>}
            {entry.retryAt && (
              <> · Retry after {new Date(entry.retryAt).toLocaleTimeString()}</>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
