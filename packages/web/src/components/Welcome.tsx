import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api, type ConfigError } from "../api";
import { Button } from "@/components/ui/button";
import { Text } from "./Text";

interface Props {
  path: string;
  example: string;
  errors: ConfigError[];
}

export function Welcome({ path, example, errors }: Props) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"create" | "reload" | null>(null);

  const fileMissing = errors.some((e) => e.kind === "not_found");

  const handleCreate = async () => {
    setBusy("create");
    try {
      const result = await api.createConfig();
      toast(
        result.created
          ? "Created — fill in your tokens, then reload."
          : "File already exists.",
      );
      queryClient.invalidateQueries({ queryKey: ["config"] });
    } catch {
      toast.error("Failed to create config file.");
    } finally {
      setBusy(null);
    }
  };

  const handleReload = async () => {
    setBusy("reload");
    try {
      const next = await api.reloadConfig();
      queryClient.setQueryData(["config"], next);
    } catch {
      toast.error("Failed to reload config.");
    } finally {
      setBusy(null);
    }
  };

  const otherErrors = errors.filter((e) => e.kind !== "not_found");

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col justify-center gap-5 p-8">
      <div>
        <Text variant="secondary">
          {fileMissing ? "Create a config file at:" : "Reading config from:"}
        </Text>
        <pre className="mt-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-sm">
          {path}
        </pre>
      </div>

      {otherErrors.length > 0 && (
        <div className="space-y-2">
          <strong>Errors:</strong>
          {otherErrors.map((err, i) => (
            <ErrorRow key={i} error={err} />
          ))}
        </div>
      )}

      <div>
        <Text variant="secondary">Example:</Text>
        <pre className="mt-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-sm leading-relaxed">
          {example}
        </pre>
      </div>

      <div className="flex gap-2">
        {fileMissing && (
          <Button type="button" onClick={handleCreate} disabled={busy !== null}>
            {busy === "create" ? "Creating…" : "Set it up for me!"}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={handleReload}
          disabled={busy !== null}
        >
          {busy === "reload" ? "Reloading…" : "Reload config"}
        </Button>
      </div>
    </div>
  );
}

function ErrorRow({ error }: { error: ConfigError }) {
  return (
    <div className="rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2.5 text-red-700 dark:text-red-300">
      <p className="mb-1">
        <Text bold>{titleFor(error)}</Text>
      </p>
      <ErrorBody error={error} />
    </div>
  );
}

function titleFor(error: ConfigError): string {
  switch (error.kind) {
    case "not_found":
      return "No config file found";
    case "parse":
      return "Couldn't parse YAML";
    case "schema":
      return `Schema violation at ${error.path}`;
    case "missing_tokens":
      return "No instances configured";
    case "duplicate_domain":
      return `${error.domain} — listed more than once`;
    case "placeholder_token":
      return `${error.domain} — placeholder token`;
    case "auth":
      return `${error.domain} — token rejected`;
  }
}

function ErrorBody({ error }: { error: ConfigError }) {
  if (error.kind === "parse") {
    return (
      <pre className="overflow-x-auto font-mono text-xs">{error.message}</pre>
    );
  }
  if (error.kind === "schema") {
    return <Text size="small">{error.message}</Text>;
  }
  if (error.kind === "missing_tokens") {
    return (
      <Text size="small">
        Add at least one instance under{" "}
        <code className="font-mono">instances</code> with a{" "}
        <code className="font-mono">domain</code> and{" "}
        <code className="font-mono">token</code>.
      </Text>
    );
  }
  if (error.kind === "duplicate_domain") {
    return (
      <Text size="small">
        Each domain can only appear once in{" "}
        <code className="font-mono">instances</code>.
      </Text>
    );
  }
  if (error.kind === "placeholder_token") {
    return (
      <Text size="small">
        Replace <code className="font-mono">ghp_...</code> with a real token.
      </Text>
    );
  }
  if (error.kind === "auth") {
    return <Text size="small">{error.message}</Text>;
  }
  return null;
}
