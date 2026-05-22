import { getPrivateApiRoutingDescription } from "@/config/privateApiBase";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";

export type Eip1193Like = {
	request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

function bboFromSnapshot(book: OrderbookSnapshot | null | undefined): {
	bestAsk: number | null;
	bestBid: number | null;
} {
	if (!book) return { bestAsk: null, bestBid: null };
	const asks = book.asks;
	const bids = book.bids;
	const bestAsk =
		asks?.length && asks.length > 0
			? Math.min(...asks.map((a) => Number(a.price)))
			: null;
	const bestBid =
		bids?.length && bids.length > 0
			? Math.max(...bids.map((b) => Number(b.price)))
			: null;
	return { bestAsk, bestBid };
}

/** Polymarket CTF exchange order uses 6 decimals for maker/taker amounts (USDC + outcome). */
function decodeOrderAmounts(message: Record<string, unknown>): {
	makerUsdc: string;
	takerOutcome: string;
	impliedPricePerShare: string;
	summary: string;
} | null {
	const ma = message.makerAmount;
	const ta = message.takerAmount;
	const side = message.side;
	if (typeof ma !== "string" || typeof ta !== "string") return null;
	try {
		const m = BigInt(ma);
		const t = BigInt(ta);
		if (t === BigInt(0)) {
			return {
				makerUsdc: (Number(m) / 1e6).toFixed(6),
				takerOutcome: (Number(t) / 1e6).toFixed(6),
				impliedPricePerShare: "—",
				summary: "takerAmount is zero",
			};
		}
		// side uint8: 0 = BUY outcome with USDC (typical); price ≈ USDC / shares
		const usdc = Number(m) / 1e6;
		const shares = Number(t) / 1e6;
		const px = shares > 0 ? usdc / shares : 0;
		const sideLabel =
			side === "0" || side === 0
				? "BUY"
				: side === "1" || side === 1
					? "SELL"
					: String(side);
		return {
			makerUsdc: usdc.toFixed(6),
			takerOutcome: shares.toFixed(6),
			impliedPricePerShare: px > 0 ? px.toFixed(6) : "—",
			summary: `${sideLabel}: spend ~${usdc.toFixed(4)} USDC for ~${shares.toFixed(4)} shares → ~${px.toFixed(4)} USDC/share`,
		};
	} catch {
		return null;
	}
}

/**
 * Wrap EIP-1193 so dev logs show the same kind of detail as LevelUp’s TradeExecutionService
 * (order payload + implied price) when the CLOB asks the wallet to sign.
 */
export function wrapEip1193ForPolymarketDevLogging(
	eip1193: Eip1193Like
): Eip1193Like {
	if (!import.meta.env.DEV) return eip1193;

	return {
		request: async (args) => {
			if (args.method === "eth_signTypedData_v4" && args.params?.[1]) {
				try {
					const raw = args.params[1];
					const parsed =
						typeof raw === "string" ? JSON.parse(raw) : raw;
					const dom = parsed?.domain;
					const msg = parsed?.message;
					if (
						parsed?.primaryType === "Order" &&
						msg &&
						typeof msg === "object"
					) {
						const m = msg as Record<string, unknown>;
						const decoded = decodeOrderAmounts(m);
						// eslint-disable-next-line no-console
						console.info(
							"%c[Polymarket CLOB] EIP-712 Order (about to sign)",
							"color:#7c3aed;font-weight:bold",
							{
								chainId: dom?.chainId,
								exchange: dom?.verifyingContract,
								tokenId: m.tokenId,
								maker: m.maker,
								signer: m.signer,
								taker: m.taker,
								nonce: m.nonce,
								expiration: m.expiration,
								feeRateBps: m.feeRateBps,
								signatureType: m.signatureType,
								...decoded,
							}
						);
					}
				} catch {
					/* non-JSON or unexpected shape */
				}
			}
			return eip1193.request(args);
		},
	};
}

export type PolymarketPreflightLog = {
	marketId?: string;
	marketName?: string;
	pandascoreMatchId?: string;
	orderType: "market" | "limit";
	side: "buy" | "sell";
	selectedPosition: "yes" | "no";
	inputAmount: string;
	limitPriceCentsInput: string;
	/** Limit only: probability 0–1 from the cents box (same as CLOB `price`). */
	limitPriceProbIfLimit: number | null;
	/**
	 * Market only: weighted avg fill from walking `effectiveOrderbook` (same engine as UI “Avg. odds”).
	 * CLOB may still refines against live depth at sign time.
	 */
	derivedAvgPriceFromBookWalk: number | null;
	volumeTokenId: string;
	safeAddress?: string;
	eoaAddress?: string;
	book: { bestAsk: number | null; bestBid: number | null };
	sizing: {
		calculatedContracts: number | null;
		remainingUsd: number | null;
		spent: number | null;
		estimatedCost: number | null;
		grossReceive: number | null;
		netReceive: number | null;
	};
	builderSignUrl: string;
	clobHost: string;
};

/** Single structured block — same spirit as `TradeExecutionService` console logs. */
export function logPolymarketTradePreflight(ctx: PolymarketPreflightLog): void {
	if (!import.meta.env.DEV) return;
	const line =
		"%c[Polymarket trade] preflight — market orders have no limit `price` field; see derivedAvgPriceFromBookWalk + EIP-712 log on sign";
	// eslint-disable-next-line no-console
	console.info(line, "color:#0ea5e9;font-weight:bold", ctx);
}

export function logPolymarketOrderSuccessResponse(result: unknown): void {
	if (!import.meta.env.DEV) return;
	// eslint-disable-next-line no-console
	console.info(
		"%c[Polymarket CLOB] order accepted",
		"color:#16a34a;font-weight:bold",
		result
	);
}

/** Call from app init helpers if you want one-time notice in dev. */
export function logPolymarketBackendRouting(): void {
	if (!import.meta.env.DEV) return;
	const route = getPrivateApiRoutingDescription();
	// eslint-disable-next-line no-console
	console.info("[Polymarket] private API (builder/sign, account, …):", route);
}

export { bboFromSnapshot };
