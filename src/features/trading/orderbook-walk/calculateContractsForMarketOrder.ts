import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import type { MarketOrderCalculation } from "./types";

function buyLevelsFromOrderbook(
	orderbook: OrderbookSnapshot,
	position: "yes" | "no",
): Array<{ price: number; size: number }> {
	const relevantOrders = position === "yes" ? orderbook.asks : orderbook.bids;
	if (!relevantOrders?.length) return [];
	const sorted =
		position === "yes"
			? [...relevantOrders].sort((a, b) => a.price - b.price)
			: [...relevantOrders].sort((a, b) => b.price - a.price);
	const out: Array<{ price: number; size: number }> = [];
	for (const order of sorted) {
		const orderPrice = order.price;
		const costPerContract = position === "no" ? 1 - orderPrice : orderPrice;
		if (!(costPerContract > 0) || costPerContract >= 1) continue;
		let totalAvailableSize = 0;
		if (order.orders && Array.isArray(order.orders)) {
			totalAvailableSize = order.orders.reduce((sum, nestedOrder) => {
				const orderSize = nestedOrder.size || nestedOrder.makerQty || nestedOrder.origSize || 0;
				return sum + orderSize;
			}, 0);
		} else {
			totalAvailableSize = order.size || 0;
		}
		if (totalAvailableSize > 0) {
			out.push({ price: costPerContract, size: totalAvailableSize });
		}
	}
	return out;
}

/** Fractional buy walk (preserves sub-cent prices like 11.1¢). */
function calculateFractionalBuyContracts(
	orderbook: OrderbookSnapshot,
	usdAmount: number,
	position: "yes" | "no",
): MarketOrderCalculation {
	const levels = buyLevelsFromOrderbook(orderbook, position);
	if (levels.length === 0) return { contracts: 0, remainingUsd: usdAmount };

	let remainingUsd = usdAmount;
	let filledShares = 0;
	let maxPriceSeen = 0;

	for (const level of levels) {
		if (remainingUsd <= 0) break;
		const rowCost = level.size * level.price;
		if (remainingUsd >= rowCost) {
			filledShares += level.size;
			remainingUsd -= rowCost;
			if (level.price > maxPriceSeen) maxPriceSeen = level.price;
			continue;
		}
		const affordable = remainingUsd / level.price;
		const takeShares = Math.min(level.size, Math.max(0, affordable));
		if (takeShares > 0) {
			filledShares += takeShares;
			remainingUsd -= takeShares * level.price;
			if (level.price > maxPriceSeen) maxPriceSeen = level.price;
		}
		break;
	}

	return {
		contracts: filledShares,
		remainingUsd,
		maxPrice: maxPriceSeen,
	};
}

