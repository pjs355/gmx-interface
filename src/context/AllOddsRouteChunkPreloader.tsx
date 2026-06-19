import { useEffect, useRef } from "react";
import { preloadAllOddsRoute } from "@/app/routes/allOddsRouteLazy";

/** Prefetch the `/all-odds` JS chunk once after app boot. */
export function AllOddsRouteChunkPreloader(): null {
	const didPreloadRef = useRef(false);

	useEffect(() => {
		if (didPreloadRef.current) return;
		didPreloadRef.current = true;
		preloadAllOddsRoute();
	}, []);

	return null;
}
