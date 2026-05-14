import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { VenueHistoryFill, VenuePosition } from "@/types/trading/venuePosition";
import {
	lookupUmbrellaByDflowEventTicker,
	portfolioColumnTeamLabels,
} from "@/trading/dflow/dflowUmbrellaLookup";
import type {
	DflowBatchMarket,
	DflowMarketAccountInfo,
	DflowOnchainTrade,
} from "@/services/privateApi";

/**
 * Same field precedence as predictions `eventTickerFromEsportsMarket` (nested `event_ticker`
 * before camelCase `eventTicker`) so History resolve keys match `exchangeMatching.dflow`.
 *
 * **Live Positions:** rows often carry this **and** `tokenId`. Umbrella matching must try
 * event ticker first then mint — see {@link matchVenuePositionToUmbrella} (`venue === "dflow"`).
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
 * DFlow positions transforms — maintainers
 * ---------------------------------------
 * Outcome balances are read via `POST /api/dflow/token-balances` (predictions API, private
 * `SOLANA_RPC_URL`) in `useDflowPositions`, not in the browser.
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

/** When Metadata sends exactly two account buckets labeled `A` / `B`, map mint → column. */
function bucketFromExplicitABAccountKeys(
	mint: string,
	accounts: Record<string, DflowMarketAccountInfo>,
): "Yes" | "No" | null {
	const ks = Object.keys(accounts);
	if (ks.length !== 2) return null;
	const up = ks.map((k) => k.toUpperCase());
	if (!up.includes("A") || !up.includes("B")) return null;
	const keyA = ks.find((k) => k.toUpperCase() === "A")!;
	const keyB = ks.find((k) => k.toUpperCase() === "B")!;
	const a = accounts[keyA]!;
	const b = accounts[keyB]!;
	/** A's YES = first column; A's NO = second (same as B winning). B's YES = second; B's NO = first. */
	if (mint === a.yesMint) return "Yes";
	if (mint === a.noMint) return "No";
	if (mint === b.yesMint) return "No";
	if (mint === b.noMint) return "Yes";
	return null;
}

/**
 * When Metadata sends exactly two account buckets (any key names), map lexicographic key order
 * → team slots (first → portfolio Yes, second → No). Within each slot: contract YES → that team,
 * contract NO → opposite team (Kalshi encodes both legs per row).
 */
function bucketFromTwoSortedAccountKeys(
	mint: string,
	accounts: Record<string, DflowMarketAccountInfo>,
): "Yes" | "No" | null {
	const ks = Object.keys(accounts).sort((a, b) =>
		a.localeCompare(b, undefined, { sensitivity: "base" }),
	);
	if (ks.length !== 2) return null;
	const ac0 = accounts[ks[0]!]!;
	const ac1 = accounts[ks[1]!]!;
	if (mint === ac0.yesMint) return "Yes";
	if (mint === ac0.noMint) return "No";
	if (mint === ac1.yesMint) return "No";
	if (mint === ac1.noMint) return "Yes";
	return null;
}

function dflowEventGroupKey(market: DflowBatchMarket): string {
	const et =
		dflowEventTickerFromBatchMarket(market) ?? market.eventTicker?.trim() ?? "";
	return et.toUpperCase();
}

/**
 * Kalshi / DFlow exposes **four** outcome SPLs per head‑to‑head event (YES/NO × each team leg).
 * Economically they collapse to **two** portfolio buckets (same payoff as holding the paired mint):
 *
 * - **YES team A + NO team B** → one bucket (“A wins” — LevelUp portfolio **Yes** for the first ticker leg)
 * - **NO team A + YES team B** → the other bucket (“B wins” — portfolio **No** for the second ticker leg)
 *
 * `assignTeamLegMintsToPortfolioColumns` maps each leg’s YES mint to that leg’s column and each leg’s
 * NO mint to the **opposite** column so the pairs above always land together.
 *
 * Group `markets/batch` by `eventTicker`; when exactly **two** rows share an event, sort by `ticker`
 * and treat the first row as the first leg and the second as the second leg.
 */
