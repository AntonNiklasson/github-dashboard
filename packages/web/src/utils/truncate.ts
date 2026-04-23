export function truncateMiddle(value: string, max = 16): string {
  if (value.length <= max) return value;
  const sideLen = Math.floor((max - 3) / 2);
  return value.slice(0, sideLen) + "..." + value.slice(-sideLen);
}
