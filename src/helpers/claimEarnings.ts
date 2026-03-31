import { ethers } from "ethers";
import { useSignerContext } from "context/SignerContext";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useWallets as usePrivyWallets } from "@privy-io/react-auth";
import { useCallback, useMemo, useState } from "react";
import { AddressesByChainId, ChainId } from "@predictdotfun/sdk";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { getCTFAddress, getUSDCAddress } from "@/config/addresses";
import { POLYGON_CTF, POLYGON_USDC_E } from "@/trading/polymarket/constants";
import { usePolymarketRelay } from "@/trading/polymarket/usePolymarketRelay";
import { waitRelay } from "@/trading/polymarket/safeActions";
import { predictCtfKey } from "@/trading/predict/predictContractKeys";
import { ensurePredictChain, getBscBrowserSigner } from "@/trading/predict/bnbWallet";

const BASE_CHAIN_ID = 8453;

function getContracts() {
	return {
		CTF: getCTFAddress(),
		COLLATERAL: getUSDCAddress(),
	};
}

const CTF_ABI = [
	"function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets) returns (uint256)",
];

const YES_INDEX_SET = 1;
const NO_INDEX_SET = 2;

type MarketVenue = "levelup" | "polymarket" | "predictfun";

// Legacy hook for backward compatibility (hardcoded market)
export function useClaimEarnings() {
	const { account, hasSmartWallet, signer } = useSignerContext() as any;
	const { getClientForChain } = useSmartWallets();
	const [isClaiming, setIsClaiming] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [txHash, setTxHash] = useState<string | null>(null);

	const iface = useMemo(() => new ethers.Interface(CTF_ABI), []);

	const claim = useCallback(async () => {
		setIsClaiming(true);
		setError(null);
		setTxHash(null);

		try {
			if (!account) throw new Error("Connect wallet");

			const HARDCODED_CONDITION_ID =
				"0x845273138bad81b14693745a9db0c69849ab4fb3e7b7a01d49bc065282999eb9";

			const redeemYes = iface.encodeFunctionData("redeemPositions", [
				getContracts().COLLATERAL,
				ethers.ZeroHash,
				HARDCODED_CONDITION_ID,
				[YES_INDEX_SET],
			]);

			let txHash: string;

			if (hasSmartWallet) {
				const smartWalletClient = await getClientForChain({
					id: BASE_CHAIN_ID,
				});
				if (!smartWalletClient)
					throw new Error(
						"No smart wallet client available for Base chain"
					);

				const tx = await smartWalletClient.sendTransaction({
					to: getContracts().CTF as `0x${string}`,
					data: redeemYes as `0x${string}`,
					value: 0n,
				});
				txHash = tx;
			} else {
				if (!signer) throw new Error("No signer available");

				const tx = await signer.sendTransaction({
					to: getContracts().CTF,
					data: redeemYes,
					value: 0,
				});
				await tx.wait();
				txHash = tx.hash;
			}

			setTxHash(txHash);
			return true;
		} catch (e: any) {
			setError(e?.message || String(e));
			return false;
		} finally {
			setIsClaiming(false);
		}
	}, [account, hasSmartWallet, signer, getClientForChain, iface]);

	return { claim, isClaiming, error, txHash };
}

/**
 * Venue-aware claim hook. Routes redemption to the correct chain + contract:
 *   - levelup:     Base chain CTF via smart wallet / ethers signer
 *   - polymarket:  Polygon CTF via Polymarket Safe relay
 *   - predictfun:  BNB CTF via embedded wallet switched to BSC
 */
