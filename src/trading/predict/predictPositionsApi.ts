import type { VenuePosition } from "@/types/trading/venuePosition";
import { normalizePredictTokenId } from "./predictOrdersApi";

export type PredictPositionRow = {
	id: string;
	market: {
		id: number;
		title: string;
		question: string;
		conditionId: string;
	};
	outcome: {
		name: string;
		onChainId: string;
	};
	amount: string;
	valueUsd: string;
	/** Injected by LevelUp private API when `exchangeMatching.predictFun` matches. */
	levelUpUmbrellaId?: string;
	levelUpUmbrellaDisplayName?: string;
};

function toVenuePosition(row: PredictPositionRow): VenuePosition {
	const shares = Number(row.amount) / 1e18;
	const currentValue = parseFloat(row.valueUsd) || 0;
	const currentPrice = shares > 0 ? currentValue / shares : null;
	return {
		venue: "predictfun",
		marketTitle: row.market.question || row.market.title,
		outcome: row.outcome.name,
		shares,
		avgPrice: null,
		currentPrice,
		cost: null,
		currentValue,
		pnl: null,
		pnlPercent: null,
		tokenId: normalizePredictTokenId(row.outcome.onChainId),
		conditionId: row.market.conditionId,
		numericMarketId: row.market.id,
		...(row.levelUpUmbrellaId?.trim()
			? { levelUpUmbrellaId: row.levelUpUmbrellaId.trim() }
			: {}),
		...(row.levelUpUmbrellaDisplayName?.trim()
			? { levelUpUmbrellaDisplayName: row.levelUpUmbrellaDisplayName.trim() }
			: {}),
	};
}

/** Normalize proxied GET `/api/predict/positions/:address` body (`data` array). */
export function mapPredictPositionRows(
	data: PredictPositionRow[] | null | undefined
): VenuePosition[] {
	if (!Array.isArray(data)) return [];
	return data.map(toVenuePosition).filter((p) => p.shares > 0.0001);
}
