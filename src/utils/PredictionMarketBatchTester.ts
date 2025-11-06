import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { TradeExecutionParams } from "@/pages/PredictionMarket/PredictionMarketTradeBox/types";

export type ExecuteTradeFn = (
	params: TradeExecutionParams,
	privyWallet?: any
) => Promise<{ success: boolean; error?: string }>;

function randomInt(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

function generateRandomLimitOrderParams(
	market: PredictionMarket
): Omit<TradeExecutionParams, "userAddress"> {
	// Random side and position
	const side = randomChoice(["buy", "sell"]) as "buy" | "sell";
	const position = randomChoice(["yes", "no"]) as "yes" | "no";

	// Random shares: 0.10 to 100.00 with up to 2 decimals
	const shares = parseFloat((Math.random() * (100 - 0.1) + 0.1).toFixed(2));

	// Random price in cents: 1-99, enforce two decimals when converted to dollars
	const cents = randomInt(1, 99);
	const priceDollars = parseFloat((cents / 100).toFixed(2));

	return {
		marketId: market._id,
		position,
		amount: shares,
		price: priceDollars,
		orderType: "limit",
		side,
		market,
	} as unknown as TradeExecutionParams;
}

export async function runBatchTestOrders(args: {
	market: PredictionMarket;
	executeTrade: ExecuteTradeFn;
	batchSize?: number; // default 50
	concurrency?: number; // default 5
}): Promise<void> {
	const { market, executeTrade, batchSize = 50, concurrency = 5 } = args;

	const tasks: Array<() => Promise<void>> = [];
	for (let i = 0; i < batchSize; i++) {
		tasks.push(async () => {
			const params = generateRandomLimitOrderParams(market);
			// Note: userAddress is resolved inside executeTrade via wallet hook
			try {
				// eslint-disable-next-line no-console
				console.log("🧪 Submitting test order:", params);
				const res = await executeTrade(params, undefined);
				if (!res?.success) {
					// eslint-disable-next-line no-console
					console.warn("⚠️ Test order failed:", res?.error);
				}
			} catch (e: any) {
				// eslint-disable-next-line no-console
				console.error("❌ Test order exception:", e?.message || e);
			}
		});
	}

	// Run with limited concurrency
	let index = 0;
	const runners = new Array(Math.min(concurrency, tasks.length))
		.fill(0)
		.map(async () => {
			while (index < tasks.length) {
				const current = index++;
				await tasks[current]();
			}
		});

	await Promise.all(runners);
	// eslint-disable-next-line no-console
	console.log(`✅ Completed ${batchSize} test orders`);
}
