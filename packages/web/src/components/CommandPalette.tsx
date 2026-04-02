import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useColleaguePrs, useSearchPrs } from "../hooks";
import type { Instance, Notification, PR, ReviewRequest, SearchPR } from "../types";

interface Props {
	instances: Instance[];
	activeInstanceId: string;
}

export function CommandPalette({ instances, activeInstanceId }: Props) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const queryClient = useQueryClient();

	const [debouncedSearch, setDebouncedSearch] = useState("");
	useEffect(() => {
		const t = setTimeout(() => setDebouncedSearch(search), 300);
		return () => clearTimeout(t);
	}, [search]);

	const isColleagueSearch = search.startsWith("@");
	const colleagueUsername = isColleagueSearch ? search.slice(1) : "";
	const prSearchQuery = !isColleagueSearch ? debouncedSearch : "";

	const { data: searchResults } = useSearchPrs(activeInstanceId, prSearchQuery);
	const { data: colleagueResults } = useColleaguePrs(activeInstanceId, colleagueUsername);

	const cachedPrs = queryClient.getQueryData<PR[]>(["prs", activeInstanceId]) ?? [];
	const cachedReviews = queryClient.getQueryData<ReviewRequest[]>(["reviews", activeInstanceId]) ?? [];
	const cachedNotifications = queryClient.getQueryData<Notification[]>(["notifications", activeInstanceId]) ?? [];

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen((v) => !v);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, []);

	const openUrl = (url: string) => {
		window.open(url, "_blank");
		setOpen(false);
	};

	if (!open) return null;

	const instanceLabel = instances.find((i) => i.id === activeInstanceId)?.label ?? "";

	return (
		<div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[20vh]">
			<Command className="w-full max-w-lg rounded-xl border bg-popover shadow-2xl" shouldFilter={true}>
				<CommandInput
					value={search}
					onValueChange={setSearch}
					placeholder={`Search ${instanceLabel}... (prefix @ for colleague)`}
					onKeyDown={(e) => {
						if (e.key === "Escape") setOpen(false);
					}}
				/>
				<CommandList>
					<CommandEmpty>No results</CommandEmpty>

					{cachedPrs.length > 0 && (
						<CommandGroup heading="My PRs">
							{cachedPrs.map((pr) => (
								<CommandItem key={`pr-${pr.id}`} value={`${pr.title} ${pr.repo}`} onSelect={() => openUrl(pr.url)}>
									<span className="truncate">{pr.title}</span>
									<span className="ml-auto shrink-0 text-xs text-muted-foreground">{pr.repo}</span>
								</CommandItem>
							))}
						</CommandGroup>
					)}

					{cachedReviews.length > 0 && (
						<CommandGroup heading="Review Requests">
							{cachedReviews.map((pr) => (
								<CommandItem key={`rev-${pr.id}`} value={`${pr.title} ${pr.repo} ${pr.author}`} onSelect={() => openUrl(pr.url)}>
									<span className="truncate">{pr.title}</span>
									<span className="ml-auto shrink-0 text-xs text-muted-foreground">{pr.author}</span>
								</CommandItem>
							))}
						</CommandGroup>
					)}

					{cachedNotifications.length > 0 && (
						<CommandGroup heading="Notifications">
							{cachedNotifications.map((n) => (
								<CommandItem key={`notif-${n.id}`} value={`${n.title} ${n.repo}`} onSelect={() => n.url ? openUrl(n.url) : undefined}>
									<span className="truncate">{n.title}</span>
									<span className="ml-auto shrink-0 text-xs text-muted-foreground">{n.repo}</span>
								</CommandItem>
							))}
						</CommandGroup>
					)}

					{searchResults && searchResults.length > 0 && (
						<CommandGroup heading="Search PRs (closed)">
							{searchResults.map((pr: SearchPR) => (
								<CommandItem key={`search-${pr.id}`} value={`${pr.title} ${pr.repo}`} onSelect={() => openUrl(pr.url)}>
									<span className="truncate">{pr.title}</span>
									<span className="ml-auto shrink-0 text-xs text-muted-foreground">{pr.repo}</span>
								</CommandItem>
							))}
						</CommandGroup>
					)}

					{colleagueResults && colleagueResults.length > 0 && (
						<CommandGroup heading={`@${colleagueUsername}'s PRs`}>
							{colleagueResults.map((pr: SearchPR) => (
								<CommandItem key={`colleague-${pr.id}`} value={`${pr.title} ${pr.repo}`} onSelect={() => openUrl(pr.url)}>
									<span className="truncate">{pr.title}</span>
									<span className="ml-auto shrink-0 text-xs text-muted-foreground">{pr.repo}</span>
								</CommandItem>
							))}
						</CommandGroup>
					)}
				</CommandList>
			</Command>
		</div>
	);
}
