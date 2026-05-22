import type { SorChain } from "../core/sor-types";
import type { FundingStableBalancesHuman } from "./fundingStableBalances";
import { floorFloatToDecimalString } from "@/trading/lifi/prefundFromAmountHuman";

/**
 * Extra headroom on LI.FI `amountHuman`. Set to 0 because the optimizer's
 * per-leg `bridge.estimatedCost` already budgets the LI.FI fee, and
 * `ensurePrefundQuoteMeetsDestMin` iterates `sendHuman` upward against a strict
 * `budgetUsd` cap to absorb any quote-time variance. Adding margin here would
 * stack with that and push source-wallet debit past the user's typed amount.
 */
export const LIFI_BRIDGE_AMOUNT_MARGIN = 0;

/** Chains that {@link buildPrefundSteps} may pull LI.FI prefund from (excluding destination). */
export const ALL_SOURCE_CHAINS: SorChain[] = ["base", "polygon", "solana", "bnb"];

/** Skip dust legs that LI.FI often cannot route reliably. Exported for same-chain SCW→maker sweeps. */
export const MIN_PREFUND_CHUNK_USD = 0.02;

/** Treat cross-chain prefund as satisfied when shortfall is at or below this (fee / float slack). */
export const PREFUND_SHORTFALL_COVERED_EPS_USD = 0.015;

const CHAIN_LABEL: Record<SorChain, string> = {
	base: "Base",
	polygon: "Polygon",
	solana: "Solana",
	bnb: "BNB Chain",
};

/** Which Base wallet funds a prefund LI.FI leg (`fromAddress`). */
export type BaseSpendWallet = "smartWallet" | "limitlessMaker";

/**
 * Returns the prefund target (USD on destination wallet) for a bridge step.
 * With `LIFI_BRIDGE_AMOUNT_MARGIN = 0` this is identity — the per-leg budget
 * cap in `ensurePrefundQuoteMeetsDestMin` is the strict invariant; double-margining
 * here used to stack with the optimizer's `bridge_cost` and the LI.FI iteration
 * slack, which inflated source-wallet debit past `request.amount`.
 */
export function computePrefundNeedUsdHuman(
	bridgeAmountUsd: number,
	margin = LIFI_BRIDGE_AMOUNT_MARGIN,
): number {
	return bridgeAmountUsd * (1 + margin);
}

/**
 * SOR `leg.bridge.amount` is **optimizer shortfall** (USD still to move from source
 * chains onto the venue wallet). It can be **below** `executionAmountUsd` when the user
 * already holds stable on the destination — but venue settlement still needs the **full**
 * execution notional. Never anchor prefund on shortfall alone or we skip LI.FI and POST
 * `/orders` fails with insufficient collateral.
 *
 * The optimizer's `alloc.cost = notional + fee` is already encoded in `executionAmountUsd`,
 * so the anchor does **not** add fee on top. Fee headroom for venue API balance checks
 * (e.g. Polymarket CLOB requires `wallet >= makerAmount + protocolFee`) is satisfied at
 * the wire layer by sending a smaller `amount` (notional, fee from outcome tokens) — see
 * `wireAmountUsdForVenue` in `useSorLegExecutor`. Anchoring the bridge target on
 * `executionAmountUsd` keeps source-wallet debit within `request.amount`.
 */
export function resolveBuyPrefundAnchorUsd(
	routeBridgeUsd: number,
	executionAmountUsd: number,
	/** LevelUp: signed `makerAmount` USDC can exceed optimizer `alloc.cost`. */
	levelUpSignedPremiumUsd?: number,
): number {
	const r = Number.isFinite(routeBridgeUsd) ? Math.max(0, routeBridgeUsd) : 0;
	const e = Number.isFinite(executionAmountUsd) ? Math.max(0, executionAmountUsd) : 0;
	const base = Math.max(r, e);
	const lu =
		levelUpSignedPremiumUsd != null &&
		Number.isFinite(levelUpSignedPremiumUsd) &&
		levelUpSignedPremiumUsd > 0
			? levelUpSignedPremiumUsd
			: 0;
	return Math.max(base, lu);
}

/**
 * USD that must still arrive via LI.FI from non-venue chains after spending stable
 * already on the bridge destination (venue) wallet toward the same prefund target.
 */
export function computePrefundBridgeShortfallUsdHuman(
	needUsdHuman: number,
	toChain: SorChain,
	balances: FundingStableBalancesHuman,
	opts?: { limitlessBaseDest?: boolean },
): number {
	const need = Math.max(0, needUsdHuman);
	const onDest =
		opts?.limitlessBaseDest === true && toChain === "base"
			? Math.max(0, balances.limitlessMakerBase ?? 0)
			: Math.max(0, balances[toChain] ?? 0);
	return Math.max(0, need - Math.min(need, onDest));
}

