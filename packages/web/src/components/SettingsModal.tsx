import { useState, useEffect } from "react";
import { useAtom } from "jotai";
import { toast } from "sonner";
import { Settings, Globe, Building2 } from "lucide-react";
import { api, type ConfigData, ConfigValidationError } from "../api";
import { type Theme, applyTheme, themeAtom } from "../theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Text } from "./Text";

type Tab = "general" | "github" | "enterprise";

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "General", icon: <Settings className="h-4 w-4" /> },
  { id: "github", label: "GitHub.com", icon: <Globe className="h-4 w-4" /> },
  {
    id: "enterprise",
    label: "Enterprise",
    icon: <Building2 className="h-4 w-4" />,
  },
];

// --- shared small components ---

function Label({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-muted-foreground">
      <Text bold>{children}</Text>
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p>
      <Text className="text-red-600">{message}</Text>
    </p>
  );
}

// --- tab panels ---

function GeneralTab({
  port,
  setPort,
}: {
  port: string;
  setPort: (v: string) => void;
}) {
  const [theme, setTheme] = useAtom(themeAtom);
  useEffect(() => applyTheme(theme), [theme]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3>
          <Text bold>Appearance</Text>
        </h3>
        <div className="flex items-center gap-3">
          <Text variant="secondary">Theme</Text>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
            className="h-9 rounded-md border bg-transparent px-3 text-sm text-muted-foreground outline-none focus:border-ring"
            aria-label="Theme"
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </div>
      <div className="space-y-3">
        <h3>
          <Text bold>Server</Text>
        </h3>
        <div className="max-w-xs space-y-1">
          <Label htmlFor="port">Port</Label>
          <Input
            id="port"
            type="number"
            placeholder="7100"
            value={port}
            onChange={(e) => setPort(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

function GitHubTab({
  initial,
  ghToken,
  setGhToken,
  fieldErrors,
}: {
  initial?: ConfigData;
  ghToken: string;
  setGhToken: (v: string) => void;
  fieldErrors: FieldErrors;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="gh-token">Personal access token</Label>
        <Input
          id="gh-token"
          type="password"
          placeholder={
            initial?.github?.token ? initial.github.token : "ghp_..."
          }
          value={ghToken}
          onChange={(e) => setGhToken(e.target.value)}
          required={!initial?.github?.token}
          aria-invalid={!!fieldErrors.ghToken}
          aria-describedby={fieldErrors.ghToken ? "gh-token-error" : undefined}
        />
        <FieldError message={fieldErrors.ghToken} />
      </div>
    </div>
  );
}

function EnterpriseTab({
  initial,
  gheEnabled,
  setGheEnabled,
  gheLabel,
  setGheLabel,
  gheBaseUrl,
  setGheBaseUrl,
  gheToken,
  setGheToken,
  fieldErrors,
}: {
  initial?: ConfigData;
  gheEnabled: boolean;
  setGheEnabled: (v: boolean) => void;
  gheLabel: string;
  setGheLabel: (v: string) => void;
  gheBaseUrl: string;
  setGheBaseUrl: (v: string) => void;
  gheToken: string;
  setGheToken: (v: string) => void;
  fieldErrors: FieldErrors;
}) {
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-muted-foreground">
        <input
          type="checkbox"
          checked={gheEnabled}
          onChange={(e) => setGheEnabled(e.target.checked)}
          className="rounded"
        />
        <Text>Enable GitHub Enterprise</Text>
      </label>

      {gheEnabled && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ghe-label">Label</Label>
              <Input
                id="ghe-label"
                type="text"
                placeholder="GHE"
                value={gheLabel}
                onChange={(e) => setGheLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ghe-base-url">Base URL</Label>
              <Input
                id="ghe-base-url"
                type="text"
                placeholder="https://ghe.example.com/api/v3"
                value={gheBaseUrl}
                onChange={(e) => setGheBaseUrl(e.target.value)}
                required={gheEnabled}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ghe-token">Personal access token</Label>
            <Input
              id="ghe-token"
              type="password"
              placeholder={
                initial?.enterprise?.token
                  ? initial.enterprise.token
                  : "ghp_..."
              }
              value={gheToken}
              onChange={(e) => setGheToken(e.target.value)}
              required={gheEnabled && !initial?.enterprise?.token}
              aria-invalid={!!fieldErrors.gheToken}
              aria-describedby={
                fieldErrors.gheToken ? "ghe-token-error" : undefined
              }
            />
            <FieldError message={fieldErrors.gheToken} />
          </div>
        </div>
      )}
    </div>
  );
}

// --- field errors ---

interface FieldErrors {
  ghToken?: string;
  gheToken?: string;
}

function parseFieldErrors(errors: string[]): FieldErrors {
  const field: FieldErrors = {};
  for (const err of errors) {
    if (err.toLowerCase().includes("github.com")) field.ghToken = err;
    else if (err.toLowerCase().includes("enterprise")) field.gheToken = err;
  }
  return field;
}

// --- main modal ---

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config?: ConfigData;
  onSaved: () => void;
}

export function SettingsModal({
  open,
  onOpenChange,
  config: initial,
  onSaved,
}: SettingsModalProps) {
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("general");

  const [ghToken, setGhToken] = useState("");
  const [gheEnabled, setGheEnabled] = useState(!!initial?.enterprise);
  const [gheLabel, setGheLabel] = useState(initial?.enterprise?.label ?? "");
  const [gheBaseUrl, setGheBaseUrl] = useState(
    initial?.enterprise?.baseUrl ?? "",
  );
  const [gheToken, setGheToken] = useState("");
  const [port, setPort] = useState(String(initial?.port ?? 7100));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setSaving(true);

    const config: ConfigData = {
      github: {
        token: ghToken,
      },
      port: Number(port) || 7100,
    };

    if (gheEnabled && gheBaseUrl) {
      config.enterprise = {
        label: gheLabel || "GHE",
        baseUrl: gheBaseUrl,
        token: gheToken,
      };
    }

    try {
      await api.saveConfig(config);
      toast("Settings saved");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      if (err instanceof ConfigValidationError) {
        setFieldErrors(parseFieldErrors(err.errors));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <form onSubmit={handleSave} className="flex min-h-[400px]">
          {/* sidebar */}
          <nav className="flex w-48 shrink-0 flex-col gap-1 border-r p-3">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
                  activeTab === tab.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                }`}
              >
                {tab.icon}
                <Text bold={activeTab === tab.id}>{tab.label}</Text>
              </button>
            ))}
          </nav>

          {/* content */}
          <div className="flex flex-1 flex-col">
            <div className="flex-1 p-6">
              {activeTab === "general" && (
                <GeneralTab port={port} setPort={setPort} />
              )}
              {activeTab === "github" && (
                <GitHubTab
                  initial={initial}
                  ghToken={ghToken}
                  setGhToken={setGhToken}
                  fieldErrors={fieldErrors}
                />
              )}
              {activeTab === "enterprise" && (
                <EnterpriseTab
                  initial={initial}
                  gheEnabled={gheEnabled}
                  setGheEnabled={setGheEnabled}
                  gheLabel={gheLabel}
                  setGheLabel={setGheLabel}
                  gheBaseUrl={gheBaseUrl}
                  setGheBaseUrl={setGheBaseUrl}
                  gheToken={gheToken}
                  setGheToken={setGheToken}
                  fieldErrors={fieldErrors}
                />
              )}
            </div>
            <div className="border-t p-4">
              <Button type="submit" disabled={saving} className="w-full">
                <Text bold>{saving ? "Saving..." : "Save"}</Text>
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
