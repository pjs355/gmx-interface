import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import type { AvailableLiquidity } from "./types";

export function getAvailableLiquidity(
	orderbook: OrderbookSnapshot | null,
	position: "yes" | "no",
	side: "buy" | "sell",
	wholeSharesOnly: boolean = true,
): AvailableLiquidity {
	if (!orderbook) {
		return { maxSharesAvailable: 0, maxUsdValue: 0, hasAnyLiquidity: false };
	}

	const relevantOrders =
		side === "buy"
			? position === "yes"
				? orderbook.asks
				: orderbook.bids
			: position === "yes"
				? orderbook.bids
				: orderbook.asks;

	if (!relevantOrders || !Array.isArray(relevantOrders)) {
		return { maxSharesAvailable: 0, maxUsdValue: 0, hasAnyLiquidity: false };
	}

	let maxSharesAvailable = 0;
	let maxUsdValue = 0;

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

		const effectiveSize = wholeSharesOnly ? Math.floor(totalAvailableSize) : totalAvailableSize;
		maxSharesAvailable += effectiveSize;
		maxUsdValue += effectiveSize * costPerContract;
	}

	return {
		maxSharesAvailable,
		maxUsdValue,
		hasAnyLiquidity: maxSharesAvailable > 0,
	};
}