function buildDflowMintToPortfolioColumnMap(
	markets: DflowBatchMarket[],
): Map<string, "Yes" | "No"> {
	const byEvent = new Map<string, DflowBatchMarket[]>();
	for (const m of markets) {
		const k = dflowEventGroupKey(m);
		if (!k) continue;
		const arr = byEvent.get(k) ?? [];
		arr.push(m);
		byEvent.set(k, arr);
	}
	const out = new Map<string, "Yes" | "No">();
	for (const rows of byEvent.values()) {
		if (rows.length !== 2) continue;
		const sorted = [...rows].sort((a, b) =>
			(a.ticker ?? "").localeCompare(b.ticker ?? "", undefined, {
				sensitivity: "base",
			}),
		);
		const first = sorted[0]!;
		const second = sorted[1]!;
		assignTeamLegMintsToPortfolioColumns(out, first.accounts, "Yes");
		assignTeamLegMintsToPortfolioColumns(out, second.accounts, "No");
	}
	return out;
}

/**
 * Map one Kalshi leg’s YES/NO mints into portfolio columns so **YES leg A + NO leg B** share a column
 * and **NO leg A + YES leg B** share the other (see {@link buildDflowMintToPortfolioColumnMap}).
 */
function assignTeamLegMintsToPortfolioColumns(
	out: Map<string, "Yes" | "No">,
	accounts: Record<string, DflowMarketAccountInfo>,
	teamPortfolioColumn: "Yes" | "No",
): void {
	const opposite = teamPortfolioColumn === "Yes" ? "No" : "Yes";
	for (const ac of Object.values(accounts)) {
		const ym = typeof ac.yesMint === "string" ? ac.yesMint.trim() : "";
		const nm = typeof ac.noMint === "string" ? ac.noMint.trim() : "";
		if (ym) out.set(ym, teamPortfolioColumn);
		if (nm) out.set(nm, opposite);
	}
}

function dflowPortfolioColumnForPosition(
	pos: DflowMarketPosition,
	columnMap: Map<string, "Yes" | "No">,
): "Yes" | "No" {
	const mint = pos.mint.trim();

	const fromPair = columnMap.get(mint);
	if (fromPair) return fromPair;

	const ab = bucketFromExplicitABAccountKeys(mint, pos.market.accounts);
	if (ab) return ab;

	const slot = bucketFromTwoSortedAccountKeys(mint, pos.market.accounts);
	if (slot) return slot;

	return pos.side === "yes" ? "Yes" : "No";
}

/**
 * After {@link toVenuePositions}, align `outcome` with the umbrella’s
 * {@link buildDflowPortfolioColumnMapFromCatalog} (`exchangeMatching.dflow` mint → portfolio Yes/No)
 * and set {@link VenuePosition.dflowTradeSideLabel} from {@link portfolioColumnTeamLabels} only.
 * No second remap from Metadata `markets/batch` ticker order — the umbrella is the source of truth.
 */
