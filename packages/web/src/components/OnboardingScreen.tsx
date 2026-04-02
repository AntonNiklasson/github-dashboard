import { useState } from "react";
import { toast } from "sonner";
import { api, type ConfigData } from "../api";
import { ConfigForm } from "./ConfigForm";

interface OnboardingScreenProps {
	onComplete: () => void;
}

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
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

	return (
		<div className="flex min-h-screen items-center justify-center bg-background">
			<div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
				<h1 className="mb-1 text-lg font-bold text-foreground">GitHub Dashboard</h1>
				<p className="mb-6 text-sm text-muted-foreground">
					Configure your GitHub tokens to get started.
				</p>
				<ConfigForm onSave={handleSave} saving={saving} />
			</div>
		</div>
	);
}
