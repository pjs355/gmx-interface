import type { PredictionMarket } from "@/services/api/predictionMarketDataService";

// Extended market type that may include additional fields from context
type MarketWithExtras = PredictionMarket & {
	title?: string;
	status?: string;
	settled?: boolean;
};

interface MarketSelectorProps {
	markets: MarketWithExtras[];
	selectedMarket: MarketWithExtras | null;
	onSelect: (market: MarketWithExtras | null) => void;
}

export function MarketSelector({ markets, selectedMarket, onSelect }: MarketSelectorProps) {
	if (markets.length === 0) {
		return (
			<div className="market-selector">
				<p style={{ color: "#9ca3af" }}>No unsettled markets available</p>
			</div>
		);
	}

	// Helper to get display name from market
	const getDisplayName = (market: MarketWithExtras) => {
		return market.displayName || market.question || market.questionId;
	};

	// Helper to get market ID (same pattern as trading page)
	const getMarketId = (market: MarketWithExtras) => {
		return market._id || market.questionId || market.marketId;
	};

	// Selected market ID for the select value
	const selectedId = selectedMarket ? getMarketId(selectedMarket) : "";

	return (
		<div className="market-selector">
			<select
				value={selectedId}
				onChange={(e) => {
					const market = markets.find((m) => getMarketId(m) === e.target.value) || null;
					console.log("[MarketSelector] Selected market:", market);
					console.log("[MarketSelector] Market _id:", market?._id);
					console.log("[MarketSelector] Market questionId:", market?.questionId);
					console.log("[MarketSelector] Market marketId:", market?.marketId);
					onSelect(market);
				}}
				className="market-select"
			>
				<option value="">Select a market...</option>
				{markets.map((market) => (
					<option key={getMarketId(market)} value={getMarketId(market)}>
						{getDisplayName(market)}
					</option>
				))}
			</select>

			{selectedMarket && (
				<div className="selected-market-info">
					<h4>{getDisplayName(selectedMarket)}</h4>
					<div className="market-details">
						<div className="detail-row">
							<span className="label">_id:</span>
							<span className="value monospace">{selectedMarket._id || "N/A"}</span>
						</div>
						<div className="detail-row">
							<span className="label">questionId:</span>
							<span className="value monospace">{selectedMarket.questionId || "N/A"}</span>
						</div>
						<div className="detail-row">
							<span className="label">marketId:</span>
							<span className="value monospace">{selectedMarket.marketId || "N/A"}</span>
						</div>
						<div className="detail-row">
							<span className="label">WS ID (used):</span>
							<span className="value monospace" style={{ color: "#10b981" }}>
								{getMarketId(selectedMarket)}
							</span>
						</div>
						<div className="detail-row">
							<span className="label">YES Token ID:</span>
							<span className="value monospace">{selectedMarket.yesTokenId || "N/A"}</span>
						</div>
						<div className="detail-row">
							<span className="label">NO Token ID:</span>
							<span className="value monospace">{selectedMarket.noTokenId || "N/A"}</span>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
