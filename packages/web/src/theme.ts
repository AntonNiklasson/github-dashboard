import { atomWithStorage } from "jotai/utils";

export type Theme = "system" | "light" | "dark";

export const themeAtom = atomWithStorage<Theme>("theme", "system");

export function applyTheme(theme: Theme) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = theme === "dark" || (theme === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", isDark);
}
