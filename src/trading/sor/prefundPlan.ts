import type { SorChain } from "./sor-types";
import type { FundingStableBalancesHuman } from "./fundingStableBalances";

/** Extra headroom on LI.FI `amountHuman` (must match `useSorLegExecutor`). */
export const LIFI_BRIDGE_AMOUNT_MARGIN = 0.01;

const ALL_SOURCE_CHAINS: SorChain[] = ["base", "polygon", "solana", "bnb"];

/** Skip dust legs that LI.FI often cannot route reliably. */
const MIN_PREFUND_CHUNK_USD = 0.02;

/** Treat cross-chain prefund as satisfied when shortfall is at or below this (fee / float slack). */
export const PREFUND_SHORTFALL_COVERED_EPS_USD = 0.015;

const CHAIN_LABEL: Record<SorChain, string> = {
	base: "Base",
	polygon: "Polygon",
	solana: "Solana",
	bnb: "BNB Chain",
};

/**
 * When `VITE_SOR_MULTISOURCE_PREFUND` is not `"false"`, allow sequential bridges
 * from multiple source chains to cover one prefund need.
 */
export function isMultisourcePrefundEnabled(): boolean {
	return (
		typeof import.meta !== "undefined" &&
		import.meta.env?.VITE_SOR_MULTISOURCE_PREFUND !== "false"
	);
}

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
): number {
	const need = Math.max(0, needUsdHuman);
	const onDest = Math.max(0, balances[toChain] ?? 0);
	return Math.max(0, need - Math.min(need, onDest));
}

export type PrefundStep = {
	fromChain: SorChain;
	/** Human stable amount for `postFundingLifiQuote.amountHuman` (6 dp). */
	amountHuman: string;
};

function chainStableLabel(c: SorChain): string {
	if (c === "bnb") return "USDT (BNB Chain)";
	return "USDC";
}

/** Human-readable per-chain balances for logs and error copy. */
export function formatPrefundBalanceBreakdown(
	balances: FundingStableBalancesHuman,
	toChain: SorChain,
): string {
	const b = (c: SorChain) => Math.max(0, balances[c] ?? 0);
	const parts = ALL_SOURCE_CHAINS.map((c) => {
		const tag =
			c === toChain ? " (venue — counts first toward prefund; reduces LI.FI pull)" : "";
		return `${CHAIN_LABEL[c]} $${b(c).toFixed(2)}${tag}`;
	});
	return parts.join(" | ");
}

/**
 * Builds ordered LI.FI prefund steps: primary SOR `fromChain` first, then other
 * chains (descending balance) when multisource is enabled.
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
	multisource: boolean,
	opts?: { fullPrefundNeedUsdHuman?: number },
): PrefundStep[] {
	const need = Math.max(0, needUsdHuman);
	const bal = (c: SorChain) => Math.max(0, balances[c] ?? 0);

	const totalExcludingDest = ALL_SOURCE_CHAINS.filter((c) => c !== toChain).reduce(
		(s, c) => s + bal(c),
		0,
	);

	if (!multisource) {
		const b = bal(primaryFrom);
		if (b + 1e-9 < need) {
			throw new Error(
				`Not enough ${chainStableLabel(primaryFrom)} on ${CHAIN_LABEL[primaryFrom]} for this prefund (~$${need.toFixed(2)} needed, ~$${b.toFixed(2)} on-chain). Add funds on ${CHAIN_LABEL[primaryFrom]} or set VITE_SOR_MULTISOURCE_PREFUND to allow routing remainder from other chains (~$${totalExcludingDest.toFixed(2)} total across sources). On-chain snapshot: ${formatPrefundBalanceBreakdown(balances, toChain)}.`,
			);
		}
		return [{ fromChain: primaryFrom, amountHuman: need.toFixed(6) }];
	}

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
			`Insufficient stablecoin on source wallets (excluding ${CHAIN_LABEL[toChain]}) to LI.FI prefund the remaining ~$${need.toFixed(2)} into ${CHAIN_LABEL[toChain]}.${venueNote} Allocated ~$${(need - remaining).toFixed(2)} from those chains (~$${totalExcludingDest.toFixed(2)} total there). On-chain snapshot: ${formatPrefundBalanceBreakdown(balances, toChain)}.`,
		);
	}

	if (steps.length === 0) {
		throw new Error(
			`No prefund steps generated for ~$${need.toFixed(2)} need — balances may be below the minimum bridge chunk ($${MIN_PREFUND_CHUNK_USD}). Snapshot: ${formatPrefundBalanceBreakdown(balances, toChain)}.`,
		);
	}

	return steps;
}
