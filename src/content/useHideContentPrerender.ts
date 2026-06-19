import { useLayoutEffect } from "react";

const PRERENDER_IDS = ["blog-prerender", "home-prerender"] as const;

/** Hide SEO prerender blocks injected at build time (production HTML only). */
export function hideContentPrerender(): void {
	for (const id of PRERENDER_IDS) {
		const el = document.getElementById(id);
		if (el) {
			el.style.display = "none";
		}
	}
}

/** Runs before paint so prerender copy never flashes on any route. */
export function useHideContentPrerender(): void {
	useLayoutEffect(() => {
		hideContentPrerender();
	}, []);
}
