import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { api, type ConfigData } from "../api";
import { ConfigForm } from "./ConfigForm";

interface OnboardingScreenProps {
  onComplete: () => void;
  onCancel?: () => void;
}

export function OnboardingScreen({
  onComplete,
  onCancel,
}: OnboardingScreenProps) {
  const [saving, setSaving] = useState(false);

  const handleSave = async (config: ConfigData) => {
    setSaving(true);
    try {
      await api.saveConfig(config);
      toast("Configuration saved");
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!onCancel) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="relative w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            title="Close (Esc)"
            className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <h1 className="mb-1 text-lg font-bold text-foreground">
          GitHub Dashboard
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Configure your GitHub tokens to get started.
        </p>
        <ConfigForm onSave={handleSave} saving={saving} />
      </div>
    </div>
  );
}
