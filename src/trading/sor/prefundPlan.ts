import type { SorChain } from "./sor-types";
import type { FundingStableBalancesHuman } from "./fundingStableBalances";

/** Extra headroom on LI.FI `amountHuman` (must match `useSorLegExecutor`). */
export const LIFI_BRIDGE_AMOUNT_MARGIN = 0.01;

const ALL_SOURCE_CHAINS: SorChain[] = ["base", "polygon", "solana", "bnb"];

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

export function computePrefundNeedUsdHuman(
	bridgeAmountUsd: number,
	margin = LIFI_BRIDGE_AMOUNT_MARGIN,
): number {
	return bridgeAmountUsd * (1 + margin) + 0.01;
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
	/** Human stable amount for `postFundingLifiQuote.amountHuman` (6 dp). */
	amountHuman: string;
};

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
			return `${CHAIN_LABEL[c]} $${b(c).toFixed(2)} (smart wallet — for Limitless prefund, venue USDC is the maker row below; SCW can same-chain sweep to maker; not a LI.FI source to maker)`;
		}
		const tag =
			c === toChain ? " (venue — counts first toward prefund; reduces LI.FI pull)" : "";
		if (c === "base" && !lxVenueOnBase) {
			const mk = Math.max(0, balances.limitlessMakerBase ?? 0);
			const pooled = b(c) + mk;
			return `${CHAIN_LABEL[c]} $${pooled.toFixed(2)} (SCW $${b(c).toFixed(2)} + Limitless maker $${mk.toFixed(2)} — maker consolidates to SCW via partner withdraw before Base LI.FI)${tag}`;
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
	opts?: { fullPrefundNeedUsdHuman?: number; limitlessBaseDest?: boolean },
): PrefundStep[] {
	const need = Math.max(0, needUsdHuman);
	const lxDest = opts?.limitlessBaseDest === true && toChain === "base";
	/**
	 * Spendable stable for LI.FI **sources** by SOR chain.
	 * - Limitless-on-Base **destination**: Base SCW is not a LI.FI source to the maker; venue is
	 *   `limitlessMakerBase` only (SCW→maker same-chain sweep is handled in the executor).
	 * - Any other destination: Base capacity is **SCW + Limitless maker**; executor consolidates
	 *   maker→SCW via partner withdraw before quoting Base LI.FI from the smart wallet.
	 */
	const bal = (c: SorChain) => {
		if (c === "base") {
			if (lxDest) return 0;
			return (
				Math.max(0, balances.base ?? 0) +
				Math.max(0, balances.limitlessMakerBase ?? 0)
			);
		}
		return Math.max(0, balances[c] ?? 0);
	};

	const totalExcludingDest = ALL_SOURCE_CHAINS.filter((c) => c !== toChain).reduce(
		(s, c) => s + bal(c),
		0,
	);

	let remaining = need;
	const steps: PrefundStep[] = [];

	const primaryTake = Math.min(remaining, bal(primaryFrom));
	if (primaryTake >= MIN_PREFUND_CHUNK_USD) {
		steps.push({ fromChain: primaryFrom, amountHuman: primaryTake.toFixed(6) });
		remaining -= primaryTake;
	}

	const others = ALL_SOURCE_CHAINS.filter((c) => c !== toChain && c !== primaryFrom).sort(
		(a, b) => bal(b) - bal(a),
	);

	for (const c of others) {
		if (remaining <= 1e-6) break;
		const take = Math.min(remaining, bal(c));
		if (take >= MIN_PREFUND_CHUNK_USD) {
			steps.push({ fromChain: c, amountHuman: take.toFixed(6) });
			remaining -= take;
		}
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
