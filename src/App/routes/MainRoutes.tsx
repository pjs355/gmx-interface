import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import GetTestUsdc from "pages/GetTestUsdc/GetTestUsdc.jsx";
import PageNotFound from "pages/PageNotFound/PageNotFound.jsx";
import Home from "pages/Home/Home";
import Predictions from "pages/Predictions/Predictions";
import FilteredPredictions from "@/pages/Predictions/components/FilteredPredictions";
import PredictionMarket from "@/pages/PredictionMarket/PredictionMarket";
import Leaderboard from "@/pages/Leaderboard/Leaderboard";
// Removed Developers import - not used in routes (using Profile instead)
import Profile from "pages/Profile/Profile";
import Admin from "pages/Admin/Admin";
import Positions from "pages/Positions/Positions";
import Prizes from "pages/Prizes/Prizes";
import TradeBoxTest from "pages/TradeBoxTest/TradeBoxTest";
import About from "pages/About/About";
import TestPage from "pages/Test/TestPage";

export function MainRoutes() {
	const { pathname } = useLocation();

	// new page should be scrolled to top
	useEffect(() => {
		window.scrollTo(0, 0);
	}, [pathname]);

	return (
		<Routes>
			{/* Temporarily commented out - redirecting to gaming page */}
			{/* <Route path="/" element={<Home />} /> */}
			<Route path="/" element={<FilteredPredictions filterType="games" />} />

			<Route path="/predictions" element={<Predictions />} />
			{/* Temporarily commented out - esports page disabled */}
			{/* <Route
				path="/predictions/esports"
				element={<FilteredPredictions filterType="esports" />}
			/> */}
			<Route
				path="/predictions/games"
				element={<FilteredPredictions filterType="games" />}
			/>
			<Route
				path="/predictions/umbrella/:umbrellaId"
				element={<PredictionMarket />}
			/>

			<Route path="/leaderboard" element={<Leaderboard />} />
			<Route path="/developers" element={<Profile />} />
			<Route path="/profile" element={<Profile />} />
			<Route path="/profile/developers" element={<Profile />} />
			<Route path="/admin" element={<Admin />} />
			<Route path="/get-test-usdc" element={<GetTestUsdc />} />
			<Route path="/positions" element={<Positions />} />
			<Route path="/prizes" element={<Prizes />} />
			<Route path="/about" element={<About />} />
			<Route
				path="/test/tradebox/:umbrellaId"
				element={<TradeBoxTest />}
			/>
			<Route path="/test" element={<TestPage />} />

			<Route path="*" element={<PageNotFound />} />
		</Routes>
	);
}
