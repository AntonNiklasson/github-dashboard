import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type ConfigData, ConfigValidationError } from "../api";

interface ConfigFormProps {
	initial?: ConfigData;
	onSave: (config: ConfigData) => Promise<void>;
	saving?: boolean;
}

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
	return (
		<label htmlFor={htmlFor} className="block text-sm font-medium text-muted-foreground">
			{children}
		</label>
	);
}

function FieldError({ message }: { message?: string }) {
	if (!message) return null;
	return <p className="text-sm text-red-600">{message}</p>;
}

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

export function ConfigForm({ initial, onSave, saving }: ConfigFormProps) {
	const [ghToken, setGhToken] = useState("");
	const [gheEnabled, setGheEnabled] = useState(!!initial?.enterprise);
	const [gheLabel, setGheLabel] = useState(initial?.enterprise?.label ?? "");
	const [gheBaseUrl, setGheBaseUrl] = useState(initial?.enterprise?.baseUrl ?? "");
	const [gheToken, setGheToken] = useState("");
	const [port, setPort] = useState(String(initial?.port ?? 7100));
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setFieldErrors({});

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
			await onSave(config);
		} catch (err) {
			if (err instanceof ConfigValidationError) {
				setFieldErrors(parseFieldErrors(err.errors));
			}
		}
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-6">
			<fieldset className="space-y-3">
				<legend className="text-sm font-semibold text-foreground">GitHub.com</legend>
				<div className="space-y-1">
					<Label htmlFor="gh-token">Personal access token</Label>
					<Input
						id="gh-token"
						type="password"
						placeholder={initial?.github?.token ? initial.github.token : "ghp_..."}
						value={ghToken}
						onChange={(e) => setGhToken(e.target.value)}
						required={!initial?.github?.token}
						aria-invalid={!!fieldErrors.ghToken}
						aria-describedby={fieldErrors.ghToken ? "gh-token-error" : undefined}
					/>
					<FieldError message={fieldErrors.ghToken} />
				</div>
			</fieldset>

			<fieldset className="space-y-3">
				<label className="flex items-center gap-2 text-sm font-semibold text-foreground">
					<input
						type="checkbox"
						checked={gheEnabled}
						onChange={(e) => setGheEnabled(e.target.checked)}
						className="rounded"
					/>
					GitHub Enterprise
				</label>

				{gheEnabled && (
					<div className="space-y-3">
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
						<div className="space-y-1">
							<Label htmlFor="ghe-token">Personal access token</Label>
							<Input
								id="ghe-token"
								type="password"
								placeholder={initial?.enterprise?.token ? initial.enterprise.token : "ghp_..."}
								value={gheToken}
								onChange={(e) => setGheToken(e.target.value)}
								required={gheEnabled && !initial?.enterprise?.token}
								aria-invalid={!!fieldErrors.gheToken}
								aria-describedby={fieldErrors.gheToken ? "ghe-token-error" : undefined}
							/>
							<FieldError message={fieldErrors.gheToken} />
						</div>
					</div>
				)}
			</fieldset>

			<fieldset className="space-y-3">
				<legend className="text-sm font-semibold text-foreground">Server</legend>
				<div className="space-y-1">
					<Label htmlFor="port">Port</Label>
					<Input
						id="port"
						type="number"
						placeholder="7100"
						value={port}
						onChange={(e) => setPort(e.target.value)}
					/>
				</div>
			</fieldset>

			<Button type="submit" disabled={saving} className="w-full">
				{saving ? "Saving..." : "Save"}
			</Button>
		</form>
	);
}
