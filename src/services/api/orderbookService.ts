import { getOrderbookApiBaseUrl } from "@/config/predictionApiBase";
export interface OrderbookEntry {
	id?: string;
	side?: "buy" | "sell";
	size?: number;
	price: number;
	timeInForce?: string;
	// Handle nested orders structure from actual API response
	orders?: Array<{
		id: string;
		side: "buy" | "sell";
		size: number;
		makerQty: number;
		origSize: number;
		takerQty: number;
		time: number;
		timeInForce: string;
		type: string;
	}>;
	originalClobOrder?: {
		tokenId: string;
		maker: string;
		signer: string;
		signature: string;
	};
}

export interface OrderbookSnapshot {
	asks: OrderbookEntry[];
	bids: OrderbookEntry[];
	stopBook: {
		asks: OrderbookEntry[];
		bids: OrderbookEntry[];
	};
	ts: number;
	lastOp: number;
	questionId?: string;
}

export interface OrderbookResponse {
	success: boolean;
	data: OrderbookSnapshot;
}

export class OrderbookService {
	private static inFlight = new Map<string, Promise<OrderbookSnapshot | null>>();
	private static cache = new Map<string, { data: OrderbookSnapshot; expiresAt: number }>();
	private readonly CACHE_TTL_MS = 30000; // 30s

	private getBaseUrl(): string {
		const base = getOrderbookApiBaseUrl();
		if (typeof base === "undefined" || base === null) {
			throw new Error("Orderbook API base URL is undefined");
		}
		return base as string;
	}

	async fetchOrderbook(questionId: string): Promise<OrderbookSnapshot | null> {
		try {
			if (typeof questionId !== "string" || questionId.length === 0) {
				throw new Error("fetchOrderbook requires a valid questionId");
			}

			// Serve fresh cache
			const cached = OrderbookService.cache.get(questionId);
			const now = Date.now();
			if (cached && cached.expiresAt > now) {
				return cached.data;
			}

			// Coalesce in-flight
			const key = `ob:${questionId}`;
			const existing = OrderbookService.inFlight.get(key);
			if (existing) return existing;

			const p = (async () => {
				const response = await fetch(`${this.getBaseUrl()}/orderbook/${questionId}`);
				if (!response.ok) {
					throw new Error(`HTTP error! status: ${response.status}`);
				}
				const result: OrderbookResponse = await response.json();
				if (!result.success) {
					throw new Error("API returned success: false");
				}
				const data = result.data;
				OrderbookService.cache.set(questionId, {
					data,
					expiresAt: Date.now() + this.CACHE_TTL_MS,
				});
				return data;
			})()
				.catch((error) => {
					console.error("❌ Error fetching orderbook:", error);
					return null;
				})
				.finally(() => {
					OrderbookService.inFlight.delete(key);
				});

			OrderbookService.inFlight.set(key, p);
			return p;
		} catch (error) {
			console.error("❌ Error fetching orderbook:", error);
			return null;
		}
	}

	// Helper method to format price for display
	formatPrice(price: number): string {
		return `$${price.toFixed(2)}`;
	}

	// Helper method to format size for display
	formatSize(size: number): string {
		return Math.round(size).toString();
	}

	// Helper method to get total volume at a price level
	getTotalVolumeAtPrice(orders: OrderbookEntry[], price: number): number {
		const sizedAtPrice = orders.filter(
			(order): order is OrderbookEntry & { size: number } =>
				order.price === price && typeof order.size === "number",
		);
		return sizedAtPrice.reduce((total, order) => total + order.size, 0);
	}

	// Helper method to get best bid and ask
	getBestPrices(orderbook: OrderbookSnapshot): {
		bestBid: number | null;
		bestAsk: number | null;
	} {
		const bestBid =
			orderbook.bids.length > 0 ? Math.max(...orderbook.bids.map((bid) => bid.price)) : null;

		const bestAsk =
			orderbook.asks.length > 0 ? Math.min(...orderbook.asks.map((ask) => ask.price)) : null;

		return { bestBid, bestAsk };
	}

	// Helper method to calculate spread
	getSpread(orderbook: OrderbookSnapshot): number | null {
		const { bestBid, bestAsk } = this.getBestPrices(orderbook);

		if (bestBid === null || bestAsk === null) {
			return null;
		}

		return bestAsk - bestBid;
	}

	// Helper method to calculate spread percentage
	getSpreadPercentage(orderbook: OrderbookSnapshot): number | null {
		const spread = this.getSpread(orderbook);
		const { bestBid, bestAsk } = this.getBestPrices(orderbook);

		if (spread === null || bestBid === null || bestAsk === null) {
			return null;
		}

		return (spread / bestBid) * 100;
	}
}
