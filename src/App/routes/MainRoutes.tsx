import { Component, lazy, Suspense, useEffect, type ErrorInfo, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useNavigationType, useParams } from "react-router-dom";

import { PageSkeleton } from "@/components/PageSkeleton/PageSkeleton";
import { peekHomeCatalogScroll } from "@/pages/Predictions/utils/homeScrollRestore";
import { PositionsRoute } from "@/app/routes/PositionsRouteShell";
import { loadPredictionMarketPage } from "@/app/routes/predictionMarketRouteLazy";
import { loadAllOddsPage } from "@/app/routes/allOddsRouteLazy";

// Eager: homepage and listing pages (most common entry points)
import HomeRoute from "@/pages/Home/HomeRoute";
import FilteredPredictions from "@/pages/Predictions/components/FilteredPredictions";
// import Predictions from "pages/Predictions/Predictions";
import PageNotFound from "pages/PageNotFound/PageNotFound.jsx";

// Lazy: everything else is code-split into separate chunks
const PredictionMarket = lazy(loadPredictionMarketPage);
const Profile = lazy(() => import("pages/Profile/Profile"));
const Admin = lazy(() => import("pages/Admin/Admin"));
const Transfers = lazy(() => import("pages/Transfers/Transfers"));
const TradeBoxTest = lazy(() => import("pages/TradeBoxTest/TradeBoxTest"));
const About = lazy(() => import("pages/About/About"));
const AllOdds = lazy(loadAllOddsPage);
const BlogIndex = lazy(() => import("pages/Blog/BlogIndex"));
const BlogArticle = lazy(() => import("pages/Blog/BlogArticle"));
const LearnIndex = lazy(() => import("pages/Learn/LearnPage").then((m) => ({ default: m.LearnIndex })));
const LearnPage = lazy(() => import("pages/Learn/LearnPage"));
const TestPage = lazy(() => import("pages/Test/TestPage"));

const LEGACY_VENUE_COMPARE_REDIRECTS: Record<string, string> = {
	"clutchcomet-vs-polymarket": "polymarket-explained",
	"clutchcomet-vs-kalshi": "kalshi-explained",
	"clutchcomet-vs-limitless": "limitless-explained",
	"clutchcomet-vs-predict": "predict-explained",
	"clutchcomet-vs-myriad": "myriad-explained",
	"clutchcomet-vs-betdex": "betdex-explained",
	"clutchcomet-vs-forkast": "forkast-explained",
	"clutchcomet-vs-sxbet": "sx-bet-explained",
	"clutchcomet-vs-hyperliquid": "hyperliquid-explained",
};

function CompareToBlogRedirect() {
	const { slug } = useParams<{ slug?: string }>();
	if (slug && LEGACY_VENUE_COMPARE_REDIRECTS[slug]) {
		return <Navigate to={`/blog/${LEGACY_VENUE_COMPARE_REDIRECTS[slug]}`} replace />;
	}
	return <Navigate to={slug ? `/blog/${slug}` : "/blog"} replace />;
}

function LegacyVenueCompareRedirect() {
	const { slug } = useParams<{ slug: string }>();
	const legacySlug = slug ? `clutchcomet-vs-${slug}` : undefined;
	const target = legacySlug ? LEGACY_VENUE_COMPARE_REDIRECTS[legacySlug] : undefined;
	return <Navigate to={target ? `/blog/${target}` : "/blog"} replace />;
}

/** Prevents infinite full-page reload when chunk/HMR keeps failing (see ChunkErrorBoundary). */
const SESSION_CHUNK_RELOAD_KEY = "levelup_chunk_auto_reload_consumed";

function isChunkOrDynamicImportError(error: Error): boolean {
	return (
		error.name === "ChunkLoadError" ||
		error.message?.includes("Failed to fetch dynamically imported module") ||
		error.message?.includes("Importing a module script failed") ||
		error.message?.includes("error loading dynamically imported module")
	);
}

type ChunkBoundaryState = {
	hasError: boolean;
	loadErrorMessage: string | null;
};

// Error boundary for lazy chunk load failures (network errors, deploy cache busts)
class ChunkErrorBoundary extends Component<{ children: ReactNode }, ChunkBoundaryState> {
	override state: ChunkBoundaryState = { hasError: false, loadErrorMessage: null };

	static getDerivedStateFromError(error: Error): Partial<ChunkBoundaryState> {
		return {
			hasError: true,
			loadErrorMessage: error?.message ?? String(error),
		};
	}

	override componentDidCatch(error: Error, info: ErrorInfo) {
		// Never loop: unconditionally reloading lets a persistent chunk/HMR failure
		// hammer the tab forever. At most one automatic retry per tab session.
		if (isChunkOrDynamicImportError(error)) {
			let alreadyRetried = false;
			try {
				alreadyRetried = sessionStorage.getItem(SESSION_CHUNK_RELOAD_KEY) === "1";
			} catch {
				alreadyRetried = true;
			}
			if (alreadyRetried) {
				console.error("LazyPage chunk error (not auto-reloading to avoid a loop):", error, info);
				return;
			}
			try {
				sessionStorage.setItem(SESSION_CHUNK_RELOAD_KEY, "1");
			} catch {
				return;
			}
			window.location.reload();
			return;
		}
		console.error("LazyPage error:", error, info);
	}

