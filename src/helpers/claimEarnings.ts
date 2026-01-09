import { ethers } from "ethers";
import { useSignerContext } from "context/SignerContext";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useCallback, useMemo, useState } from "react";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { CTF_ADDRESS, USDC_ADDRESS } from "@/config/addresses";

// Base mainnet chain id
const BASE_CHAIN_ID = 8453;

// Contracts on Base (imported from centralized config)
const CONTRACTS = {
	CTF: CTF_ADDRESS,
	COLLATERAL: USDC_ADDRESS,
};

// Minimal ABI for redeem
const CTF_ABI = [
	"function getCondition(bytes32 conditionId) view returns (address oracle, bytes32 questionId, uint256 outcomeSlotCount, uint256[] payoutNumerators, uint256 payoutDenominator)",
	"function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets) returns (uint256)",
];

// For a binary market, indexSet YES = 1, NO = 2
const YES_INDEX_SET = 1;
const NO_INDEX_SET = 2;

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

			// Hardcoded for backward compatibility
			const HARDCODED_CONDITION_ID =
				"0x845273138bad81b14693745a9db0c69849ab4fb3e7b7a01d49bc065282999eb9";

			// Encode redeemPositions for YES index set only (market resolved as YES)
			const redeemYes = iface.encodeFunctionData("redeemPositions", [
				CONTRACTS.COLLATERAL,
				ethers.ZeroHash,
				HARDCODED_CONDITION_ID,
				[YES_INDEX_SET],
			]);

			let txHash: string;

			if (hasSmartWallet) {
				// Smart wallet path
				const smartWalletClient = await getClientForChain({
					id: BASE_CHAIN_ID,
				});
				if (!smartWalletClient)
					throw new Error(
						"No smart wallet client available for Base chain"
					);

				const tx = await smartWalletClient.sendTransaction({
					to: CONTRACTS.CTF as `0x${string}`,
					data: redeemYes as `0x${string}`,
					value: 0n,
				});
				txHash = tx;
			} else {
				// External/Embedded wallet path
				if (!signer) throw new Error("No signer available");

				const tx = await signer.sendTransaction({
					to: CONTRACTS.CTF,
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

// New dynamic hook for specific markets
export function useClaimEarningsForMarket(
	market: PredictionMarket,
	resolvedOutcome: "yes" | "no"
) {
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
			if (!market.conditionId)
				throw new Error("Market conditionId not found");
			if (!market.questionId)
				throw new Error("Market questionId not found");

			console.log("CLAIM DEBUG: Claiming for market:", {
				marketId: market._id,
				conditionId: market.conditionId,
				questionId: market.questionId,
				resolvedOutcome,
				displayName: market.displayName,
				hasSmartWallet,
			});

			// Determine which index set to claim based on resolved outcome
			const indexSet =
				resolvedOutcome === "yes" ? YES_INDEX_SET : NO_INDEX_SET;

			// Encode redeemPositions for the winning index set
			const redeemData = iface.encodeFunctionData("redeemPositions", [
				CONTRACTS.COLLATERAL,
				ethers.ZeroHash, // parentCollectionId (zero for direct positions)
				market.conditionId,
				[indexSet],
			]);

			console.log("CLAIM DEBUG: Redeem data:", {
				collateralToken: CONTRACTS.COLLATERAL,
				parentCollectionId: ethers.ZeroHash,
				conditionId: market.conditionId,
				indexSets: [indexSet],
				resolvedOutcome,
			});

			let txHash: string;

			if (hasSmartWallet) {
				// Smart wallet path - use viem client
				console.log("CLAIM DEBUG: Using smart wallet path");
				const smartWalletClient = await getClientForChain({
					id: BASE_CHAIN_ID,
				});
				if (!smartWalletClient)
					throw new Error(
						"No smart wallet client available for Base chain"
					);

				const tx = await smartWalletClient.sendTransaction({
					to: CONTRACTS.CTF as `0x${string}`,
					data: redeemData as `0x${string}`,
					value: 0n,
				});
				txHash = tx;
			} else {
				// External/Embedded wallet path - use ethers signer
				console.log("CLAIM DEBUG: Using external/embedded wallet path");
				if (!signer) throw new Error("No signer available");

				const tx = await signer.sendTransaction({
					to: CONTRACTS.CTF,
					data: redeemData,
					value: 0,
				});
				await tx.wait();
				txHash = tx.hash;
			}

			setTxHash(txHash);
			console.log("CLAIM SUCCESS: Transaction hash:", txHash);
			return true;
		} catch (e: any) {
			console.error("❌ CLAIM ERROR:", e);
			setError(e?.message || String(e));
			return false;
		} finally {
			setIsClaiming(false);
		}
	}, [
		account,
		hasSmartWallet,
		signer,
		getClientForChain,
		iface,
		market,
		resolvedOutcome,
	]);

	return { claim, isClaiming, error, txHash };
}

export default useClaimEarnings;
