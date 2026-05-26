import { useMemo, useState } from "react";
import { usePredictionData } from "@/context/PredictionDataContext";
import SettleMarket from "./SettleMarket";
import "./Markets.scss";

type ExpiredMarket = {
	_id: string;
	questionId: string;
	displayName: string;
	umbrellaId: string;
	umbrellaDisplayName: string;
	endDate: string;
	status: string;
};

export default function ResolveMarkets() {
	const { umbrellas, allMarketsByUmbrella, loading } = usePredictionData();
	const [selectedMarket, setSelectedMarket] = useState<ExpiredMarket | null>(null);

	const expiredMarkets = useMemo(() => {
		const now = new Date();
		const expired: ExpiredMarket[] = [];

		umbrellas.forEach((umbrella) => {
			const umbrellaId = umbrella._id;
			const allMarkets = allMarketsByUmbrella[umbrellaId] || [];

			allMarkets.forEach((market: any) => {
				// Check if market is active and has an endDate that's in the past
				const isActive = market.status?.toLowerCase() !== "resolved";
				const endDate = (umbrella as any).endDate;

				if (isActive && endDate) {
					const endDateTime = new Date(endDate);
					if (endDateTime < now) {
						expired.push({
							_id: market._id || market.questionId,
							questionId: market.questionId || market._id,
							displayName: market.displayName || market.question || "Unnamed",
							umbrellaId: umbrella._id,
							umbrellaDisplayName: umbrella.displayName || "Unnamed Umbrella",
							endDate: endDate,
							status: market.status || "active",
						});
					}
				}
			});
		});

		return expired;
	}, [umbrellas, allMarketsByUmbrella]);

	const formatDate = (dateString: string) => {
		try {
			return new Date(dateString).toLocaleString();
		} catch {
			return dateString;
		}
	};

	const getTimeExpired = (endDate: string) => {
		try {
			const now = new Date();
			const end = new Date(endDate);
			const diffMs = now.getTime() - end.getTime();
			const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
			const diffDays = Math.floor(diffHours / 24);

			if (diffDays > 0) {
				return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
			}
			return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
		} catch {
			return "Unknown";
		}
	};

	if (loading) {
		return (
			<div className="admin-market-container">
				<h2 className="admin-market-title">Resolve Expired Markets</h2>
				<div className="admin-loading-text">Loading expired markets...</div>
			</div>
		);
	}

	return (
		<div className="admin-market-container">
			<h2 className="admin-market-title">Resolve Expired Markets</h2>
			<p className="admin-hint-text" style={{ marginBottom: 16 }}>
				Markets that are still active but have passed their end date and need to be resolved.
			</p>

			{expiredMarkets.length === 0 ? (
				<div className="edit-no-questions">
					No expired markets found. All markets are either resolved or still active within their
					time window.
				</div>
			) : (
				<div className="edit-questions-grid">
					{expiredMarkets.map((market) => (
						<div key={market._id} className="edit-question-item">
							<div>
								<div className="edit-question-info-name">{market.displayName}</div>
								<div className="edit-question-info-id">Umbrella: {market.umbrellaDisplayName}</div>
								<div className="edit-question-info-id">
									Ended: {formatDate(market.endDate)} ({getTimeExpired(market.endDate)})
								</div>
								<div className="edit-question-info-id">Question ID: {market.questionId}</div>
							</div>
							<button
								type="button"
								onClick={() => {
									setSelectedMarket(market);
								}}
								className="edit-load-button"
							>
								Resolve
							</button>
						</div>
					))}
				</div>
			)}

			{selectedMarket && (
				<div
					style={{
						position: "fixed",
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						background: "rgba(0, 0, 0, 0.8)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						zIndex: 9999,
					}}
					onClick={() => setSelectedMarket(null)}
				>
					<div
						style={{
							background: "#1a1a1a",
							border: "1px solid rgba(255, 255, 255, 0.2)",
							borderRadius: 12,
							padding: 24,
							maxWidth: 600,
							width: "90%",
							maxHeight: "80vh",
							overflow: "auto",
						}}
						onClick={(e) => e.stopPropagation()}
					>
						<div className="edit-editing-title">Resolve: {selectedMarket.displayName}</div>
						<div className="edit-question-info-id" style={{ marginBottom: 16 }}>
							Umbrella: {selectedMarket.umbrellaDisplayName}
						</div>
						<button
							type="button"
							onClick={() => setSelectedMarket(null)}
							className="edit-back-button"
							style={{ marginBottom: 16 }}
						>
							Close
						</button>
						<SettleMarket questionId={selectedMarket.questionId} />
					</div>
				</div>
			)}

			<div className="admin-hint-text" style={{ marginTop: 16 }}>
				Total expired markets: {expiredMarkets.length}
			</div>
		</div>
	);
}