	override render() {
		if (this.state.hasError) {
			const msg = this.state.loadErrorMessage ?? "";
			const looksLikeViteStaleDeps =
				msg.includes("Failed to fetch dynamically imported module") ||
				msg.includes("Outdated Optimize Dep") ||
				msg.includes("504");
			return (
				<div style={{ padding: 32, textAlign: "center", maxWidth: 520, margin: "0 auto" }}>
					<p>Something went wrong loading this page.</p>
					{looksLikeViteStaleDeps && (
						<p
							style={{
								marginTop: 16,
								color: "rgba(255,255,255,0.75)",
								fontSize: 14,
								lineHeight: 1.5,
								textAlign: "left",
							}}
						>
							This often happens in <strong>Vite dev</strong> when the browser still has old{" "}
							<code style={{ color: "#93c5fd" }}>node_modules/.vite/deps/*</code> URLs after a
							server restart or dependency change (
							<code style={{ color: "#93c5fd" }}>504 Outdated Optimize Dep</code>
							). Fix: hard refresh (Cmd+Shift+R), or stop the dev server, run{" "}
							<code style={{ color: "#93c5fd" }}>yarn dev:clean</code> (or{" "}
							<code style={{ color: "#93c5fd" }}>rm -rf node_modules/.vite</code> then{" "}
							<code style={{ color: "#93c5fd" }}>yarn dev</code>
							).
						</p>
					)}
					<button
						onClick={() => {
							try {
								sessionStorage.removeItem(SESSION_CHUNK_RELOAD_KEY);
							} catch {
								/* ignore */
							}
							window.location.reload();
						}}
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
	const navigationType = useNavigationType();

	useEffect(() => {
		// Browser back to home: FilteredPredictions restores scrollY in useLayoutEffect.
		if (pathname === "/" && navigationType === "POP") {
			return;
		}
		if (pathname === "/" && peekHomeCatalogScroll() !== null) {
			return;
		}
		window.scrollTo(0, 0);
	}, [pathname, navigationType]);

	return (
		<div className="main-routes-shell">
			<Routes>
				{/* Home: all markets (esports + non-esports) */}
				<Route path="/" element={<HomeRoute />} />
				<Route
					path="/prediction-market-aggregator"
					element={<Navigate to="/blog/what-is-a-prediction-market-aggregator" replace />}
				/>
				<Route
					path="/learn/prediction-market-aggregator"
					element={<Navigate to="/blog/what-is-a-prediction-market-aggregator" replace />}
				/>
				<Route
					path="/prediction-market-aggregators"
					element={<Navigate to="/blog/best-prediction-market-aggregators-2026" replace />}
				/>
				<Route
					path="/esports-prediction-market-aggregator"
					element={<Navigate to="/blog/esports-prediction-market-aggregator" replace />}
				/>
				<Route
					path="/learn/esports-prediction-market-aggregator"
					element={<Navigate to="/blog/esports-prediction-market-aggregator" replace />}
				/>

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
					element={
						<LazyPage>
							<PredictionMarket />
						</LazyPage>
					}
				/>

				<Route
					path="/profile"
					element={
						<LazyPage>
							<Profile />
						</LazyPage>
					}
				/>
				<Route
					path="/admin"
					element={
						<LazyPage>
							<Admin />
						</LazyPage>
					}
				/>
				<Route path="/positions" element={<PositionsRoute />} />
				<Route
					path="/transfers"
					element={
						<LazyPage>
							<Transfers />
						</LazyPage>
					}
				/>
				<Route
					path="/all-odds"
					element={
						<LazyPage>
							<AllOdds />
						</LazyPage>
					}
				/>
				<Route
					path="/about"
					element={
						<LazyPage>
							<About />
						</LazyPage>
					}
				/>
				<Route
					path="/blog"
					element={
						<LazyPage>
							<BlogIndex />
						</LazyPage>
					}
				/>
				<Route path="/blog/clutchcomet-vs-:slug" element={<LegacyVenueCompareRedirect />} />
				<Route
					path="/blog/prediction-market-vs-sportsbook"
					element={<Navigate to="/blog/prediction-markets-vs-sportsbooks" replace />}
				/>
				<Route
					path="/blog/:slug"
					element={
						<LazyPage>
							<BlogArticle />
						</LazyPage>
					}
				/>
				<Route
					path="/learn"
					element={
						<LazyPage>
							<LearnIndex />
						</LazyPage>
					}
				/>
				<Route
					path="/learn/:slug"
					element={
						<LazyPage>
							<LearnPage />
						</LazyPage>
					}
				/>
				<Route path="/compare" element={<CompareToBlogRedirect />} />
				<Route path="/compare/:slug" element={<CompareToBlogRedirect />} />
				{/* Admin-only test pages */}
				<Route
					path="/test/tradebox/:umbrellaId"
					element={
						<LazyPage>
							<TradeBoxTest />
						</LazyPage>
					}
				/>
				<Route
					path="/test"
					element={
						<LazyPage>
							<TestPage />
						</LazyPage>
					}
				/>

				<Route path="*" element={<PageNotFound />} />
			</Routes>
		</div>
	);
}
