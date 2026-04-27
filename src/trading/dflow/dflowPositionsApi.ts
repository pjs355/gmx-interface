import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import type { VenueHistoryFill, VenuePosition } from "@/types/trading/venuePosition";
import type {
	DflowBatchMarket,
	DflowMarketAccountInfo,
	DflowOnchainTrade,
} from "@/services/privateApi";

export type DflowSolanaToken = {
	mint: string;
	balance: number;
	decimals: number;
};

export type DflowMarketPosition = DflowSolanaToken & {
	side: "yes" | "no";
	market: DflowBatchMarket;
};

/**
 * Reads all Token-2022 accounts from a Solana wallet and returns
 * non-zero balances as `DflowSolanaToken[]`.
 */
export async function fetchWalletToken2022Accounts(
	connection: Connection,
	owner: PublicKey
): Promise<DflowSolanaToken[]> {
	const resp = await connection.getParsedTokenAccountsByOwner(owner, {
		programId: TOKEN_2022_PROGRAM_ID,
	});

	const tokens: DflowSolanaToken[] = [];
	for (const { account } of resp.value) {
		const info = account.data.parsed?.info;
		if (!info) continue;
		const uiAmount: number | null = info.tokenAmount?.uiAmount ?? null;
		if (uiAmount == null || uiAmount <= 0) continue;
		tokens.push({
			mint: info.mint as string,
			balance: uiAmount,
			decimals: info.tokenAmount?.decimals ?? 0,
		});
	}
	return tokens;
}

/**
 * Given outcome mints and a market from `markets/batch`, determine
 * whether a mint is on the "yes" or "no" side by inspecting the
 * market's `accounts` map.
 */
function resolveSide(
	mint: string,
	accounts: Record<string, DflowMarketAccountInfo>
): "yes" | "no" | null {
	for (const acct of Object.values(accounts)) {
		if (acct.yesMint === mint) return "yes";
		if (acct.noMint === mint) return "no";
	}
	return null;
}

/**
 * Matches Token-2022 balances to their DFlow batch-market responses.
 * Returns a `DflowMarketPosition` for every token that maps to a market.
 */
export function matchTokensToMarkets(
	tokens: DflowSolanaToken[],
	markets: DflowBatchMarket[]
): DflowMarketPosition[] {
	const mintToToken = new Map(tokens.map((t) => [t.mint, t]));
	const positions: DflowMarketPosition[] = [];

	for (const market of markets) {
		for (const acctInfo of Object.values(market.accounts)) {
			for (const mint of [acctInfo.yesMint, acctInfo.noMint]) {
				const token = mintToToken.get(mint);
				if (!token) continue;
				const side = resolveSide(mint, market.accounts);
				if (!side) continue;
				positions.push({ ...token, side, market });
			}
		}
	}
	return positions;
}

type CostEntry = {
	avgPrice: number;
	totalCost: number;
	totalShares: number;
	/** Latest on-chain trade `createdAt` for this mint (normalized to ms) */
	lastTradeAtMs: number | null;
};

type CostBucket = {
	totalCost: number;
	totalShares: number;
	lastTradeAtMs: number | null;
};

/** API may return probability as 0.12 or 12 (¢ / %). */
function normalizeDflowProbabilityValue(n: number): number | null {
	if (!Number.isFinite(n) || n < 0) return null;
	let p = n;
	if (p > 1 && p <= 100) p = p / 100;
	if (p > 1 || p < 0) return null;
	return p;
}

function parseDflowQuoteField(raw: string | null | undefined): number | null {
	if (raw == null) return null;
	const t = String(raw).trim();
	if (t === "") return null;
	return normalizeDflowProbabilityValue(Number(t));
}

function complementOneMinus(p: number | null): number | null {
	if (p == null || !Number.isFinite(p)) return null;
	const x = 1 - p;
	return x >= 0 && x <= 1 ? x : null;
}

/**
 * Mark price for an open DFlow/Kalshi position when primary ask is missing.
 * Order: same-side ask → same-side bid → complement of other-side ask → complement of other-side bid → cost average.
 */
function dflowOpenMarkPrice(
	side: "yes" | "no",
	m: DflowBatchMarket,
	costAvg: number | null,
): number | null {
	if (side === "yes") {
		return (
			parseDflowQuoteField(m.yesAsk) ??
			parseDflowQuoteField(m.yesBid) ??
			complementOneMinus(parseDflowQuoteField(m.noAsk)) ??
			complementOneMinus(parseDflowQuoteField(m.noBid)) ??
			normalizeDflowProbabilityValue(costAvg ?? NaN)
		);
	}
	return (
		parseDflowQuoteField(m.noAsk) ??
		parseDflowQuoteField(m.noBid) ??
		complementOneMinus(parseDflowQuoteField(m.yesAsk)) ??
		complementOneMinus(parseDflowQuoteField(m.yesBid)) ??
		normalizeDflowProbabilityValue(costAvg ?? NaN)
	);
}