export function useClaimForVenue(
	market: PredictionMarket,
	resolvedOutcome: "yes" | "no"
) {
	const { account, hasSmartWallet, signer } = useSignerContext() as any;
	const { getClientForChain } = useSmartWallets();

	const { getRelayClient: getPolyRelayClient } = usePolymarketRelay();

	const { wallets } = usePrivyWallets();

	const [isClaiming, setIsClaiming] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [txHash, setTxHash] = useState<string | null>(null);

	const iface = useMemo(() => new ethers.Interface(CTF_ABI), []);

	const venue: MarketVenue = (market as any)?._venue || "levelup";
	const isNegRisk = Boolean((market as any)?._isNegRisk);
	const isYieldBearing = Boolean((market as any)?._isYieldBearing);

	const claim = useCallback(async () => {
		setIsClaiming(true);
		setError(null);
		setTxHash(null);

		try {
			if (!account) throw new Error("Connect wallet");
			if (!market.conditionId)
				throw new Error("Market conditionId not found");

			console.log("CLAIM DEBUG: Claiming for market:", {
				venue,
				marketId: market._id,
				conditionId: market.conditionId,
				resolvedOutcome,
				displayName: market.displayName,
				isNegRisk,
				isYieldBearing,
			});

			let hash: string | undefined;

			if (venue === "polymarket") {
				hash = await redeemPolymarket();
			} else if (venue === "predictfun") {
				hash = await redeemPredict();
			} else {
				hash = await redeemLevelUp();
			}

			if (hash) setTxHash(hash);
			console.log("CLAIM SUCCESS: Transaction hash:", hash);
			return true;
		} catch (e: any) {
			console.error("❌ CLAIM ERROR:", e);
			setError(e?.message || String(e));
			return false;
		} finally {
			setIsClaiming(false);
		}

		async function redeemPolymarket(): Promise<string | undefined> {
			const relayClient = await getPolyRelayClient();
			if (!relayClient)
				throw new Error(
					"Polymarket wallet not ready — connect your wallet and try again"
				);

			const redeemData = iface.encodeFunctionData("redeemPositions", [
				POLYGON_USDC_E,
				ethers.ZeroHash,
				market.conditionId,
				[YES_INDEX_SET, NO_INDEX_SET],
			]);

			console.log("CLAIM DEBUG: Polymarket redeem via Safe relay", {
				ctf: POLYGON_CTF,
				collateral: POLYGON_USDC_E,
				conditionId: market.conditionId,
				indexSets: [YES_INDEX_SET, NO_INDEX_SET],
			});

			const resp = await relayClient.execute(
				[{ to: POLYGON_CTF as string, value: "0", data: redeemData }],
				"Redeem Polymarket winnings"
			);
			return await waitRelay(resp);
		}

		async function redeemPredict(): Promise<string> {
			const embedded = (wallets || []).find(
				(w: any) =>
					w?.walletClientType === "privy" ||
					w?.connectorType === "privy"
			) as
				| { getEthereumProvider?: () => Promise<any> }
				| undefined;

			if (!embedded?.getEthereumProvider)
				throw new Error(
					"Embedded wallet required for Predict.fun claims on BNB"
				);

			const ethereum = await embedded.getEthereumProvider();
			await ensurePredictChain(ethereum);
			const bscSigner = await getBscBrowserSigner(ethereum);

			const chainId = ChainId.BnbMainnet;
			const ctfAddress =
				AddressesByChainId[chainId][
					predictCtfKey(isNegRisk, isYieldBearing)
				];
			const collateral = AddressesByChainId[chainId].USDT;

			const redeemData = iface.encodeFunctionData("redeemPositions", [
				collateral,
				ethers.ZeroHash,
				market.conditionId,
				[YES_INDEX_SET, NO_INDEX_SET],
			]);

			console.log("CLAIM DEBUG: Predict.fun redeem on BNB", {
				ctf: ctfAddress,
				collateral,
				conditionId: market.conditionId,
				indexSets: [YES_INDEX_SET, NO_INDEX_SET],
				isNegRisk,
				isYieldBearing,
			});

			const tx = await bscSigner.sendTransaction({
				to: ctfAddress as string,
				data: redeemData,
				value: 0,
			});
			await tx.wait();
			return tx.hash;
		}

		async function redeemLevelUp(): Promise<string> {
			const indexSet =
				resolvedOutcome === "yes" ? YES_INDEX_SET : NO_INDEX_SET;

			const redeemData = iface.encodeFunctionData("redeemPositions", [
				getContracts().COLLATERAL,
				ethers.ZeroHash,
				market.conditionId,
				[indexSet],
			]);

			console.log("CLAIM DEBUG: LevelUp redeem on Base", {
				ctf: getContracts().CTF,
				collateral: getContracts().COLLATERAL,
				conditionId: market.conditionId,
				indexSets: [indexSet],
				resolvedOutcome,
				hasSmartWallet,
			});

			if (hasSmartWallet) {
				const smartWalletClient = await getClientForChain({
					id: BASE_CHAIN_ID,
				});
				if (!smartWalletClient)
					throw new Error(
						"No smart wallet client available for Base chain"
					);

				return await smartWalletClient.sendTransaction({
					to: getContracts().CTF as `0x${string}`,
					data: redeemData as `0x${string}`,
					value: 0n,
				});
			}

			if (!signer) throw new Error("No signer available");

			const tx = await signer.sendTransaction({
				to: getContracts().CTF,
				data: redeemData,
				value: 0,
			});
			await tx.wait();
			return tx.hash;
		}
	}, [
		account,
		hasSmartWallet,
		signer,
		getClientForChain,
		iface,
		market,
		resolvedOutcome,
		venue,
		isNegRisk,
		isYieldBearing,
		getPolyRelayClient,
		wallets,
	]);

	return { claim, isClaiming, error, txHash, isExternalClaim: false };
}

/** @deprecated Use useClaimForVenue instead */
export const useClaimEarningsForMarket = useClaimForVenue;

export default useClaimEarnings;
