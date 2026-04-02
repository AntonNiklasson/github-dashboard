import { useAtom } from "jotai";
import { useState } from "react";
import { toast } from "sonner";
import { api, type ConfigData } from "../api";
import { getDefaultColor, instanceColorsAtom } from "../instance-colors";
import type { Instance } from "../types";
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
	instances: Instance[];
	onSaved: () => void;
}

export function SettingsModal({ open, onOpenChange, config, instances, onSaved }: SettingsModalProps) {
	const [saving, setSaving] = useState(false);
	const [colors, setColors] = useAtom(instanceColorsAtom);

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
				<ConfigForm initial={config} onSave={handleSave} saving={saving} />

				{instances.length > 0 && (
					<fieldset className="space-y-3 border-t pt-4">
						<legend className="text-sm font-semibold text-foreground">Instance colors</legend>
						<div className="space-y-2">
							{instances.map((inst) => (
								<div key={inst.id} className="flex items-center gap-3">
									<input
										type="color"
										value={colors[inst.id] ?? getDefaultColor(inst.id)}
										onChange={(e) => setColors({ ...colors, [inst.id]: e.target.value })}
										className="h-8 w-8 cursor-pointer rounded border bg-transparent p-0.5"
									/>
									<span className="text-sm">{inst.label}</span>
								</div>
							))}
						</div>
					</fieldset>
				)}
			</DialogContent>
		</Dialog>
	);
}
