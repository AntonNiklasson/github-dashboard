import { Card } from "@/components/ui/card";
import { useEffect } from "react";

export type DxItem =
  | {
      kind: "action";
      id: string;
      label: string;
      onSelect: () => void;
    }
  | {
      kind: "toggle";
      id: string;
      label: string;
      value: boolean;
      onChange: (next: boolean) => void;
    };

interface DxMenuProps {
  items: DxItem[];
  onClose: () => void;
}

export function DxMenu({ items, onClose }: DxMenuProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-24"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-sm p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          DX
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            No actions registered.
          </p>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                {item.kind === "action" ? (
                  <button
                    type="button"
                    onClick={() => {
                      item.onSelect();
                      onClose();
                    }}
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent/50"
                  >
                    <span>{item.label}</span>
                  </button>
                ) : (
                  <label className="flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent/50">
                    <span>{item.label}</span>
                    <input
                      type="checkbox"
                      checked={item.value}
                      onChange={(e) => item.onChange(e.target.checked)}
                      className="rounded"
                    />
                  </label>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
