const DEFAULT_COLORS: Record<string, string> = {
  "github.com": "#10b981",
  ghe: "#f59e0b",
};

const defaultAssignments = new Map<string, string>();

export function getInstanceColor(instanceId: string): string {
  if (DEFAULT_COLORS[instanceId]) return DEFAULT_COLORS[instanceId];

  if (!defaultAssignments.has(instanceId)) {
    const colors = Object.values(DEFAULT_COLORS);
    defaultAssignments.set(
      instanceId,
      colors[defaultAssignments.size % colors.length],
    );
  }
  return defaultAssignments.get(instanceId)!;
}

export function getDefaultColor(instanceId: string): string {
  if (DEFAULT_COLORS[instanceId]) return DEFAULT_COLORS[instanceId];

  if (!defaultAssignments.has(instanceId)) {
    const colors = Object.values(DEFAULT_COLORS);
    defaultAssignments.set(
      instanceId,
      colors[defaultAssignments.size % colors.length],
    );
  }
  return defaultAssignments.get(instanceId)!;
}
