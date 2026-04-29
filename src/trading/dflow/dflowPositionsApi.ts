import { Connection, PublicKey, type AccountInfo } from "@solana/web3.js";
import {
	TOKEN_2022_PROGRAM_ID,
	getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type { VenueHistoryFill, VenuePosition } from "@/types/trading/venuePosition";
import type {
	DflowBatchMarket,
	DflowMarketAccountInfo,
	DflowOnchainTrade,
} from "@/services/privateApi";

/**
 * Same field precedence as predictions `eventTickerFromEsportsMarket` (nested `event_ticker`
 * before camelCase `eventTicker`) so History resolve keys match `exchangeMatching.dflow`.
 */
export function dflowEventTickerFromBatchMarket(market: DflowBatchMarket): string | undefined {
	const rec = market as unknown as Record<string, unknown>;
	const snake = rec.event_ticker;
	if (typeof snake === "string" && snake.trim()) return snake.trim();
	const camel = rec.eventTicker;
	if (typeof camel === "string" && camel.trim()) return camel.trim();
	return undefined;
}

/*
 * DFlow on-chain balances (Positions / trade box) — maintainers
 * -----------------------------------------------------------
 * Why not one RPC? Solana stores each outcome mint in a separate SPL Token-2022 account (often
 * the ATA). There is no single "wallet balance" call for all prediction outcomes.
 *
 * Why not full-wallet scan? `getParsedTokenAccountsByOwner` without mint filter enumerates
 * every Token-2022 account — slow and rate-limit prone on public RPC.
 *
 * Flow: outcome mints come from API trade history → filter_outcome_mints → this module reads
 * balances only for those mints. Primary: batched `getMultipleParsedAccounts` on ATAs
 * (see constants DFLOW_*). Fallback: per-mint `getParsedTokenAccountsByOwner` when the ATA
 * cell is missing or unparsable (non-ATA custody).
 *
 * Known limitation: ATA exists with 0 uiAmount but shares live only in a non-ATA account — we
 * skip extra RPC on the "zero" path; revisit if that case appears in prod.
 *
 * Tunables: DFLOW_OUTCOME_MINT_RPC_CONCURRENCY, DFLOW_PER_MINT_BALANCE_TIMEOUT_MS,
 * DFLOW_BALANCE_MULTIREAD_CHUNK, DFLOW_MULTIREAD_CHUNK_TIMEOUT_MS.
 */

export type DflowSolanaToken = {
	mint: string;
	balance: number;
	decimals: number;
};

export type DflowMarketPosition = DflowSolanaToken & {
	side: "yes" | "no";
	market: DflowBatchMarket;
};

/** Parallelism for per-mint fallback reads (non-ATA or failed batch cell). */
export const DFLOW_OUTCOME_MINT_RPC_CONCURRENCY = 20;

/** Per-mint ceiling so a few bad mints cannot stall the whole DFlow positions query. */
export const DFLOW_PER_MINT_BALANCE_TIMEOUT_MS = 10_000;

/** `getMultipleParsedAccounts` chunk size (RPC max is typically 100). */
export const DFLOW_BALANCE_MULTIREAD_CHUNK = 100;

/** Whole-batch timeout for multi-account balance reads. */
export const DFLOW_MULTIREAD_CHUNK_TIMEOUT_MS = 22_000;

type AtaParseResult =
	| { kind: "positive"; balance: number; decimals: number }
	| { kind: "zero" }
	| { kind: "fallback" };

function parsedToken2022AtaBalance(
	account: AccountInfo<Buffer | { parsed?: unknown }> | null,
	expectedMintBase58: string,
): AtaParseResult {
	if (!account?.data || typeof account.data !== "object") return { kind: "fallback" };
	const data = account.data as {
		parsed?: { type?: string; info?: Record<string, unknown> };
	};
	const inner = data.parsed;
	if (!inner || inner.type !== "account" || !inner.info) return { kind: "fallback" };
	const info = inner.info as {
		mint?: string;
		tokenAmount?: { uiAmount?: number | null; decimals?: number };
	};
	const mint = info.mint?.trim() ?? "";
	if (mint !== expectedMintBase58.trim()) return { kind: "fallback" };
	const uiAmount = info.tokenAmount?.uiAmount;
	const decimals = info.tokenAmount?.decimals ?? 0;
	if (uiAmount == null || !Number.isFinite(uiAmount) || uiAmount <= 0) {
		return { kind: "zero" };
	}
	return { kind: "positive", balance: uiAmount, decimals };
}

function mergeMintBalance(
	map: Map<string, { balance: number; decimals: number }>,
	mintStr: string,
	balance: number,
	decimals: number,
): void {
	const prev = map.get(mintStr);
	if (prev) {
		map.set(mintStr, {
			balance: prev.balance + balance,
			decimals: prev.decimals || decimals,
		});
	} else {
		map.set(mintStr, { balance, decimals });
	}
}

/**
 * Reads Token-2022 balances for outcome mints the wallet has traded.
 *
 * Primary path: batched `getMultipleParsedAccounts` on Token-2022 ATAs (~1 RPC per 100 mints).
 * Fallback: `getParsedTokenAccountsByOwner` per mint when ATA is missing or unparsable (non-ATA custody).
 */
export async function fetchToken2022BalancesForMints(
	connection: Connection,
	owner: PublicKey,
	mints: string[],
	options?: {
		timeoutMsPerMint?: number;
		concurrency?: number;
		chunkSize?: number;
		chunkTimeoutMs?: number;
	},
): Promise<DflowSolanaToken[]> {
	const timeoutMsPerMint =
		options?.timeoutMsPerMint ?? DFLOW_PER_MINT_BALANCE_TIMEOUT_MS;
	const concurrency =
		options?.concurrency ?? DFLOW_OUTCOME_MINT_RPC_CONCURRENCY;
	const chunkTimeoutMs =
		options?.chunkTimeoutMs ?? DFLOW_MULTIREAD_CHUNK_TIMEOUT_MS;
	const chunkSize = options?.chunkSize ?? DFLOW_BALANCE_MULTIREAD_CHUNK;

	const unique = [...new Set(mints.map((m) => m.trim()).filter(Boolean))];
	const balanceByMint = new Map<string, { balance: number; decimals: number }>();

	type MintRow = { mintStr: string; mintPk: PublicKey };
	const rows: MintRow[] = [];
	for (const mintStr of unique) {
		try {
			rows.push({ mintStr, mintPk: new PublicKey(mintStr) });
		} catch {
			/* skip invalid mint */
		}
	}

	if (rows.length === 0) return [];

	const fallbackMints = new Set<string>();

	for (let i = 0; i < rows.length; i += chunkSize) {
		const chunk = rows.slice(i, i + chunkSize);
		const atas = chunk.map((r) =>
			getAssociatedTokenAddressSync(
				r.mintPk,
				owner,
				false,
				TOKEN_2022_PROGRAM_ID,
			),
		);
		try {
			const res = await Promise.race([
				connection.getMultipleParsedAccounts(atas),
				new Promise<never>((_, reject) => {
					setTimeout(() => {
						reject(new Error("DFlow Solana: getMultipleParsedAccounts chunk timeout"));
					}, chunkTimeoutMs);
				}),
			]);
			const accounts = res.value;
			for (let j = 0; j < chunk.length; j++) {
				const { mintStr } = chunk[j];
				const acc = accounts[j] ?? null;
				if (acc == null) {
					fallbackMints.add(mintStr);
					continue;
				}
				const pr = parsedToken2022AtaBalance(acc, mintStr);
				if (pr.kind === "fallback") {
					fallbackMints.add(mintStr);
				} else if (pr.kind === "positive") {
					mergeMintBalance(balanceByMint, mintStr, pr.balance, pr.decimals);
				}
			}
		} catch (err) {
			for (const { mintStr } of chunk) fallbackMints.add(mintStr);
			if (import.meta.env.DEV) {
				// eslint-disable-next-line no-console -- DFlow RPC diagnostic
				console.warn(
					"[DFlow] ATA batch Token-2022 read failed; per-mint fallback for chunk",
					err,
				);
			}
		}
	}

	async function readOneMintOwnerFilter(mintStr: string): Promise<void> {
		let mintPk: PublicKey;
		try {
			mintPk = new PublicKey(mintStr);
		} catch {
			return;
		}
		try {
			const resp = await Promise.race([
				connection.getParsedTokenAccountsByOwner(owner, {
					programId: TOKEN_2022_PROGRAM_ID,
					mint: mintPk,
				}),
				new Promise<never>((_, reject) => {
					setTimeout(() => {
						reject(
							new Error(
								`DFlow Solana: balance read for mint exceeded ${timeoutMsPerMint}ms`,
							),
						);
					}, timeoutMsPerMint);
				}),
			]);
			let sum = 0;
			let decimals = 0;
			for (const { account } of resp.value) {
				const info = account.data.parsed?.info as
					| { mint?: string; tokenAmount?: { uiAmount?: number | null; decimals?: number } }
					| undefined;
				if (!info) continue;
				if ((info.mint?.trim() ?? "") !== mintStr.trim()) continue;
				const uiAmount: number | null = info.tokenAmount?.uiAmount ?? null;
				if (uiAmount == null || !Number.isFinite(uiAmount) || uiAmount <= 0) continue;
				sum += uiAmount;
				decimals = info.tokenAmount?.decimals ?? decimals;
			}
			if (sum > 0) mergeMintBalance(balanceByMint, mintStr, sum, decimals);
		} catch (err) {
			if (import.meta.env.DEV) {
				// eslint-disable-next-line no-console -- DFlow RPC diagnostic
				console.warn(
					"[DFlow] Per-mint Token-2022 read failed or timed out; skipping mint",
					mintStr,
					err,
				);
			}
		}
	}

	const fallbackList = [...fallbackMints];
	const workers = Math.max(1, Math.min(concurrency, fallbackList.length || 1));
	for (let i = 0; i < fallbackList.length; i += workers) {
		const slice = fallbackList.slice(i, i + workers);
		await Promise.all(slice.map((m) => readOneMintOwnerFilter(m)));
	}

	const tokens: DflowSolanaToken[] = [];
	for (const [mintStr, { balance, decimals }] of balanceByMint) {
		if (balance > 0) tokens.push({ mint: mintStr, balance, decimals });
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

		const dflowEventTicker = dflowEventTickerFromBatchMarket(pos.market);

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
			...(dflowEventTicker ? { dflowEventTicker } : {}),
			marketStatus: pos.market.status?.toUpperCase(),
			outcomeResult: isFinalized ? (isWon ? "WON" : "LOST") : null,
			...(latestMs != null
				? { historyTradeAt: new Date(latestMs).toISOString() }
				: {}),
			...(fills != null && fills.length > 0 ? { historyFills: fills } : {}),
		};
	});
}
