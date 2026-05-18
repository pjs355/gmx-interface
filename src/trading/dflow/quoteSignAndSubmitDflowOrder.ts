import { VersionedTransaction } from "@solana/web3.js";
import type {
	DflowOrderParams,
	DflowOrderSubmitBody,
	DflowOrderSubmitResponse,
	DflowOrderResponse,
} from "@/services/privateApi/client";
import type { SolanaSignerCapable } from "@/trading/lifi/sendTransactionTypes";

export type DflowOrderSubmitFn = (
	body: DflowOrderSubmitBody,
) => Promise<DflowOrderSubmitResponse>;

/**
 * Shared Kalshi/DFlow path: GET `/api/dflow/order` → sign → POST submit URL.
 * `submitFn` is `privateApi.postDflowOrder` for SOR/trades or `privateApi.postClaimDflow` for claims.
 */
export async function quoteSignAndSubmitDflowOrder(args: {
	privateApi: {
		getDflowOrder: (p: DflowOrderParams) => Promise<DflowOrderResponse>;
	};
	submitFn: DflowOrderSubmitFn;
	solanaSigner: Pick<SolanaSignerCapable, "signTransactionOnly">;
	orderParams: DflowOrderParams;
	submitExtras: Omit<DflowOrderSubmitBody, "signedTx" | "lastValidBlockHeight">;
	/**
	 * When set (SOR execution path), refuse to call GET /order if the bound route
	 * has already expired — avoids signing a quote that no longer matches the HMAC route.
	 */
	routeTiming?: { routeId: string; expiresAtMs: number };
}): Promise<{
	signature: string;
	orderQuote: DflowOrderResponse;
	initializedMarket: boolean;
	orderStatus: DflowOrderSubmitResponse["orderStatus"];
}> {
	const { privateApi, submitFn, solanaSigner, orderParams, submitExtras } =
		args;

	if (args.routeTiming != null) {
		const { expiresAtMs, routeId } = args.routeTiming;
		if (typeof expiresAtMs === "number" && Number.isFinite(expiresAtMs)) {
			const skewMs = 500;
			if (Date.now() > expiresAtMs - skewMs) {
				throw new Error(
					`Trade route quote expired (route ${routeId}) — refresh the route and try again.`,
				);
			}
		}
	}

	const orderResult = await privateApi.getDflowOrder(orderParams);
	if (orderResult.code || orderResult.msg) {
		throw new Error(
			orderResult.msg ?? orderResult.code ?? "Kalshi order failed",
		);
	}
	if (!orderResult.transaction) {
		throw new Error("Kalshi returned no transaction to sign");
	}

	const lvbh = orderResult.lastValidBlockHeight;
	if (
		typeof lvbh !== "number" ||
		!Number.isFinite(lvbh) ||
		lvbh <= 0 ||
		!Number.isInteger(lvbh)
	) {
		throw new Error(
			"Kalshi quote missing lastValidBlockHeight — refresh the route and try again.",
		);
	}

	const txBytes = Buffer.from(orderResult.transaction, "base64");
	const transaction = VersionedTransaction.deserialize(txBytes);
	const signedBytes = await solanaSigner.signTransactionOnly(
		transaction.serialize(),
	);
	const signedBase64 =
		typeof Buffer !== "undefined"
			? Buffer.from(signedBytes).toString("base64")
			: btoa(
					Array.from(signedBytes)
						.map((b) => String.fromCharCode(b))
						.join(""),
				);

	const submitBody: DflowOrderSubmitBody = {
		signedTx: signedBase64,
		lastValidBlockHeight: lvbh,
		...submitExtras,
	};

	const submitResult = await submitFn(submitBody);
	return {
		signature: submitResult.signature,
		orderQuote: orderResult,
		initializedMarket: submitResult.initializedMarket === true,
		orderStatus: submitResult.orderStatus,
	};
}
