import { ethers } from "ethers";
import { getUSDCAddress } from "@/config/addresses";

const GET_CTF_ABI = ["function getCtf() view returns (address)"] as const;

const CTF_REDEEM_ABI = [
	"function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)",
] as const;

/**
 * Polymarket-style NegRisk adapter entrypoint used by several Base deployments.
 * If Limitless changes the adapter ABI, on-chain NegRisk redeem will revert with
 * a clear contract error — there is no supported HTTP redeem for EOA custody.
 */
const NEG_RISK_ADAPTER_REDEEM_ABI = [
	"function redeemPositions(bytes32 conditionId, uint256[] amounts)",
] as const;

const ERC1155_BALANCE_ABI = [
	"function balanceOf(address account, uint256 id) view returns (uint256)",
] as const;

export type LimitlessMarketVenueWire = {
	exchange?: string;
	adapter?: string | null;
	collateral?: string;
};

/** Read `venue` + collateral from `GET /api/limitless/markets/:slug` JSON. */
export function readLimitlessMarketVenueWire(raw: unknown): LimitlessMarketVenueWire {
	const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
	const venue = o.venue;
	const out: LimitlessMarketVenueWire = {};
	if (venue && typeof venue === "object") {
		const v = venue as Record<string, unknown>;
		const ex = v.exchange;
		if (typeof ex === "string" && ex.trim() && ethers.isAddress(ex.trim())) {
			out.exchange = ethers.getAddress(ex.trim());
		}
		const ad = v.adapter;
		if (typeof ad === "string" && ad.trim() && ethers.isAddress(ad.trim())) {
			out.adapter = ethers.getAddress(ad.trim());
		} else if (ad === null || ad === undefined || ad === "") {
			out.adapter = null;
		}
	}
	const collateralCandidates: unknown[] = [
		o.collateralToken,
		o.collateral_address,
		o.collateralAddress,
		o.collateral_token,
	];
	const tokens = o.tokens;
	if (tokens && typeof tokens === "object") {
		const trec = tokens as Record<string, unknown>;
		collateralCandidates.push(trec.collateral, trec.collateralToken);
	}
	for (const c of collateralCandidates) {
		if (typeof c === "string" && c.trim() && ethers.isAddress(c.trim())) {
			out.collateral = ethers.getAddress(c.trim());
			break;
		}
	}
	return out;
}

/**
 * Single Base transaction: redeem Limitless winning outcome tokens held by the
 * maker EOA — CTF `redeemPositions` for standard legs, or NegRisk adapter when an
 * adapter address is present alongside `isNegRisk`.
 */
export async function redeemLimitlessWinningPositionOnBase(args: {
	signer: ethers.Signer;
	conditionId: `0x${string}`;
	resolvedOutcome: "yes" | "no";
	isNegRisk: boolean;
	/** Outcome ERC1155 id from portfolio / Winnings (`_limitlessOutcomeTokenId`). */
	outcomeTokenId: string;
	/** From predictions `positions-venue` when present. */
	limitlessVenueExchange?: string;
	limitlessVenueAdapter?: string;
	limitlessCollateralAddress?: string;
	/** When venue hints are incomplete, load public market JSON by slug. */
	marketSlug?: string;
	fetchMarketBySlug: (slug: string) => Promise<unknown>;
}): Promise<string> {
	const slug = args.marketSlug?.trim();
	let exchange = args.limitlessVenueExchange?.trim();
	let adapter = args.limitlessVenueAdapter?.trim();
	let collateral = args.limitlessCollateralAddress?.trim();

	if ((!exchange || !collateral) && slug) {
		const raw = await args.fetchMarketBySlug(slug);
		const w = readLimitlessMarketVenueWire(raw);
		exchange = exchange || w.exchange;
		if (!adapter && w.adapter) adapter = w.adapter;
		collateral = collateral || w.collateral;
	}

	if (!exchange || !ethers.isAddress(exchange)) {
		throw new Error(
			"Limitless redeem needs venue.exchange (CTF exchange contract). Refresh Winnings or open this market once so venue metadata is available.",
		);
	}
	if (!collateral || !ethers.isAddress(collateral)) {
		collateral = getUSDCAddress();
	}

	const provider = args.signer.provider;
	if (!provider) {
		throw new Error("Wallet has no RPC provider — cannot read Limitless CTF address.");
	}

	const exchangeRO = new ethers.Contract(exchange, GET_CTF_ABI, provider);
	const ctfAddr = (await exchangeRO.getCtf()) as string;
	const ctf = ethers.getAddress(String(ctfAddr));

	const maker = await args.signer.getAddress();
	const tokenId = args.outcomeTokenId.trim();
	if (!/^\d+$/.test(tokenId)) {
		throw new Error("Invalid Limitless outcome token id for redeem.");
	}

	const erc1155 = new ethers.Contract(ctf, ERC1155_BALANCE_ABI, provider);
	const bal = (await erc1155.balanceOf(maker, tokenId)) as bigint;
	if (bal <= 0n) {
		throw new Error(
			"No redeemable Limitless outcome balance at your maker address yet — the market may show resolved before CTF payout is posted on Base. Retry later or redeem on https://limitless.exchange .",
		);
	}

	if (args.isNegRisk && adapter && ethers.isAddress(adapter)) {
		const adapterRO = ethers.getAddress(adapter);
		const amounts: bigint[] =
			args.resolvedOutcome === "yes" ? [bal, 0n] : [0n, bal];
		const nrIface = new ethers.Interface(NEG_RISK_ADAPTER_REDEEM_ABI);
		const data = nrIface.encodeFunctionData("redeemPositions", [
			args.conditionId,
			amounts,
		]);
		const tx = await args.signer.sendTransaction({
			to: adapterRO,
			data,
			value: 0,
		});
		const waited = await tx.wait();
		return waited?.hash ?? tx.hash;
	}

	const indexSet = args.resolvedOutcome === "yes" ? 1 : 2;
	const ctfIface = new ethers.Interface(CTF_REDEEM_ABI);
	const data = ctfIface.encodeFunctionData("redeemPositions", [
		collateral,
		ethers.ZeroHash,
		args.conditionId,
		[indexSet],
	]);
	const tx = await args.signer.sendTransaction({
		to: ctf,
		data,
		value: 0,
	});
	const waited = await tx.wait();
	return waited?.hash ?? tx.hash;
}