/** Step-clearing walk of an orderbook for market buy/sell sizing. */
export function calculateContractsForMarketOrder(
	orderbook: OrderbookSnapshot | null,
	usdAmount: number,
	position: "yes" | "no",
	side: "buy" | "sell",
	wholeSharesOnly: boolean = true,
): MarketOrderCalculation {
	if (!orderbook || !usdAmount || usdAmount <= 0) {
		return { contracts: 0, remainingUsd: usdAmount };
	}

	if (side === "sell") {
		const sharesToSell = wholeSharesOnly ? Math.floor(usdAmount) : usdAmount;
		let remainingShares = sharesToSell;
		let totalUsdReceived = 0;
		let maxPriceSeen = 0;
		let minPriceSeen = Infinity;

		const relevantOrders = position === "yes" ? orderbook.bids : orderbook.asks;
		if (!relevantOrders || !Array.isArray(relevantOrders)) {
			return {
				contracts: 0,
				remainingUsd: 0,
				maxPrice: 0,
				minPrice: 0,
			};
		}

		const sortedOrders =
			position === "yes"
				? [...relevantOrders].sort((a, b) => b.price - a.price)
				: [...relevantOrders].sort((a, b) => a.price - b.price);

		for (const order of sortedOrders) {
			if (remainingShares <= 0) break;

			const orderPrice = position === "no" ? 1 - order.price : order.price;
			let availableSize = 0;

			if (order.orders && Array.isArray(order.orders)) {
				availableSize = order.orders.reduce((sum, nestedOrder) => sum + (nestedOrder.size || 0), 0);
			} else {
				availableSize = order.size || 0;
			}
			const availableWhole = wholeSharesOnly ? Math.floor(availableSize) : availableSize;
			const sharesAtThisPrice = Math.min(availableWhole, remainingShares);

			if (sharesAtThisPrice > 0) {
				const usdAtThisPrice = sharesAtThisPrice * orderPrice;
				totalUsdReceived += usdAtThisPrice;
				remainingShares -= sharesAtThisPrice;
				if (orderPrice > maxPriceSeen) maxPriceSeen = orderPrice;
				if (orderPrice < minPriceSeen) minPriceSeen = orderPrice;
			}
		}

		return {
			contracts: sharesToSell - remainingShares,
			remainingUsd: totalUsdReceived,
			maxPrice: maxPriceSeen,
			minPrice: minPriceSeen === Infinity ? 0 : minPriceSeen,
		};
	}

	if (!wholeSharesOnly) {
		return calculateFractionalBuyContracts(orderbook, usdAmount, position);
	}

	const S_cents = Math.floor(usdAmount * 100);
	let filled_shares = 0;
	let maxPriceSeen = 0;
	let remaining_cents = S_cents;

	const relevantOrders = position === "yes" ? orderbook.asks : orderbook.bids;

	if (!relevantOrders || !Array.isArray(relevantOrders)) {
		return { contracts: 0, remainingUsd: usdAmount };
	}

	const sortedOrders =
		position === "yes"
			? [...relevantOrders].sort((a, b) => a.price - b.price)
			: [...relevantOrders].sort((a, b) => b.price - a.price);

	let i = 0;
	while (i < sortedOrders.length && remaining_cents > 0) {
		const order = sortedOrders[i];
		const orderPrice = order.price;
		const costPerContract = position === "no" ? 1 - orderPrice : orderPrice;
		const p_cents = Math.round(costPerContract * 100);

		let totalAvailableSize = 0;
		if (order.orders && Array.isArray(order.orders)) {
			totalAvailableSize = order.orders.reduce((sum, nestedOrder) => {
				const orderSize = nestedOrder.size || nestedOrder.makerQty || nestedOrder.origSize || 0;
				return sum + orderSize;
			}, 0);
		} else {
			totalAvailableSize = order.size || 0;
		}

		const availableWhole = wholeSharesOnly ? Math.floor(totalAvailableSize) : totalAvailableSize;
		if (availableWhole <= 0 || p_cents <= 0) {
			i++;
			continue;
		}

		const row_total_cents = availableWhole * p_cents;

		if (remaining_cents >= row_total_cents) {
			filled_shares += availableWhole;
			remaining_cents -= row_total_cents;
			if (costPerContract > maxPriceSeen) maxPriceSeen = costPerContract;
			i++;
			continue;
		}

		const affordableShares = wholeSharesOnly
			? Math.floor(remaining_cents / p_cents)
			: remaining_cents / p_cents;
		const takeShares = Math.min(availableWhole, Math.max(0, affordableShares));
		if (takeShares > 0) {
			const cost_cents = takeShares * p_cents;
			filled_shares += takeShares;
			remaining_cents -= cost_cents;
			if (costPerContract > maxPriceSeen) maxPriceSeen = costPerContract;
		}
		break;
	}

	const total_contracts = filled_shares;
	const remaining_usd = remaining_cents / 100.0;

	return {
		contracts: total_contracts,
		remainingUsd: remaining_usd,
		maxPrice: maxPriceSeen,
	};
}
