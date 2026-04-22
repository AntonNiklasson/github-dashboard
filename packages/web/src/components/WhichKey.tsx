import { useEffect } from "react";

export interface KeyBinding {
  key: string;
  label: string;
  action: () => void;
}

export interface KeyGroup {
  prefix: string;
  label: string;
  bindings: KeyBinding[];
}

interface Props {
  group: KeyGroup;
  onClose: () => void;
}

export function WhichKey({ group, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      const binding = group.bindings.find((b) => b.key === e.key);
      if (binding) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
        binding.action();
      } else {
        // Unknown key, cancel
        onClose();
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, [group, onClose]);

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 animate-in fade-in zoom-in-95 duration-100">
      <div className="flex items-center gap-3 rounded-lg border bg-popover px-4 py-2.5 shadow-lg">
        <span className="text-xs text-muted-foreground">{group.label}</span>
        <div className="h-4 w-px bg-border" />
        {group.bindings.map((b) => (
          <div key={b.key} className="flex items-center gap-1.5">
            <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-medium">
              {b.key}
            </kbd>
            <span className="text-xs text-muted-foreground">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