function onchainTradeCreatedMs(t: DflowOnchainTrade): number | null {
	const c = t.createdAt;
	if (typeof c !== "number" || !Number.isFinite(c)) return null;
	return c > 1e12 ? Math.floor(c) : Math.floor(c * 1000);
}

/**
 * Builds a cost-basis map keyed by `outputMint` from on-chain trade history.
 * Aggregates `usdPricePerContract` * `contracts` for cost, and weighted-average
 * for avgPrice.
 */
export function buildCostMap(
	trades: DflowOnchainTrade[]
): Map<string, CostEntry> {
	const buckets = new Map<string, CostBucket>();

	for (const t of trades) {
		if (!t.outputMint) continue;
		const shares = t.contracts ?? t.outputAmount ?? 0;
		const cost =
			t.usdPricePerContract != null ? t.usdPricePerContract * shares : 0;
		const tradeMs = onchainTradeCreatedMs(t);

		const bucket = buckets.get(t.outputMint) ?? {
			totalCost: 0,
			totalShares: 0,
			lastTradeAtMs: null,
		};
		bucket.totalCost += cost;
		bucket.totalShares += shares;
		if (tradeMs != null) {
			if (bucket.lastTradeAtMs == null || tradeMs > bucket.lastTradeAtMs) {
				bucket.lastTradeAtMs = tradeMs;
			}
		}
		buckets.set(t.outputMint, bucket);
	}

	const result = new Map<string, CostEntry>();
	for (const [mint, b] of buckets) {
		const { totalCost, totalShares, lastTradeAtMs } = b;
		result.set(mint, {
			avgPrice: totalShares > 0 ? totalCost / totalShares : 0,
			totalCost,
			totalShares,
			lastTradeAtMs,
		});
	}
	return result;
}

/**
 * Common Solana quote mints — never treat as outcome legs for fill rows.
 * (Avoids classifying USDC→outcome buys as “sells” on the USDC mint.)
 */
const DFLOW_QUOTE_MINTS = new Set([
	"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
	"Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
	"So11111111111111111111111111111111111111112", // wSOL
]);

function isDflowQuoteMint(mint: string | undefined | null): boolean {
	const m = mint?.trim();
	if (!m) return false;
	return DFLOW_QUOTE_MINTS.has(m);
}

function inferUsdcProceedsFromOutputAmount(outputAmount: number): number {
	const a = Math.abs(outputAmount);
	if (a <= 0 || !Number.isFinite(a)) return 0;
	if (a >= 1e5) return a / 1e6;
	return a;
}

function dflowFillProbPrice(
	usdc: number,
	shares: number,
	usdPricePerContract: number | null,
): number | null {
	if (
		usdPricePerContract != null &&
		Number.isFinite(usdPricePerContract) &&
		usdPricePerContract > 0
	) {
		const p = usdPricePerContract;
		if (p <= 1) return p;
		if (p > 1 && p <= 100) return p / 100;
	}
	if (shares > 0 && usdc > 0) {
		const p = usdc / shares;
		if (p > 0 && p <= 1) return p;
		if (p > 1 && p <= 100) return p / 100;
	}
	return null;
}

/**
 * Per-mint fill legs from `GET /api/dflow/onchain-trades` for History expansion.
 * - `outputMint`: outcome tokens received (buy / mint).
 * - `inputMint`: outcome tokens sent (sell / burn); quote is usually `outputMint`.
 */
export function buildDflowHistoryFillsByMint(
	trades: DflowOnchainTrade[],
): Map<string, VenueHistoryFill[]> {
	const byMint = new Map<string, VenueHistoryFill[]>();

	function pushFill(mint: string, fill: VenueHistoryFill): void {
		const arr = byMint.get(mint) ?? [];
		arr.push(fill);
		byMint.set(mint, arr);
	}

	for (const t of trades) {
		const ms = onchainTradeCreatedMs(t);
		const tradedAt = ms != null ? new Date(ms).toISOString() : "";
		const sig = t.transactionSignature?.trim() ?? "";
		const baseSrc = sig || `id-${t.id}`;

		// Buy: receive outcome token on output side (skip if output is USDC/SOL quote)
		if (t.outputMint?.trim() && !isDflowQuoteMint(t.outputMint)) {
			const shares =
				t.contracts != null && Number.isFinite(t.contracts) && t.contracts !== 0
					? Math.abs(t.contracts)
					: Math.abs(t.outputAmount ?? 0);
			if (shares > 0) {
				const usdc =
					t.usdPricePerContract != null && Number.isFinite(t.usdPricePerContract)
						? t.usdPricePerContract * shares
						: 0;
				const price = dflowFillProbPrice(
					usdc,
					shares,
					t.usdPricePerContract,
				);
				pushFill(t.outputMint.trim(), {
					side: "buy",
					shares,
					usdc,
					tradedAt,
					sourceId: `${baseSrc}:buy-out`,
					price,
				});
			}
		}

		// Sell / burn: send outcome token on input side (skip quote → outcome buys)
		if (
			t.inputMint?.trim() &&
			t.inputMint.trim() !== (t.outputMint?.trim() ?? "") &&
			!isDflowQuoteMint(t.inputMint)
		) {
			const hasContracts =
				t.contracts != null && Number.isFinite(t.contracts) && t.contracts !== 0;
			const shares = hasContracts
				? Math.abs(t.contracts as number)
				: Math.abs(t.inputAmount ?? 0);
			if (shares > 0 && (!hasContracts ? shares < 1e9 : true)) {
				let usdc =
					t.usdPricePerContract != null && Number.isFinite(t.usdPricePerContract)
						? t.usdPricePerContract * shares
						: 0;
				if (usdc <= 0) {
					usdc = inferUsdcProceedsFromOutputAmount(t.outputAmount ?? 0);
				}
				const price = dflowFillProbPrice(
					usdc,
					shares,
					t.usdPricePerContract,
				);
				pushFill(t.inputMint.trim(), {
					side: "sell",
					shares,
					usdc,
					tradedAt,
					sourceId: `${baseSrc}:sell-in`,
					price,
				});
			}
		}
	}

	for (const fills of byMint.values()) {
		fills.sort(
			(a, b) =>
				Date.parse(a.tradedAt || "0") - Date.parse(b.tradedAt || "0"),
		);
	}

	return byMint;
}

