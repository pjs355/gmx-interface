import type { SignedOrder, OrderStrategy } from "@predictdotfun/sdk";
import { SignatureType } from "@predictdotfun/sdk";
import { PrivateApiError } from "@/services/privateApi/errors";

/** Thrown when Predict REST returns an HTTP status (e.g. 401 JWT expired). */
export class PredictApiError extends Error {
	readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "PredictApiError";
		this.status = status;
	}
}

export function isPredictUnauthorizedError(e: unknown): boolean {
	if (e instanceof PredictApiError && e.status === 401) return true;
	if (e instanceof PrivateApiError && e.status === 401) return true;
	return false;
}

export type CreateOrderPayload = {
	data: {
		pricePerShare: string;
		strategy: OrderStrategy;
		slippageBps?: string;
		isFillOrKill?: boolean;
		order: Record<string, string | number>;
	};
};

function bigString(v: bigint | string | number): string {
	if (typeof v === "bigint") return v.toString();
	if (typeof v === "number") return Math.floor(v).toString();
	return String(v);
}

/** API expects numeric string fields and signatureType 0 (EOA). */
export function buildPredictCreateOrderPayload(
	signed: SignedOrder,
	hash: string,
	pricePerShare: bigint,
	strategy: OrderStrategy,
	opts?: { slippageBps?: bigint; isFillOrKill?: boolean }
): CreateOrderPayload {
	const order: Record<string, string | number> = {
		hash,
		salt: bigString(signed.salt),
		maker: signed.maker,
		signer: signed.signer,
		taker: signed.taker,
		tokenId: bigString(signed.tokenId),
		makerAmount: bigString(signed.makerAmount),
		takerAmount: bigString(signed.takerAmount),
		expiration: bigString(signed.expiration),
		nonce: bigString(signed.nonce),
		feeRateBps: bigString(signed.feeRateBps),
		side: typeof signed.side === "number" ? signed.side : Number(signed.side),
		signatureType: SignatureType.EOA,
		signature: signed.signature,
	};

	const data: CreateOrderPayload["data"] = {
		pricePerShare: pricePerShare.toString(),
		strategy,
		order,
	};
	if (opts?.slippageBps !== undefined) {
		data.slippageBps = opts.slippageBps.toString();
	}
	if (opts?.isFillOrKill !== undefined) {
		data.isFillOrKill = opts.isFillOrKill;
	}
	return { data };
}