export type PrefundStep = {
	fromChain: SorChain;
	/** Human stable amount for `postFundingLifiQuote.amountHuman` (floored; up to 18 dp on BNB USDT). */
	amountHuman: string;
	/**
	 * Base only: which wallet must be the LI.FI `fromAddress` for this leg.
	 * Omitted for non-Base chains; on Base without a maker balance behaves like `smartWallet`.
	 */
	baseSpendWallet?: BaseSpendWallet;
};

type MutableBasePool = { scw: number; maker: number };

function splitBasePrefundAmount(
	need: number,
	pool: MutableBasePool,
): PrefundStep[] {
	let n = Math.max(0, Math.min(need, pool.scw + pool.maker));
	const out: PrefundStep[] = [];

	while (n > PREFUND_SHORTFALL_COVERED_EPS_USD) {
		const chunkSw = Math.min(n, pool.scw);
		if (chunkSw >= MIN_PREFUND_CHUNK_USD) {
			out.push({
				fromChain: "base",
				amountHuman: floorFloatToDecimalString(chunkSw, 6),
				baseSpendWallet: "smartWallet",
			});
			pool.scw -= chunkSw;
			n -= chunkSw;
			continue;
		}
		const chunkMk = Math.min(n, pool.maker);
		if (chunkMk >= MIN_PREFUND_CHUNK_USD) {
			out.push({
				fromChain: "base",
				amountHuman: floorFloatToDecimalString(chunkMk, 6),
				baseSpendWallet: "limitlessMaker",
			});
			pool.maker -= chunkMk;
			n -= chunkMk;
			continue;
		}
		if (n >= MIN_PREFUND_CHUNK_USD - 1e-9 && pool.scw + pool.maker + 1e-9 >= n) {
			if (pool.scw + 1e-9 >= n) {
				out.push({
					fromChain: "base",
					amountHuman: floorFloatToDecimalString(n, 6),
					baseSpendWallet: "smartWallet",
				});
				pool.scw -= n;
				n = 0;
				break;
			}
			if (pool.maker + 1e-9 >= n) {
				out.push({
					fromChain: "base",
					amountHuman: floorFloatToDecimalString(n, 6),
					baseSpendWallet: "limitlessMaker",
				});
				pool.maker -= n;
				n = 0;
				break;
			}
		}
		break;
	}

	if (n > PREFUND_SHORTFALL_COVERED_EPS_USD) {
		throw new Error(
			`Cannot prefund ~$${n.toFixed(4)} from Base: each LI.FI leg needs at least ~$${MIN_PREFUND_CHUNK_USD} from a single wallet (SCW vs Limitless maker). Consolidate on one Base address or increase amount.`,
		);
	}

	return out;
}

/** Human-readable per-chain balances for logs and error copy. */
export function formatPrefundBalanceBreakdown(
	balances: FundingStableBalancesHuman,
	toChain: SorChain,
	opts?: { limitlessBaseDest?: boolean },
): string {
	const b = (c: SorChain) => Math.max(0, balances[c] ?? 0);
	const lxVenueOnBase = opts?.limitlessBaseDest === true && toChain === "base";
	const parts = ALL_SOURCE_CHAINS.map((c) => {
		if (lxVenueOnBase && c === "base") {
			return `${CHAIN_LABEL[c]} $${b(c).toFixed(2)} (smart wallet — for Limitless prefund, venue USDC is the Limitless maker row; SCW can same-chain sweep to maker; not a LI.FI source to maker)`;
		}
		const tag =
			c === toChain ? " (venue — counts first toward prefund; reduces LI.FI pull)" : "";
		if (c === "base" && !lxVenueOnBase) {
			const mk = Math.max(0, balances.limitlessMakerBase ?? 0);
			const pooled = b(c) + mk;
			return `${CHAIN_LABEL[c]} $${pooled.toFixed(2)} (SCW $${b(c).toFixed(2)} + Limitless maker $${mk.toFixed(2)} — each funds its own Base LI.FI leg)${tag}`;
		}
		return `${CHAIN_LABEL[c]} $${b(c).toFixed(2)}${tag}`;
	});
	const lx = Math.max(0, balances.limitlessMakerBase ?? 0);
	const lxNote = lxVenueOnBase ? " (Limitless maker — only this counts as venue USDC on Base)" : "";
	const lxPart =
		lx > 0 || opts?.limitlessBaseDest
			? ` | Limitless maker (Base) $${lx.toFixed(2)}${lxNote}`
			: "";
	return parts.join(" | ") + lxPart;
}

