import { useEffect } from "react";

/** Hide crawler prerender block once React mounts with styled content. */
export function useHideContentPrerender(): void {
	useEffect(() => {
		for (const id of ["blog-prerender", "home-prerender"]) {
			const el = document.getElementById(id);
			if (el) {
				el.style.display = "none";
			}
		}
	}, []);
}
