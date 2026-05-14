import {
	OrderBuilder,
	OrderSigner,
	Side,
} from "@limitless-exchange/sdk";
import { ethers } from "ethers";
import type { LimitlessSignedOrderSubmit } from "./limitlessPrivateApiTypes";

export function readLimitlessVenueExchangeFromMarketJson(raw: unknown): string {
	const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
	const venue = o.venue;
	if (!venue || typeof venue !== "object") {
		throw new Error("Limitless market payload missing `venue`.");
	}
	const ex = (venue as Record<string, unknown>).exchange;
	if (typeof ex !== "string" || !ex.trim()) {
		throw new Error("Limitless market payload missing `venue.exchange`.");
	}
	return ex.trim();
}

export type BuildLimitlessSorOrderInput =
	| {
			kind: "gtc";
			slug: string;
			ownerId: number;
			maker: string;
			feeRateBps: number;
			tokenId: string;
			side: "buy" | "sell";
			price: number;
			size: number;
			postOnly?: boolean;
	  }
	| {
			kind: "fok_buy";
			slug: string;
			ownerId: number;
			maker: string;
			feeRateBps: number;
			tokenId: string;
			makerAmount: number;
	  }
	| {
			kind: "fok_sell";
			slug: string;
			ownerId: number;
			maker: string;
			feeRateBps: number;
			tokenId: string;
			makerAmount: number;
	  };

export async function buildLimitlessSignedOrderFromMarket(
	privateApi: { getLimitlessMarketBySlug: (slug: string) => Promise<unknown> },
	signer: ethers.Signer,
	input: BuildLimitlessSorOrderInput,
): Promise<LimitlessSignedOrderSubmit> {
	const raw = await privateApi.getLimitlessMarketBySlug(input.slug);
	const exchange = readLimitlessVenueExchangeFromMarketJson(raw);
	if (input.kind === "gtc") {
		return buildSignedLimitlessOrderSubmit({
			maker: input.maker,
			ownerId: input.ownerId,
			marketSlug: input.slug,
			exchange,
			feeRateBps: input.feeRateBps,
			signer,
			spec: {
				orderType: "GTC",
				tokenId: input.tokenId,
				side: input.side === "buy" ? "BUY" : "SELL",
				price: input.price,
				size: input.size,
				postOnly: input.postOnly,
			},
		});
	}
	if (input.kind === "fok_buy") {
		return buildSignedLimitlessOrderSubmit({
			maker: input.maker,
			ownerId: input.ownerId,
			marketSlug: input.slug,
			exchange,
			feeRateBps: input.feeRateBps,
			signer,
			spec: {
				orderType: "FOK",
				tokenId: input.tokenId,
				side: "BUY",
				makerAmount: input.makerAmount,
			},
		});
	}
	return buildSignedLimitlessOrderSubmit({
		maker: input.maker,
		ownerId: input.ownerId,
		marketSlug: input.slug,
		exchange,
		feeRateBps: input.feeRateBps,
		signer,
		spec: {
			orderType: "FOK",
			tokenId: input.tokenId,
			side: "SELL",
			makerAmount: input.makerAmount,
		},
	});
}

export type LimitlessSorSignedOrderSpec =
	| {
			orderType: "GTC";
			tokenId: string;
			side: "BUY" | "SELL";
			price: number;
			size: number;
			postOnly?: boolean;
	  }
	| {
			orderType: "FOK";
			tokenId: string;
			side: "BUY" | "SELL";
			makerAmount: number;
	  };

/**
 * EIP-712 sign via `@limitless-exchange/sdk` (maker === signer, `signatureType` EOA).
 * `exchange` must be `venue.exchange` from `GET /markets/:slug`.
 */
export async function buildSignedLimitlessOrderSubmit(input: {
	maker: string;
	ownerId: number;
	marketSlug: string;
	exchange: string;
	feeRateBps: number;
	signer: ethers.Signer;
	spec: LimitlessSorSignedOrderSpec;
}): Promise<LimitlessSignedOrderSubmit> {
	const m = ethers.getAddress(input.maker.trim());
	const signerAddr = ethers.getAddress(await input.signer.getAddress());
	if (signerAddr.toLowerCase() !== m.toLowerCase()) {
		throw new Error(
			"Signer address does not match Limitless maker — use the wallet linked as your Limitless trading address.",
		);
	}
	const builder = new OrderBuilder(m, input.feeRateBps);
	const side = input.spec.side === "BUY" ? Side.BUY : Side.SELL;
	let unsigned;
	if (input.spec.orderType === "FOK") {
		unsigned = builder.buildOrder({
			tokenId: input.spec.tokenId,
			side,
			makerAmount: input.spec.makerAmount,
		});
	} else {
		unsigned = builder.buildOrder({
			tokenId: input.spec.tokenId,
			side,
			price: input.spec.price,
			size: input.spec.size,
			postOnly: input.spec.postOnly,
		});
	}
	const orderSigner = new OrderSigner(input.signer as never);
	const sig = await orderSigner.signOrder(unsigned, {
		chainId: 8453,
		contractAddress: ethers.getAddress(input.exchange.trim()),
	});
	const signedOrder = { ...unsigned, signature: sig };
	return {
		order: signedOrder as LimitlessSignedOrderSubmit["order"],
		orderType: input.spec.orderType,
		marketSlug: input.marketSlug.trim(),
		ownerId: input.ownerId,
		...(input.spec.orderType === "GTC" && input.spec.postOnly !== undefined
			? { postOnly: input.spec.postOnly }
			: {}),
	};
}
