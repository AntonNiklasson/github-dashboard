import { useState } from "react";
import { toast } from "sonner";
import { api, type ConfigData } from "../api";
import { ConfigForm } from "./ConfigForm";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";

interface SettingsModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	config?: ConfigData;
	onSaved: () => void;
}

export function SettingsModal({ open, onOpenChange, config, onSaved }: SettingsModalProps) {
	const [saving, setSaving] = useState(false);

	const handleSave = async (newConfig: ConfigData) => {
		setSaving(true);
		try {
			await api.saveConfig(newConfig);
			toast("Settings saved");
			onOpenChange(false);
			onSaved();
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Settings</DialogTitle>
					<DialogDescription>
						Configure GitHub tokens and server options.
					</DialogDescription>
				</DialogHeader>
				<ConfigForm
					initial={config}
					onSave={handleSave}
					saving={saving}
				/>
			</DialogContent>
		</Dialog>
	);
}