/**
 * Builds ordered LI.FI prefund steps: primary SOR `fromChain` first, then other
 * chains (descending balance) until `needUsdHuman` is covered.
 *
 * @param needUsdHuman Cross-chain shortfall only (total prefund target minus stable already on
 * `toChain`). Callers should use {@link computePrefundBridgeShortfallUsdHuman}.
 * @throws Error when aggregate balances cannot cover `needUsdHuman` (no silent under-fund).
 */
export function buildPrefundSteps(
	needUsdHuman: number,
	primaryFrom: SorChain,
	toChain: SorChain,
	balances: FundingStableBalancesHuman,
	opts?: {
		fullPrefundNeedUsdHuman?: number;
		limitlessBaseDest?: boolean;
		/** When set, only these chains may fund LI.FI prefund (excluding destination). Default: all sources. */
		allowedSourceChains?: readonly SorChain[];
	},
): PrefundStep[] {
	const need = Math.max(0, needUsdHuman);
	const lxDest = opts?.limitlessBaseDest === true && toChain === "base";

	const initialScw = lxDest ? 0 : Math.max(0, balances.base ?? 0);
	const initialMaker = lxDest ? 0 : Math.max(0, balances.limitlessMakerBase ?? 0);
	const pool: MutableBasePool = { scw: initialScw, maker: initialMaker };

	const chainBal = (c: SorChain) => {
		if (c === "base") {
			if (lxDest) return 0;
			return pool.scw + pool.maker;
		}
		return Math.max(0, balances[c] ?? 0);
	};

	const sortKey = (c: SorChain) =>
		c === "base" && !lxDest ? initialScw + initialMaker : Math.max(0, balances[c] ?? 0);

	const totalExcludingDest = ALL_SOURCE_CHAINS.filter((c) => c !== toChain).reduce(
		(s, c) => s + chainBal(c),
		0,
	);

	let remaining = need;
	const steps: PrefundStep[] = [];

	const pushFromChain = (c: SorChain, take: number) => {
		if (take <= 1e-9) return;
		if (c === "base" && !lxDest) {
			steps.push(...splitBasePrefundAmount(take, pool));
			return;
		}
		if (take >= MIN_PREFUND_CHUNK_USD) {
			steps.push({
				fromChain: c,
				amountHuman: floorFloatToDecimalString(take, 6),
			});
		}
	};

	const primaryTake = Math.min(remaining, chainBal(primaryFrom));
	pushFromChain(primaryFrom, primaryTake);
	remaining -= primaryTake;

	const sourceChains = opts?.allowedSourceChains ?? ALL_SOURCE_CHAINS;
	const others = sourceChains
		.filter((c) => c !== toChain && c !== primaryFrom)
		.sort((a, b) => sortKey(b) - sortKey(a));

	for (const c of others) {
		if (remaining <= 1e-6) break;
		const take = Math.min(remaining, chainBal(c));
		pushFromChain(c, take);
		remaining -= take;
	}

	if (remaining > PREFUND_SHORTFALL_COVERED_EPS_USD) {
		const full =
			opts?.fullPrefundNeedUsdHuman != null && Number.isFinite(opts.fullPrefundNeedUsdHuman)
				? Math.max(need, opts.fullPrefundNeedUsdHuman)
				: need;
		const venueApplied = Math.max(0, full - need);
		const venueNote =
			venueApplied > 1e-9
				? ` After applying ~$${venueApplied.toFixed(2)} already on ${CHAIN_LABEL[toChain]} toward the prefund target (~$${full.toFixed(2)}),`
				: "";
		throw new Error(
			`Insufficient stablecoin on source wallets (excluding ${CHAIN_LABEL[toChain]}) to LI.FI prefund the remaining ~$${need.toFixed(2)} into ${CHAIN_LABEL[toChain]}.${venueNote} Allocated ~$${(need - remaining).toFixed(2)} from those chains (~$${totalExcludingDest.toFixed(2)} total there). On-chain snapshot: ${formatPrefundBalanceBreakdown(balances, toChain, { limitlessBaseDest: opts?.limitlessBaseDest })}.`,
		);
	}

	if (steps.length === 0) {
		throw new Error(
			`No prefund steps generated for ~$${need.toFixed(2)} need — balances may be below the minimum bridge chunk ($${MIN_PREFUND_CHUNK_USD}). Snapshot: ${formatPrefundBalanceBreakdown(balances, toChain, { limitlessBaseDest: opts?.limitlessBaseDest })}.`,
		);
	}

	return steps;
}
