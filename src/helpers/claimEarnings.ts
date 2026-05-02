import { Contract, ethers, type Provider } from "ethers";
import { VersionedTransaction } from "@solana/web3.js";
import { useSignerContext } from "context/SignerContext";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import {
	useWallets as usePrivyWallets,
	useSendTransaction,
} from "@privy-io/react-auth";
import {
	useSignAndSendTransaction as useSolanaSignAndSendTransaction,
	useWallets as useSolanaWallets,
} from "@privy-io/react-auth/solana";
import { useCallback, useMemo, useState } from "react";
import { AddressesByChainId, ChainId, OrderBuilder } from "@predictdotfun/sdk";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { getCTFAddress, getUSDCAddress, SOLANA_USDC_MINT } from "@/config/addresses";
import { POLYGON_CTF, POLYGON_PUSD } from "@/trading/polymarket/constants";
import { usePolymarketRelay } from "@/trading/polymarket/usePolymarketRelay";
import { executePolygonRelayAndWait } from "@/trading/polymarket/safeActions";
import { predictCtfKey } from "@/trading/predict/predictContractKeys";
import { ensurePredictChain, getBscBrowserSigner } from "@/trading/predict/bnbWallet";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { useFundingAddresses } from "@/trading/hooks/useFundingAddresses";
import { sendPrivySponsoredSolanaTransaction } from "@/trading/solana/privySponsoredSolana";

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

const CTF_READ_ABI = [
	"function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) view returns (bytes32)",
	"function getPositionId(address collateralToken, bytes32 collectionId) view returns (uint256)",
	"function balanceOf(address account, uint256 id) view returns (uint256)",
] as const;

/**
 * ERC1155 outcome balance for a resolved binary market (used for NegRisk
 * redeem amount). Holder must match where Predict holds tokens (Kernel when
 * `VITE_PREDICT_ACCOUNT_ADDRESS` is set, else the embedded EOA).
 */
async function readPredictOutcomeTokenBalance(args: {
	provider: Provider;
	conditionId: string;
	indexSet: 1 | 2;
	isNegRisk: boolean;
	isYieldBearing: boolean;
	holder: string;
}): Promise<bigint> {
	const chainId = ChainId.BnbMainnet;
	const ctfAddr =
		AddressesByChainId[chainId][
			predictCtfKey(args.isNegRisk, args.isYieldBearing)
		];
	const collateral = AddressesByChainId[chainId].USDT;
	const ctf = new Contract(ctfAddr, CTF_READ_ABI, args.provider);
	const collectionId = await ctf.getCollectionId(
		ethers.ZeroHash,
		args.conditionId,
		args.indexSet,
	);
	const positionId = await ctf.getPositionId(collateral, collectionId);
	return ctf.balanceOf(args.holder, positionId) as Promise<bigint>;
}

type MarketVenue = "levelup" | "polymarket" | "predictfun" | "dflow";

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
 *   - dflow:       Solana — Kalshi/DFlow trade API (sell winning outcome mint → USDC), same as SOR sell leg
 */
