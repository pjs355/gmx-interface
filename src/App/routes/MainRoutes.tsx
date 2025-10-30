import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import GetTestUsdc from "pages/GetTestUsdc/GetTestUsdc.jsx";
import PageNotFound from "pages/PageNotFound/PageNotFound.jsx";
import Predictions from "pages/Predictions/Predictions";
import EsportsPredictions from "pages/Predictions/EsportsPredictions";
import GamesPredictions from "pages/Predictions/GamesPredictions";
import UmbrellaPage from "pages/Predictions/UmbrellaPage";
import PredictionMarket from "pages/Predictions/PredictionMarket/PredictionMarket";
import Leaderboard from "@/pages/Leaderboard/Leaderboard";
// Removed Developers import - not used in routes (using Profile instead)
import Profile from "pages/Profile/Profile";
import Admin from "pages/Admin/Admin";
import Positions from "pages/Positions/Positions";
import Prizes from "pages/Prizes/Prizes";
import TradeBoxTest from "pages/TradeBoxTest/TradeBoxTest";
import About from "pages/About/About";

export function MainRoutes() {
	const { pathname } = useLocation();

	// new page should be scrolled to top
	useEffect(() => {
		window.scrollTo(0, 0);
	}, [pathname]);

	return (
		<Routes>
			<Route path="/" element={<Navigate to="/predictions" replace />} />

			<Route path="/predictions" element={<Predictions />} />
			<Route
				path="/predictions/esports"
				element={<EsportsPredictions />}
			/>
			<Route path="/predictions/games" element={<GamesPredictions />} />
			<Route
				path="/predictions/umbrella/:umbrellaId/questions"
				element={<UmbrellaPage />}
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
			<Route path="/get_test_usdc" element={<GetTestUsdc />} />
			<Route path="/positions" element={<Positions />} />
			<Route path="/prizes" element={<Prizes />} />
			<Route path="/about" element={<About />} />
			<Route
				path="/test/tradebox/:umbrellaId"
				element={<TradeBoxTest />}
			/>

			<Route path="*" element={<PageNotFound />} />
		</Routes>
	);
}
