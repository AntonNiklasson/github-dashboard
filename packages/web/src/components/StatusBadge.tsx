import { CheckCircle, XCircle, Loader2 } from "lucide-react";

export function StatusBadge({ status }: { status: string }) {
	if (status === "success") {
		return <CheckCircle className="h-3 w-3 text-green-600" />;
	}

	if (status === "failure" || status === "error") {
		return <XCircle className="h-3 w-3 text-red-600" />;
	}

	if (status === "pending") {
		return <Loader2 className="h-3 w-3 animate-spin text-yellow-500" />;
	}

	return <span className="h-4 w-4" />;
}