export function useClaimForVenue(
	market: PredictionMarket,
	resolvedOutcome: "yes" | "no"
) {
	const { account, hasSmartWallet, signer } = useSignerContext() as any;
	const { getClientForChain } = useSmartWallets();

	const { getRelayClient: getPolyRelayClient } = usePolymarketRelay();

	const { wallets } = usePrivyWallets();
	const { sendTransaction: privyEvmSendTransaction } = useSendTransaction();

	const [isClaiming, setIsClaiming] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [txHash, setTxHash] = useState<string | null>(null);

	const iface = useMemo(() => new ethers.Interface(CTF_ABI), []);

	const privateApi = usePrivateApiClient();
	const { solanaAddress } = useFundingAddresses();
	const { signAndSendTransaction: privySolanaSignAndSend } =
		useSolanaSignAndSendTransaction();
	const { wallets: solanaWallets } = useSolanaWallets();
	const embeddedSolanaWallet = useMemo(
		() =>
			solanaWallets.find((w) => w.address === solanaAddress?.trim()) ??
			solanaWallets[0] ??
			null,
		[solanaWallets, solanaAddress],
	);

	const venue: MarketVenue = (market as any)?._venue || "levelup";
	const isNegRisk = Boolean((market as any)?._isNegRisk);
	const isYieldBearing = Boolean((market as any)?._isYieldBearing);

	const claim = useCallback(async () => {
		setIsClaiming(true);
		setError(null);
		setTxHash(null);

		try {
			if (!account) throw new Error("Connect wallet");
			if (venue !== "dflow" && !market.conditionId) {
				throw new Error("Market conditionId not found");
			}

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
			} else if (venue === "dflow") {
				hash = await redeemDflow();
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

		async function redeemDflow(): Promise<string> {
			if (!embeddedSolanaWallet) {
				throw new Error(
					"Connect your Solana wallet to redeem Kalshi / DFlow winnings",
				);
			}
			const m = market as PredictionMarket & {
				_dflowRedeemShares?: number;
				questionId?: string;
			};
			const outcomeMint = String(m.questionId ?? "").trim();
			if (!outcomeMint) {
				throw new Error("Missing Kalshi outcome token (mint)");
			}
			const shares = Number(m._dflowRedeemShares ?? 0);
			if (!Number.isFinite(shares) || shares <= 0) {
				throw new Error(
					"No redeemable Kalshi shares on this row — refresh the page and try again",
				);
			}
			const amountBaseUnits = Math.round(shares * 1_000_000).toString();
			const orderResult = await privateApi.getDflowOrder({
				inputMint: outcomeMint,
				outputMint: SOLANA_USDC_MINT,
				amount: amountBaseUnits,
			});
			if (orderResult.code || orderResult.msg) {
				throw new Error(
					orderResult.msg ??
						orderResult.code ??
						"Kalshi redeem order failed",
				);
			}
			if (!orderResult.transaction) {
				throw new Error("Kalshi returned no transaction to sign");
			}
			const txBytes = Buffer.from(orderResult.transaction, "base64");
			const transaction = VersionedTransaction.deserialize(txBytes);
			return sendPrivySponsoredSolanaTransaction(
				privySolanaSignAndSend,
				embeddedSolanaWallet,
				transaction.serialize(),
			);
		}

		async function redeemPolymarket(): Promise<string | undefined> {
			const relayClient = await getPolyRelayClient();
			if (!relayClient)
				throw new Error(
					"Polymarket wallet not ready — connect your wallet and try again"
				);

			const redeemData = iface.encodeFunctionData("redeemPositions", [
				POLYGON_PUSD,
				ethers.ZeroHash,
				market.conditionId,
				[YES_INDEX_SET, NO_INDEX_SET],
			]);

			console.log("CLAIM DEBUG: Polymarket redeem via Safe relay", {
				ctf: POLYGON_CTF,
				collateral: POLYGON_PUSD,
				conditionId: market.conditionId,
				indexSets: [YES_INDEX_SET, NO_INDEX_SET],
			});

			const respOrHash = await executePolygonRelayAndWait(
				relayClient,
				[{ to: POLYGON_CTF as string, value: "0", data: redeemData }],
				"Redeem Polymarket winnings",
			);
			return respOrHash;
		}

		async function redeemPredict(): Promise<string> {
			const embedded = (wallets || []).find(
				(w: any) =>
					w?.walletClientType === "privy" ||
					w?.connectorType === "privy"
			) as
				| { getEthereumProvider?: () => Promise<any>; address?: string }
				| undefined;

			if (!embedded?.getEthereumProvider || !embedded.address)
				throw new Error(
					"Embedded wallet required for Predict claims on BNB"
				);

			const address = embedded.address as `0x${string}`;
			const ethereum = await embedded.getEthereumProvider();
			await ensurePredictChain(ethereum);
			const bscSigner = await getBscBrowserSigner({
				ethereum,
				address,
				sendTransaction: privyEvmSendTransaction,
			});

			const predictAccountRaw =
				typeof import.meta.env.VITE_PREDICT_ACCOUNT_ADDRESS === "string"
					? import.meta.env.VITE_PREDICT_ACCOUNT_ADDRESS.trim()
					: "";
			const predictAccount =
				predictAccountRaw.length > 0 ? predictAccountRaw : undefined;

			// Must mirror `usePredictTradingSession`: single winning index set,
			// and when `predictAccount` (Kernel) is set, redemption goes through
			// `kernel.execute` via the SDK — raw EOA→CTF calls revert in
			// simulation because outcome ERC1155 balances sit on the Kernel.
			const indexSet = (
				resolvedOutcome === "yes" ? YES_INDEX_SET : NO_INDEX_SET
			) as 1 | 2;

			const builder = await OrderBuilder.make(
				ChainId.BnbMainnet,
				bscSigner as never,
				predictAccount ? { predictAccount } : {},
			);

			let amount: bigint | undefined;
			if (isNegRisk) {
				const provider = bscSigner.provider;
				if (!provider) {
					throw new Error(
						"No BNB provider available to read Predict position balance",
					);
				}
				const holder =
					predictAccount ?? (await bscSigner.getAddress());
				amount = await readPredictOutcomeTokenBalance({
					provider,
					conditionId: market.conditionId,
					indexSet,
					isNegRisk,
					isYieldBearing,
					holder,
				});
				if (amount === 0n) {
					throw new Error(
						"No redeemable outcome tokens for this market on your Predict account",
					);
				}
			}

			console.log("CLAIM DEBUG: Predict redeem on BNB (OrderBuilder)", {
				conditionId: market.conditionId,
				indexSet,
				isNegRisk,
				isYieldBearing,
				predictAccount: predictAccount ?? null,
				negRiskAmount: amount?.toString() ?? null,
			});

			const result = await builder.redeemPositions({
				conditionId: market.conditionId,
				indexSet,
				isNegRisk,
				isYieldBearing,
				...(isNegRisk ? { amount } : {}),
			});

			if (!result.success) {
				const c = result.cause;
				throw c instanceof Error ? c : new Error(String(c));
			}
			const receipt = result.receipt;
			const hash =
				receipt?.hash ??
				(receipt as { transactionHash?: string } | undefined)
					?.transactionHash;
			if (!hash) {
				throw new Error("Predict redeem did not return a transaction hash");
			}
			return hash;
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
		privyEvmSendTransaction,
		privateApi,
		embeddedSolanaWallet,
		privySolanaSignAndSend,
	]);

	return { claim, isClaiming, error, txHash, isExternalClaim: false };
}

/** @deprecated Use useClaimForVenue instead */
export const useClaimEarningsForMarket = useClaimForVenue;

export default useClaimEarnings;
