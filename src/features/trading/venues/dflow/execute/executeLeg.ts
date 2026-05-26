import { SOLANA_USDC_MINT } from "@/config/addresses";
import {
	formatErrorForUser,
	userMessage,
	SOR_KALSHI_MISSING_MINT,
	SOR_KALSHI_NO_LIMIT,
	SOR_SOLANA_SIGNER_UNAVAILABLE,
} from "@/errors";
import type {
	DflowOrderResponse,
	DflowOrderSubmitBody,
	DflowOrderSubmitResponse,
} from "@/services/privateApi/client";
import { sumDflowFillOutBaseUnitsForOutputMint } from "@/features/trading/sor/execute/helpers";
import type { SorLegResult } from "@/features/trading/sor/execute/types";
import type { VenueLegDispatchInput } from "@/features/trading/sor/execute/venueLegContext";
import { registerPendingDflowOutcomeMints } from "@/features/trading/venues/dflow/portfolio/pendingDflowOutcomeMints";
import { humanFromDflowBaseUnits } from "@/features/trading/venues/dflow/quote/dflowOutcomeAmount";
import { quoteSignAndSubmitDflowOrder } from "@/features/trading/venues/dflow/quote/quoteSignAndSubmitDflowOrder";

export async function executeLeg(input: VenueLegDispatchInput): Promise<SorLegResult> {
	const { leg, side, routeCtx, isLimit, deps } = input;

	const { privateApi, solanaSigner, umbrellaId, dflowProofVerified, ensureDflowProofVerified } =
		deps;

	if (isLimit) {
		return {
			filled: false,
			filledShares: 0,
			error: userMessage(SOR_KALSHI_NO_LIMIT),
		};
	}
	// KYC is the one SOR gate we keep on DFlow (regulatory). A
	// user can have KYC'd mid-session and still carry a stale
	// `dflowProofVerified=false` flag from page load, so
	// re-fetch on the click before bailing. When the refresh
	// still says unverified, throw a loud error so the trade
	// box can launch `startDflowProofRedirect` — no silent
	// rejections.
	let proofOk = dflowProofVerified;
	if (ensureDflowProofVerified) {
		try {
			proofOk = await ensureDflowProofVerified();
		} catch (e: unknown) {
			return {
				filled: false,
				filledShares: 0,
				error: formatErrorForUser(e),
			};
		}
	}
	if (!proofOk) {
		return {
			filled: false,
			filledShares: 0,
			error: "Kalshi KYC not verified. Complete verification on the Profile page.",
		};
	}
	const outcomeMint =
		leg.outcome === "A" ? leg.venueMarketIds.dflowYesMintA : leg.venueMarketIds.dflowYesMintB;
	if (!outcomeMint) {
		return {
			filled: false,
			filledShares: 0,
			error: userMessage(SOR_KALSHI_MISSING_MINT),
		};
	}

	const inputMint = side === "buy" ? SOLANA_USDC_MINT : outcomeMint;
	const outputMint = side === "buy" ? outcomeMint : SOLANA_USDC_MINT;
	const amountBaseUnits =
		side === "buy"
			? Math.round(leg.executionAmountUsd * 1_000_000).toString()
			: Math.round(leg.shares * 1_000_000).toString();

	if (!solanaSigner) {
		return {
			filled: false,
			filledShares: 0,
			error: userMessage(SOR_SOLANA_SIGNER_UNAVAILABLE),
		};
	}

	const ids = leg.venueMarketIds;
	const yesPairMint = leg.outcome === "A" ? ids.dflowYesMintA?.trim() : ids.dflowYesMintB?.trim();
	const noPairMint = leg.outcome === "A" ? ids.dflowNoMintA?.trim() : ids.dflowNoMintB?.trim();

	const submitExtras: Omit<DflowOrderSubmitBody, "signedTx" | "lastValidBlockHeight"> = {
		inputMint,
		outputMint,
		amount: amountBaseUnits,
		side: side === "buy" ? "BUY" : "SELL",
		outcome: leg.outcome === "A" ? "yes" : "no",
		umbrellaId: umbrellaId?.trim() || undefined,
		marketRef: {
			externalMarketId: outcomeMint,
			tokenId: outcomeMint,
		},
	};
	if (yesPairMint && noPairMint) {
		submitExtras.outcomePairMints = {
			yesMint: yesPairMint,
			noMint: noPairMint,
		};
	}

	let signature: string;
	let orderQuote: DflowOrderResponse | undefined;
	let dflowInitializedMarket = false;
	let submitOrderStatus: DflowOrderSubmitResponse["orderStatus"] | undefined;
	try {
		const r = await quoteSignAndSubmitDflowOrder({
			privateApi,
			submitFn: (body) => privateApi.postDflowOrder(body),
			solanaSigner,
			orderParams: {
				inputMint,
				outputMint,
				amount: amountBaseUnits,
				slippageBps: "auto",
				predictionMarketSlippageBps: "auto",
			},
			submitExtras,
			...(routeCtx != null
				? {
						routeTiming: {
							routeId: routeCtx.routeId,
							expiresAtMs: routeCtx.expiresAtMs,
						},
					}
				: {}),
		});
		signature = r.signature;
		orderQuote = r.orderQuote;
		dflowInitializedMarket = r.initializedMarket;
		submitOrderStatus = r.orderStatus;
	} catch (e: unknown) {
		return {
			filled: false,
			filledShares: 0,
			error: formatErrorForUser(e),
		};
	}

	if (side === "buy" && outputMint.trim()) {
		registerPendingDflowOutcomeMints([outputMint.trim()]);
	}

	let filledShares = leg.shares;
	const fills = submitOrderStatus?.fills;
	const outMint = outputMint.trim();
	if (fills?.length && outMint) {
		const sumBase = sumDflowFillOutBaseUnitsForOutputMint(fills, outMint);
		if (sumBase > 0n) {
			const fromFills = humanFromDflowBaseUnits(sumBase.toString());
			if (fromFills != null && fromFills > 0) {
				filledShares = fromFills;
			}
		}
	}
	if (filledShares === leg.shares && side === "buy" && orderQuote) {
		const fromOut = humanFromDflowBaseUnits(orderQuote.outAmount);
		if (fromOut != null && fromOut > 0) {
			filledShares = fromOut;
		}
	}

	const dflowPartialFill = submitOrderStatus?.partialFill === true;

	return {
		filled: true,
		filledShares,
		txHash: signature,
		initializedMarket: dflowInitializedMarket,
		...(dflowPartialFill ? { dflowPartialFill: true as const } : {}),
	};
}