export function patchDflowVenuePositionOutcomes(
	rows: VenuePosition[],
	catalogColumnMap: Map<string, "Yes" | "No">,
	options?: {
		/** Same index as {@link buildUmbrellaLookupByDflowOutcomeMint} — aligns Side labels with umbrella team order. */
		outcomeMintToUmbrella?: Map<string, Umbrella> | null;
		/** When a mint is not yet on `exchangeMatching.dflow`, match {@link VenuePosition.dflowEventTicker} to the catalog umbrella. */
		eventTickerLookup?: Map<string, Umbrella> | null;
		umbrellasForEventLookup?: Umbrella[] | null;
	},
): VenuePosition[] {
	if (!rows.length) return rows;

	const mintUmb = options?.outcomeMintToUmbrella;
	const etMap = options?.eventTickerLookup;
	const umbrellasEt = options?.umbrellasForEventLookup;

	const next = rows.map((row) => {
		if (row.venue !== "dflow") return row;

		const tid = typeof row.tokenId === "string" ? row.tokenId.trim() : "";
		let outcome = row.outcome;
		if (catalogColumnMap.size > 0 && tid) {
			const col = catalogColumnMap.get(tid);
			if (col) outcome = col;
		}

		const bucket: "Yes" | "No" =
			outcome.trim().toLowerCase() === "no" ? "No" : "Yes";
		let umb: Umbrella | undefined =
			tid && mintUmb ? mintUmb.get(tid) : undefined;
		if (!umb && row.dflowEventTicker?.trim() && etMap && umbrellasEt?.length) {
			umb =
				lookupUmbrellaByDflowEventTicker(
					row.dflowEventTicker.trim(),
					etMap,
					umbrellasEt,
				) ?? undefined;
		}
		const colLabels = portfolioColumnTeamLabels(umb);
		const dflowTradeSideLabel =
			bucket === "Yes" ? colLabels.columnYes : colLabels.columnNo;

		if (
			outcome === row.outcome &&
			dflowTradeSideLabel === row.dflowTradeSideLabel
		) {
			return row;
		}

		return { ...row, outcome, dflowTradeSideLabel };
	});

	return next;
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

/**
 * When {@link matchTokensToMarkets} returns nothing for a wallet token (batch/metadata edge
 * cases) but Solana balance is positive, recover a row by locating the mint on any returned
 * market — same resolution as {@link buildGhostDflowMarketPositions}, but preserving balances.
 */
export function marketPositionsForUnmatchedTokens(
	tokens: DflowSolanaToken[],
	matchedMints: ReadonlySet<string>,
	markets: DflowBatchMarket[],
): DflowMarketPosition[] {
	const out: DflowMarketPosition[] = [];
	for (const token of tokens) {
		if (!(token.balance > 0)) continue;
		if (matchedMints.has(token.mint)) continue;
		for (const market of markets) {
			const side = resolveSide(token.mint, market.accounts);
			if (!side) continue;
			out.push({ ...token, side, market });
			break;
		}
	}
	return out;
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
					marketTicker: t.marketTicker?.trim() || undefined,
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
					marketTicker: t.marketTicker?.trim() || undefined,
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
/**
 * DFlow Metadata lifecycle: outcome is known in `determined` and `finalized` (see pond.dflow.net
 * prediction-market-lifecycle). Treat both as settled for win/loss — strict `finalized` only
 * missed redeemable `determined` rows; case-sensitive compare missed `FINALIZED` payloads.
 */
function dflowMarketSettlementKnown(status: string | undefined): boolean {
	const s = (status ?? "").trim().toLowerCase();
	return s === "finalized" || s === "determined";
}

/**
 * Which **contract** leg (yes/no mint family) pays $1. Metadata `result` is usually `yes`/`no`
 * but may match `yesSubTitle` / `noSubTitle` text instead (Kalshi proposition markets).
 */
function dflowWinningContractSide(m: DflowBatchMarket): "yes" | "no" | null {
	const raw = m.result;
	if (raw == null) return null;
	const r = String(raw).trim().toLowerCase();
	if (r === "yes" || r === "y") return "yes";
	if (r === "no" || r === "n") return "no";

	const yesLab = (m.yesSubTitle ?? "").trim().toLowerCase();
	const noLab = (m.noSubTitle ?? "").trim().toLowerCase();
	if (yesLab && r === yesLab) return "yes";
	if (noLab && r === noLab) return "no";

	return null;
}

export function toVenuePositions(
	positions: DflowMarketPosition[],
	costMap: Map<string, CostEntry>,
	fillsByMint?: Map<string, VenueHistoryFill[]>,
	markets?: DflowBatchMarket[],
): VenuePosition[] {
	const columnMap = buildDflowMintToPortfolioColumnMap(markets ?? []);
	return positions.map((pos) => {
		const settlementKnown = dflowMarketSettlementKnown(pos.market.status);
		const winnerContract = dflowWinningContractSide(pos.market);
		const isWon =
			settlementKnown && winnerContract !== null && winnerContract === pos.side;

		const cost = costMap.get(pos.mint);
		const avgPrice = cost?.avgPrice ?? null;

		let currentPrice: number | null;
		let currentValue: number;

		if (settlementKnown && winnerContract !== null) {
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
			outcome: dflowPortfolioColumnForPosition(pos, columnMap),
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
			outcomeResult:
				settlementKnown && winnerContract !== null
					? isWon
						? "WON"
						: "LOST"
					: null,
			...(pos.market.yesSubTitle?.trim()
				? { dflowYesSubTitle: pos.market.yesSubTitle.trim() }
				: {}),
			...(pos.market.noSubTitle?.trim()
				? { dflowNoSubTitle: pos.market.noSubTitle.trim() }
				: {}),
			...(latestMs != null
				? { historyTradeAt: new Date(latestMs).toISOString() }
				: {}),
			...(fills != null && fills.length > 0 ? { historyFills: fills } : {}),
		};
	});
}
