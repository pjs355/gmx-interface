import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import { calculateContractsForMarketOrder } from "./calculateContractsForMarketOrder";

export function hasSufficientLiquidity(
	orderbook: OrderbookSnapshot | null,
	usdAmount: number,
	position: "yes" | "no",
	side: "buy" | "sell",
	wholeSharesOnly: boolean = true,
): boolean {
	if (!orderbook || !usdAmount || usdAmount <= 0) return false;

	if (side === "sell") {
		const sharesRequested = usdAmount;
		const result = calculateContractsForMarketOrder(
			orderbook,
			usdAmount,
			position,
			side,
			wholeSharesOnly,
		);
		const sharesSold = result.contracts;
		return Math.abs(sharesRequested - sharesSold) < 0.01;
	}

	const relevantOrders = position === "yes" ? orderbook.asks : orderbook.bids;

	if (!relevantOrders || !Array.isArray(relevantOrders)) {
		return false;
	}

	let maxBuyoutUsd = 0;

	for (const order of relevantOrders) {
		const orderPrice = order.price;
		const costPerContract = position === "no" ? 1 - orderPrice : orderPrice;

		let totalAvailableSize = 0;
		if (order.orders && Array.isArray(order.orders)) {
			totalAvailableSize = order.orders.reduce((sum, nestedOrder) => {
				const orderSize = nestedOrder.size || nestedOrder.makerQty || nestedOrder.origSize || 0;
				return sum + orderSize;
			}, 0);
		} else {
			totalAvailableSize = order.size || 0;
		}

		maxBuyoutUsd += totalAvailableSize * costPerContract;
	}

	return usdAmount <= maxBuyoutUsd + 0.01;
}
