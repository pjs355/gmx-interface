import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import type { VenuePosition } from "@/types/trading/venuePosition";
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

type CostEntry = { avgPrice: number; totalCost: number; totalShares: number };

/**
 * Builds a cost-basis map keyed by `outputMint` from on-chain trade history.
 * Aggregates `usdPricePerContract` * `contracts` for cost, and weighted-average
 * for avgPrice.
 */
export function buildCostMap(
	trades: DflowOnchainTrade[]
): Map<string, CostEntry> {
	const buckets = new Map<
		string,
		{ totalCost: number; totalShares: number }
	>();

	for (const t of trades) {
		if (!t.outputMint) continue;
		const shares = t.contracts ?? t.outputAmount ?? 0;
		const cost =
			t.usdPricePerContract != null ? t.usdPricePerContract * shares : 0;

		const bucket = buckets.get(t.outputMint) ?? {
			totalCost: 0,
			totalShares: 0,
		};
		bucket.totalCost += cost;
		bucket.totalShares += shares;
		buckets.set(t.outputMint, bucket);
	}

	const result = new Map<string, CostEntry>();
	for (const [mint, { totalCost, totalShares }] of buckets) {
		result.set(mint, {
			avgPrice: totalShares > 0 ? totalCost / totalShares : 0,
			totalCost,
			totalShares,
		});
	}
	return result;
}

/**
 * Converts matched positions + cost basis into the normalised `VenuePosition[]`
 * used by the Positions page and PortfolioContext.
 */
export function toVenuePositions(
	positions: DflowMarketPosition[],
	costMap: Map<string, CostEntry>
): VenuePosition[] {
	return positions.map((pos) => {
		const isFinalized = pos.market.status === "finalized";
		const isWon = isFinalized && pos.market.result?.toLowerCase() === pos.side;
		const isLost = isFinalized && !isWon;

		let currentPrice: number | null;
		let currentValue: number;

		if (isFinalized) {
			currentPrice = isWon ? 1 : 0;
			currentValue = isWon ? pos.balance : 0;
		} else {
			const priceStr =
				pos.side === "yes" ? pos.market.yesAsk : pos.market.noAsk;
			currentPrice = priceStr != null ? Number(priceStr) : null;
			currentValue = currentPrice != null ? pos.balance * currentPrice : 0;
		}

		const cost = costMap.get(pos.mint);
		const avgPrice = cost?.avgPrice ?? null;
		const totalCost = cost?.totalCost ?? null;
		const pnl = totalCost != null ? currentValue - totalCost : null;
		const pnlPercent =
			pnl != null && totalCost != null && totalCost > 0
				? (pnl / totalCost) * 100
				: null;

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
		};
	});
}
