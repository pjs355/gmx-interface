import { Component, lazy, Suspense, useEffect, type ErrorInfo, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { PageSkeleton } from "@/components/PageSkeleton/PageSkeleton";

// Eager: homepage and listing pages (most common entry points)
import FilteredPredictions from "@/pages/Predictions/components/FilteredPredictions";
// import Predictions from "pages/Predictions/Predictions";
import PageNotFound from "pages/PageNotFound/PageNotFound.jsx";

// Lazy: everything else is code-split into separate chunks
const PredictionMarket = lazy(() => import("@/pages/PredictionMarket/PredictionMarket"));
const Profile = lazy(() => import("pages/Profile/Profile"));
const Admin = lazy(() => import("pages/Admin/Admin"));
const Positions = lazy(() => import("pages/Positions/Positions"));
const Transfers = lazy(() => import("pages/Transfers/Transfers"));
const TradeBoxTest = lazy(() => import("pages/TradeBoxTest/TradeBoxTest"));
const About = lazy(() => import("pages/About/About"));
const TestPage = lazy(() => import("pages/Test/TestPage"));


// Error boundary for lazy chunk load failures (network errors, deploy cache busts)
class ChunkErrorBoundary extends Component<
	{ children: ReactNode },
	{ hasError: boolean }
> {
	state = { hasError: false };

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		// ChunkLoadError / TypeError from dynamic import() -- reload once to pick up new assets
		if (
			error.name === "ChunkLoadError" ||
			error.message?.includes("Failed to fetch dynamically imported module")
		) {
			window.location.reload();
			return;
		}
		console.error("LazyPage error:", error, info);
	}

	render() {
		if (this.state.hasError) {
			return (
				<div style={{ padding: 32, textAlign: "center" }}>
					<p>Something went wrong loading this page.</p>
					<button
						onClick={() => window.location.reload()}
						style={{
							marginTop: 12,
							padding: "8px 20px",
							borderRadius: 8,
							border: "1px solid rgba(255,255,255,0.2)",
							background: "transparent",
							color: "white",
							cursor: "pointer",
						}}
					>
						Reload
					</button>
				</div>
			);
		}
		return this.props.children;
	}
}

function LazyPage({ children }: { children: ReactNode }) {
	return (
		<ChunkErrorBoundary>
			<Suspense fallback={<PageSkeleton />}>{children}</Suspense>
		</ChunkErrorBoundary>
	);
}

export function MainRoutes() {
	const { pathname } = useLocation();

	useEffect(() => {
		window.scrollTo(0, 0);
	}, [pathname]);

	return (
		<Routes>
			{/* Home: all markets (esports + non-esports) */}
			<Route path="/" element={<FilteredPredictions filterType="all" />} />

			{/* Standalone predictions list + split routes disabled; redirect to home */}
			{/* <Route path="/predictions" element={<Predictions />} /> */}
			<Route path="/predictions" element={<Navigate to="/" replace />} />
			{/* <Route
				path="/predictions/esports"
				element={<FilteredPredictions filterType="esports" />}
			/> */}
			<Route path="/predictions/esports" element={<Navigate to="/" replace />} />
			{/* <Route
				path="/predictions/games"
				element={<FilteredPredictions filterType="games" />}
			/> */}
			<Route path="/predictions/games" element={<Navigate to="/" replace />} />
			<Route
				path="/predictions/umbrella/:umbrellaId"
				element={<LazyPage><PredictionMarket /></LazyPage>}
			/>

			<Route path="/profile" element={<LazyPage><Profile /></LazyPage>} />
			<Route path="/admin" element={<LazyPage><Admin /></LazyPage>} />
			<Route path="/positions" element={<LazyPage><Positions /></LazyPage>} />
			<Route path="/transfers" element={<LazyPage><Transfers /></LazyPage>} />
			<Route path="/about" element={<LazyPage><About /></LazyPage>} />
			{/* Admin-only test pages */}
			<Route
				path="/test/tradebox/:umbrellaId"
				element={<LazyPage><TradeBoxTest /></LazyPage>}
			/>
			<Route path="/test" element={<LazyPage><TestPage /></LazyPage>} />

			<Route path="*" element={<PageNotFound />} />
		</Routes>
	);
}
