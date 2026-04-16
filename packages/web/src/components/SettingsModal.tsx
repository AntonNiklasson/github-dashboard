import { useState, useEffect } from "react";
import { useAtom } from "jotai";
import { toast } from "sonner";
import { HelpCircle, Settings, Globe, Building2 } from "lucide-react";
import { api, type ConfigData, ConfigValidationError } from "../api";
import { type Theme, applyTheme, themeAtom } from "../theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Dialog,
	DialogContent,
	DialogTitle,
} from "@/components/ui/dialog";

type Tab = "general" | "github" | "enterprise";

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
	{ id: "general", label: "General", icon: <Settings className="h-4 w-4" /> },
	{ id: "github", label: "GitHub.com", icon: <Globe className="h-4 w-4" /> },
	{ id: "enterprise", label: "Enterprise", icon: <Building2 className="h-4 w-4" /> },
];

// --- shared small components ---

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

function HelpTooltip({ text }: { text: string }) {
	return (
		<span className="group relative inline-flex">
			<HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
			<span className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-1.5 w-64 -translate-x-1/2 rounded-md bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md border group-hover:pointer-events-auto group-hover:visible whitespace-pre-line">
				{text}
			</span>
		</span>
	);
}

const slackHelpText = "Create an Incoming Webhook in Slack:\n1. Go to api.slack.com/apps\n2. Create New App → From scratch\n3. Incoming Webhooks → toggle on\n4. Add New Webhook to Workspace\n5. Pick a channel and copy the URL";

// --- tab panels ---

function GeneralTab({ port, setPort }: {
	port: string;
	setPort: (v: string) => void;
}) {
	const [theme, setTheme] = useAtom(themeAtom);
	useEffect(() => applyTheme(theme), [theme]);

	return (
		<div className="space-y-6">
			<div className="space-y-3">
				<h3 className="text-sm font-semibold text-foreground">Appearance</h3>
				<div className="flex items-center gap-3">
					<span className="text-sm text-muted-foreground">Theme</span>
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
				<h3 className="text-sm font-semibold text-foreground">Server</h3>
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

function GitHubTab({ initial, ghToken, setGhToken, ghSlackWebhook, setGhSlackWebhook, fieldErrors }: {
	initial?: ConfigData;
	ghToken: string;
	setGhToken: (v: string) => void;
	ghSlackWebhook: string;
	setGhSlackWebhook: (v: string) => void;
	fieldErrors: FieldErrors;
}) {
	return (
		<div className="space-y-4">
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
			<div className="space-y-1">
				<div className="flex items-center gap-1.5">
					<Label htmlFor="gh-slack-webhook">Slack webhook URL</Label>
					<HelpTooltip text={slackHelpText} />
				</div>
				<Input
					id="gh-slack-webhook"
					type="password"
					placeholder={initial?.github?.slackWebhookUrl ? initial.github.slackWebhookUrl : "https://hooks.slack.com/services/..."}
					value={ghSlackWebhook}
					onChange={(e) => setGhSlackWebhook(e.target.value)}
				/>
			</div>
		</div>
	);
}

function EnterpriseTab({ initial, gheEnabled, setGheEnabled, gheLabel, setGheLabel, gheBaseUrl, setGheBaseUrl, gheToken, setGheToken, gheSlackWebhook, setGheSlackWebhook, fieldErrors }: {
	initial?: ConfigData;
	gheEnabled: boolean;
	setGheEnabled: (v: boolean) => void;
	gheLabel: string;
	setGheLabel: (v: string) => void;
	gheBaseUrl: string;
	setGheBaseUrl: (v: string) => void;
	gheToken: string;
	setGheToken: (v: string) => void;
	gheSlackWebhook: string;
	setGheSlackWebhook: (v: string) => void;
	fieldErrors: FieldErrors;
}) {
	return (
		<div className="space-y-4">
			<label className="flex items-center gap-2 text-sm text-muted-foreground">
				<input
					type="checkbox"
					checked={gheEnabled}
					onChange={(e) => setGheEnabled(e.target.checked)}
					className="rounded"
				/>
				Enable GitHub Enterprise
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
							placeholder={initial?.enterprise?.token ? initial.enterprise.token : "ghp_..."}
							value={gheToken}
							onChange={(e) => setGheToken(e.target.value)}
							required={gheEnabled && !initial?.enterprise?.token}
							aria-invalid={!!fieldErrors.gheToken}
							aria-describedby={fieldErrors.gheToken ? "ghe-token-error" : undefined}
						/>
						<FieldError message={fieldErrors.gheToken} />
					</div>
					<div className="space-y-1">
						<div className="flex items-center gap-1.5">
							<Label htmlFor="ghe-slack-webhook">Slack webhook URL</Label>
							<HelpTooltip text={slackHelpText} />
						</div>
						<Input
							id="ghe-slack-webhook"
							type="password"
							placeholder={initial?.enterprise?.slackWebhookUrl ? initial.enterprise.slackWebhookUrl : "https://hooks.slack.com/services/..."}
							value={gheSlackWebhook}
							onChange={(e) => setGheSlackWebhook(e.target.value)}
						/>
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

export function SettingsModal({ open, onOpenChange, config: initial, onSaved }: SettingsModalProps) {
	const [saving, setSaving] = useState(false);
	const [activeTab, setActiveTab] = useState<Tab>("general");

	const [ghToken, setGhToken] = useState("");
	const [ghSlackWebhook, setGhSlackWebhook] = useState("");
	const [gheEnabled, setGheEnabled] = useState(!!initial?.enterprise);
	const [gheLabel, setGheLabel] = useState(initial?.enterprise?.label ?? "");
	const [gheBaseUrl, setGheBaseUrl] = useState(initial?.enterprise?.baseUrl ?? "");
	const [gheToken, setGheToken] = useState("");
	const [gheSlackWebhook, setGheSlackWebhook] = useState("");
	const [port, setPort] = useState(String(initial?.port ?? 7100));
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

	const handleSave = async (e: React.FormEvent) => {
		e.preventDefault();
		setFieldErrors({});
		setSaving(true);

		const config: ConfigData = {
			github: {
				token: ghToken,
				slackWebhookUrl: ghSlackWebhook,
			},
			port: Number(port) || 7100,
		};

		if (gheEnabled && gheBaseUrl) {
			config.enterprise = {
				label: gheLabel || "GHE",
				baseUrl: gheBaseUrl,
				token: gheToken,
				slackWebhookUrl: gheSlackWebhook,
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
								className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors ${
									activeTab === tab.id
										? "bg-accent text-accent-foreground font-medium"
										: "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
								}`}
							>
								{tab.icon}
								{tab.label}
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
									ghSlackWebhook={ghSlackWebhook}
									setGhSlackWebhook={setGhSlackWebhook}
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
									gheSlackWebhook={gheSlackWebhook}
									setGheSlackWebhook={setGheSlackWebhook}
									fieldErrors={fieldErrors}
								/>
							)}
						</div>
						<div className="border-t p-4">
							<Button type="submit" disabled={saving} className="w-full">
								{saving ? "Saving..." : "Save"}
							</Button>
						</div>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
