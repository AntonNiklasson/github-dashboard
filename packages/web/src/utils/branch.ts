export function truncateBranchName(name: string): string {
	const len = name.length;
	if (len <= 16) return name;
	const sideLen = Math.floor((len - 3) / 2);
	return name.slice(0, sideLen) + "..." + name.slice(-sideLen);
}