import { useEffect, useRef } from "react";

export function FocusLi({ focused, children }: { focused: boolean; children: React.ReactNode }) {
	const ref = useRef<HTMLLIElement>(null);
	useEffect(() => {
		if (focused && ref.current) {
			ref.current.scrollIntoView({ block: "nearest" });
		}
	}, [focused]);
	return <li ref={ref}>{children}</li>;
}
