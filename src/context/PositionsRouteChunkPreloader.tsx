import { useEffect, useRef } from "react";
import { useSignerContext } from "context/SignerContext";
import { useAccountReadiness } from "@/context/AccountDataContext";
import { preloadPositionsRoute } from "@/app/routes/positionsRouteLazy";

/**
 * After account funding hydration and a connected signer, prefetch the `/positions` JS chunk
 * once so the lazy route Suspense fallback is shorter on first visit.
 */
export function PositionsRouteChunkPreloader(): null {
	const { account } = useSignerContext();
	const { hydrated } = useAccountReadiness();
	const didPreloadRef = useRef(false);

	useEffect(() => {
		if (!hydrated || !account) return;
		if (didPreloadRef.current) return;
		didPreloadRef.current = true;
		preloadPositionsRoute();
	}, [hydrated, account]);

	return null;
}