/**
 * Outcome mint addresses appearing in on-chain trades (excludes USDC/SOL quote legs).
 */
export function collectOutcomeMintCandidatesFromTrades(
	trades: DflowOnchainTrade[],
): string[] {
	const set = new Set<string>();
	for (const t of trades) {
		const out = t.outputMint?.trim();
		if (out && !isDflowQuoteMint(out)) set.add(out);
		const inp = t.inputMint?.trim();
		if (inp && !isDflowQuoteMint(inp)) set.add(inp);
	}
	return [...set];
}

/**
 * Zero-balance outcome positions that still have on-chain fills (fully closed books).
 */
export function buildGhostDflowMarketPositions(
	ghostMints: string[],
	markets: DflowBatchMarket[],
): DflowMarketPosition[] {
	const out: DflowMarketPosition[] = [];
	const seen = new Set<string>();
	for (const mint of ghostMints) {
		if (seen.has(mint)) continue;
		for (const market of markets) {
			const side = resolveSide(mint, market.accounts);
			if (!side) continue;
			seen.add(mint);
			out.push({
				mint,
				balance: 0,
				decimals: 0,
				side,
				market,
			});
			break;
		}
	}
	return out;
}

/**
 * Converts matched positions + cost basis into the normalised `VenuePosition[]`
 * used by the Positions page and PortfolioContext.
 */
export function toVenuePositions(
	positions: DflowMarketPosition[],
	costMap: Map<string, CostEntry>,
	fillsByMint?: Map<string, VenueHistoryFill[]>,
): VenuePosition[] {
	return positions.map((pos) => {
		const isFinalized = pos.market.status === "finalized";
		const isWon = isFinalized && pos.market.result?.toLowerCase() === pos.side;
		const isLost = isFinalized && !isWon;

		const cost = costMap.get(pos.mint);
		const avgPrice = cost?.avgPrice ?? null;

		let currentPrice: number | null;
		let currentValue: number;

		if (isFinalized) {
			currentPrice = isWon ? 1 : 0;
			currentValue = isWon ? pos.balance : 0;
		} else {
			currentPrice = dflowOpenMarkPrice(pos.side, pos.market, avgPrice);
			currentValue = currentPrice != null ? pos.balance * currentPrice : 0;
		}
		const totalCost = cost?.totalCost ?? null;
		const pnl = totalCost != null ? currentValue - totalCost : null;
		const pnlPercent =
			pnl != null && totalCost != null && totalCost > 0
				? (pnl / totalCost) * 100
				: null;

		const fills = fillsByMint?.get(pos.mint);
		let latestMs = cost?.lastTradeAtMs ?? null;
		if (fills?.length) {
			for (const f of fills) {
				const parsed = Date.parse(f.tradedAt);
				if (Number.isFinite(parsed) && (latestMs == null || parsed > latestMs)) {
					latestMs = parsed;
				}
			}
		}

		return {
			venue: "dflow",
			marketTitle: pos.market.title,
			outcome: pos.side === "yes" ? "Yes" : "No",
			shares: pos.balance,
			avgPrice,
			currentPrice,
			cost: totalCost,
			currentValue,
			pnl,
			pnlPercent,
			tokenId: pos.mint,
			marketStatus: pos.market.status?.toUpperCase(),
			outcomeResult: isFinalized ? (isWon ? "WON" : "LOST") : null,
			...(latestMs != null
				? { historyTradeAt: new Date(latestMs).toISOString() }
				: {}),
			...(fills != null && fills.length > 0 ? { historyFills: fills } : {}),
		};
	});
}
