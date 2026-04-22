import { useEffect } from "react";
import { useAtom } from "jotai";
import { ThemeSelect } from "../components/ThemeSelect";
import { applyTheme, themeAtom } from "../theme";

interface Props {
  title: string;
  description?: string;
  children: React.ReactNode;
}

const tabs = [
  { path: "/components/showcase", label: "Showcase" },
  { path: "/components/pr-card", label: "PrCard" },
];

export function ComponentsLayout({ title, description, children }: Props) {
  const [theme] = useAtom(themeAtom);
  useEffect(() => applyTheme(theme), [theme]);

  const active = window.location.pathname;

  return (
    <div className="fixed inset-0 overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <nav className="mb-6 flex items-center gap-1 border-b pb-4">
          {tabs.map((t) => (
            <a
              key={t.path}
              href={t.path}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                active === t.path
                  ? "bg-muted font-semibold text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </a>
          ))}
          <div className="ml-auto">
            <ThemeSelect />
          </div>
        </nav>

        <header className="mb-10">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </header>

        {children}
      </div>
    </div>
  );
}
