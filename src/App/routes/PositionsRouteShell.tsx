import { PositionsDataProvider } from "@/context/PositionsDataContext";
import { PositionsRouteChunkPreloader } from "@/context/PositionsRouteChunkPreloader";
import { PositionsPageMetricsGateProvider } from "context/PositionsPageMetricsGateContext";
import { loadPositionsPage } from "@/app/routes/positionsRouteLazy";
import { lazy, Suspense, type ReactNode } from "react";
import { PageSkeleton } from "@/components/PageSkeleton/PageSkeleton";

const Positions = lazy(loadPositionsPage);

function PositionsLayout({ children }: { children: ReactNode }) {
	return (
		<PositionsDataProvider>
			<PositionsRouteChunkPreloader />
			<PositionsPageMetricsGateProvider>{children}</PositionsPageMetricsGateProvider>
		</PositionsDataProvider>
	);
}

/** Positions route shell — heavy positions assembly only while on /positions. */
export function PositionsRoute() {
	return (
		<PositionsLayout>
			<Suspense fallback={<PageSkeleton />}>
				<Positions />
			</Suspense>
		</PositionsLayout>
	);
}
