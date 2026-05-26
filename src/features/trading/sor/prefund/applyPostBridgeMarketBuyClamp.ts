import { formatErrorForUser } from "@/errors";
import type { RouteLeg, SorVenue } from "@/features/trading/sor/core/sor-types";
import { wireAmountUsdForVenue } from "@/features/trading/sor/core/wireAmount";
import { clampMarketBuyAmountToWallet } from "@/features/trading/sor/prefund/postBridgeOrderResize";

export type ResolvePostBridgeMarketBuyWireArgs = {
	leg: Pick<RouteLeg, "venue" | "executionAmountUsd" | "fee">;
	venue: SorVenue;
	readWalletUsd: () => Promise<number>;
	minOrderUsd?: number;
	/** Field name in `[SOR][wire]` debug payload for the wallet balance read. */
	walletBalanceLogKey?: string;
};

export type ResolvePostBridgeMarketBuyWireResult =
	| {
			ok: true;
			amountUsd: number;
			scale: number;
			resized: boolean;
			plannedWireUsd: number;
	  }
	| {
			ok: false;
			error: string;
	  };

/**
 * Post-bridge market BUY wire sizing for token-side-fee venues (Polymarket,
 * Predict.fun, Limitless): read dest-wallet stable balance, clamp planned wire
 * via {@link clampMarketBuyAmountToWallet}, log, return resized wire + scale.
 */
export async function resolvePostBridgeMarketBuyWire(
	args: ResolvePostBridgeMarketBuyWireArgs,
): Promise<ResolvePostBridgeMarketBuyWireResult> {
	const plannedWireUsd = wireAmountUsdForVenue(args.leg);
	const minOrderUsd = args.minOrderUsd ?? 1;

	let walletUsd: number;
	try {
		walletUsd = await args.readWalletUsd();
	} catch (e: unknown) {
		console.error("error", e);
		return { ok: false, error: formatErrorForUser(e) };
	}

	const clamp = clampMarketBuyAmountToWallet({
		plannedExecutionUsd: plannedWireUsd,
		walletUsd,
		feeEstimateUsd: args.leg.fee,
		minOrderUsd,
	});

	if (!clamp.ok) {
		return { ok: false, error: clamp.error };
	}

	const walletKey = args.walletBalanceLogKey ?? "walletUsd";
	console.debug(`[SOR][wire] ${args.venue}`, {
		venue: args.venue,
		executionAmountUsd: Number(args.leg.executionAmountUsd.toFixed(6)),
		feeUsd: Number(args.leg.fee.toFixed(6)),
		plannedWireUsd: Number(plannedWireUsd.toFixed(6)),
		[walletKey]: Number(walletUsd.toFixed(6)),
		finalWireUsd: Number(clamp.amountUsd.toFixed(6)),
		scale: Number(clamp.scale.toFixed(6)),
		resized: clamp.resized,
	});

	return {
		ok: true,
		amountUsd: clamp.amountUsd,
		scale: clamp.scale,
		resized: clamp.resized,
		plannedWireUsd,
	};
}
