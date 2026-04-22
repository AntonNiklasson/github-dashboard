import { useAtom } from "jotai";
import { useEffect } from "react";
import { type Theme, applyTheme, themeAtom } from "../theme";

const options: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function ThemeSelect() {
  const [theme, setTheme] = useAtom(themeAtom);

  useEffect(() => {
    applyTheme(theme);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme(theme);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return (
    <select
      value={theme}
      onChange={(e) => setTheme(e.target.value as Theme)}
      className="h-8 rounded-md border bg-transparent px-2 text-xs text-muted-foreground outline-none focus:border-ring"
      aria-label="Theme"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
