import {
	Contract,
	ethers,
	type Provider,
} from "ethers";
import { useSignerContext } from "context/SignerContext";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import {
	useWallets as usePrivyWallets,
	useSendTransaction,
} from "@privy-io/react-auth";
import {
	useSignTransaction as useSolanaSignTransaction,
	useWallets as useSolanaWallets,
} from "@privy-io/react-auth/solana";
import { useCallback, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { useQueryClient } from "@tanstack/react-query";
import { formatErrorForUser } from "@/errors";
import { TOAST_AUTO_CLOSE_TIME } from "config/ui";
import { AddressesByChainId, ChainId, OrderBuilder } from "@predictdotfun/sdk";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import {
	getCTFAddress,
	getUSDCAddress,
	SOLANA_USDC_MINT,
} from "@/config/addresses";
import {
	POLYGON_CTF,
	POLYGON_NEG_RISK_ADAPTER,
	POLYGON_PUSD,
	POLYGON_USDC_E,
} from "@/trading/polymarket/constants";
import { usePolymarketRelay } from "@/trading/polymarket/usePolymarketRelay";
import { executePolygonRelayAndWait } from "@/trading/polymarket/safeActions";
import { readPolymarketSafeCtfBalanceWei } from "@/trading/polymarket/polygonCollateralWrap";
import {
	encodePacked,
	keccak256,
	type Address,
	type Hex,
} from "viem";
import { predictCtfKey } from "@/trading/predict/predictContractKeys";
import { ensurePredictChain, getBscBrowserSigner } from "@/trading/predict/bnbWallet";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { useCurrentProfile } from "@/trading/hooks/useCurrentProfile";
import { useFundingAddresses } from "@/trading/hooks/useFundingAddresses";
import { tradingQueryKeys } from "@/trading/queryKeys";
import { quoteSignAndSubmitDflowOrder } from "@/trading/dflow/quoteSignAndSubmitDflowOrder";
import type { DflowOrderSubmitBody } from "@/services/privateApi/client";
import { buildLimitlessEoaEnsureBodyFromSigner } from "@/trading/limitless/limitlessEnsureEoaBody";
import { redeemLimitlessWinningPositionOnBase } from "@/trading/limitless/limitlessRedeemOnBase";
import { getLimitlessBaseTxClientForAddress } from "@/trading/limitless/limitlessBaseTxClientForAddress";
const BASE_CHAIN_ID = 8453;

/** `POST /api/limitless/ensure-account` payload (unwrapped) or rare `{ data }` cache shape. */
function parseLimitlessOwnerIdFromEnsureData(data: unknown): number | undefined {
	if (data == null || typeof data !== "object") return undefined;
	const d = data as Record<string, unknown>;
	const inner =
		d.data != null && typeof d.data === "object"
			? (d.data as Record<string, unknown>)
			: d;
	const la = inner.limitlessAccount;
	if (!la || typeof la !== "object") return undefined;
	const oid = (la as Record<string, unknown>).ownerId;
	if (typeof oid === "number" && Number.isFinite(oid) && oid > 0) return oid;
	return undefined;
}

function parseLimitlessMakerAddressFromEnsureData(data: unknown): string | undefined {
	if (data == null || typeof data !== "object") return undefined;
	const d = data as Record<string, unknown>;
	const inner =
		d.data != null && typeof d.data === "object"
			? (d.data as Record<string, unknown>)
			: d;
	const la = inner.limitlessAccount;
	if (!la || typeof la !== "object") return undefined;
	const rec = la as Record<string, unknown>;
	const maker = rec.makerAddress;
	if (typeof maker === "string" && maker.trim() && ethers.isAddress(maker.trim())) {
		return ethers.getAddress(maker.trim());
	}
	const signerAddr = rec.signerAddress;
	if (
		typeof signerAddr === "string" &&
		signerAddr.trim() &&
		ethers.isAddress(signerAddr.trim())
	) {
		return ethers.getAddress(signerAddr.trim());
	}
	return undefined;
}

const CLAIM_ERROR_TOAST_ID = "claim-error";

/** User-facing claim failure: catalog copy + bottom-right toast (same container as trade). */
export function reportClaimError(err: unknown): string {
	const message = formatErrorForUser(err);
	toast.dismiss(CLAIM_ERROR_TOAST_ID);
	toast.error(message, {
		toastId: CLAIM_ERROR_TOAST_ID,
		// Dev: stay open until click so you can inspect `.Toastify__toast` in Elements.
		autoClose: import.meta.env.DEV ? false : TOAST_AUTO_CLOSE_TIME,
		hideProgressBar: true,
		pauseOnHover: false,
		pauseOnFocusLoss: false,
		closeOnClick: true,
	});
	return message;
}

/** Dev-only — keeps production consoles clean (errors still surface via UI `setError`). */
function claimDev(message: string, data?: Record<string, unknown>): void {
	if (!import.meta.env.DEV) return;
	if (data !== undefined) console.debug(`[claim] ${message}`, data);
	else console.debug(`[claim] ${message}`);
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

function getContracts() {
	return {
		CTF: getCTFAddress(),
		COLLATERAL: getUSDCAddress(),
	};
}

const CTF_ABI = [
	"function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets) returns (uint256)",
];

/**
 * Polymarket NegRisk redeem — multi-outcome (Match Winner, election, etc.)
 * positions are minted via the NegRiskAdapter and MUST be redeemed through it.
 * Calling the standard CTF `redeemPositions(...)` for a NegRisk condition
 * mines but pays out 0 pUSD (silent failure). Signature mirrors the official
 * Polymarket builder-relayer-client `redeem.ts` example.
 */
const NEG_RISK_ADAPTER_ABI = [
	"function redeemPositions(bytes32 _conditionId, uint256[] _amounts)",
];

const YES_INDEX_SET = 1;
const NO_INDEX_SET = 2;

const CTF_READ_ABI = [
	"function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) view returns (bytes32)",
	"function getPositionId(address collateralToken, bytes32 collectionId) view returns (uint256)",
	"function balanceOf(address account, uint256 id) view returns (uint256)",
] as const;

function normalizeBytes32ConditionId(raw: string): `0x${string}` {
	const t = raw.trim().toLowerCase();
	const h = (t.startsWith("0x") ? t : `0x${t}`) as `0x${string}`;
	if (h.length !== 66 || !/^0x[0-9a-f]{64}$/.test(h)) {
		throw new Error("Invalid condition id (expected 32-byte hex)");
	}
	return h;
}

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

/**
 * Standard CTF position-id derivation (parentCollectionId == ZeroHash):
 *   collectionId = keccak256(abi.encodePacked(conditionId, indexSet))
 *   positionId   = uint(keccak256(abi.encodePacked(collateralToken, collectionId)))
 *
 * Polymarket markets are minted with one of two collaterals on the same CTF
 * (`0x4d97DCd97eC945f40cF65F87097ACe5EA0476045`): older markets use USDC.e
 * (`0x2791…`), newer pUSD-native markets use pUSD (`0xC011…`). Calling
 * `redeemPositions(WRONG_COLLATERAL, …)` mines successfully but pays 0 because
 * the derived position-id has zero balance — confirmed on-chain by the
 * `PayoutRedemption` event with `payout=0` even though `Status: Success`.
 *
 * We attempt `redeemPositions` with pUSD then USDC.e when the optional match
 * below fails (API collateral migration / asset id shape).
 */
function computeStandardCtfCollectionId(
	conditionId: Hex,
	indexSet: bigint,
): Hex {
	return keccak256(
		encodePacked(["bytes32", "uint256"], [conditionId, indexSet]),
	);
}

function computeStandardCtfPositionId(
	collateralToken: Address,
	collectionId: Hex,
): bigint {
	return BigInt(
		keccak256(
			encodePacked(["address", "bytes32"], [collateralToken, collectionId]),
		),
	);
}

/**
 * Standard binary redeem tries collaterals in this order. Polymarket moved from
 * USDC.e to pUSD; some positions/API rows don't match off-chain position-id
 * math, so we attempt both instead of failing detection.
 */
const POLYMARKET_STANDARD_REDEEM_COLLATERALS: readonly Address[] = [
	POLYGON_PUSD,
	POLYGON_USDC_E,
];

function detectPolymarketCollateralForAsset(
	conditionId: string,
	assetTokenId: string,
): { collateral: Address; matchedIndexSet: 1 | 2 } | null {
	let cid: Hex;
	try {
		const trimmed = conditionId.trim();
		cid = (trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`) as Hex;
	} catch {
		return null;
	}
	let expected: bigint;
	try {
		expected = BigInt(assetTokenId.trim());
	} catch {
		return null;
	}
	for (const indexSet of [1n, 2n] as const) {
		const collectionId = computeStandardCtfCollectionId(cid, indexSet);
		for (const collateral of POLYMARKET_STANDARD_REDEEM_COLLATERALS) {
			const positionId = computeStandardCtfPositionId(collateral, collectionId);
			if (positionId === expected) {
				return {
					collateral,
					matchedIndexSet: Number(indexSet) as 1 | 2,
				};
			}
		}
	}
	return null;
}

/**
 * After a no-op redeem (wrong collateral), wait before the next `/submit` so
 * the Polymarket relayer can clear `wallet busy` without noisy SDK retries.
 */
const RELAYER_INTER_COLLATERAL_SETTLE_MS = 2800;

/**
 * When position-id detection matches a collateral, try it first; otherwise
 * default to pUSD then USDC.e (Polymarket’s migration direction).
 */
function polymarketCtfRedeemCollateralOrder(
	hint: ReturnType<typeof detectPolymarketCollateralForAsset>,
): Address[] {
	const pusd = POLYGON_PUSD;
	const usdce = POLYGON_USDC_E;
	if (hint?.collateral === usdce) return [usdce, pusd];
	if (hint?.collateral === pusd) return [pusd, usdce];
	return [pusd, usdce];
}

type MarketVenue =
	| "levelup"
	| "polymarket"
	| "predictfun"
	| "dflow"
	| "limitless";

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
		} catch (e: unknown) {
			console.error("error", e);
			setError(reportClaimError(e));
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
 *   - limitless:   Base — Limitless CTF / NegRisk adapter (not LevelUp `getCTFAddress()` on Base)
 */
export function useClaimForVenue(
	market: PredictionMarket,
	resolvedOutcome: "yes" | "no"
) {
	const { account, hasSmartWallet, signer, signerAddress } =
		useSignerContext() as any;
	const { getClientForChain } = useSmartWallets();

	const { getRelayClient: getPolyRelayClient } = usePolymarketRelay();

	const { wallets } = usePrivyWallets();
	const { sendTransaction: privyEvmSendTransaction } = useSendTransaction();

	const [isClaiming, setIsClaiming] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [txHash, setTxHash] = useState<string | null>(null);

	const iface = useMemo(() => new ethers.Interface(CTF_ABI), []);

	const queryClient = useQueryClient();
	const privateApi = usePrivateApiClient();
	const profileQuery = useCurrentProfile();
	const profileId = profileQuery.data?._id;

	const {
		solanaAddress,
		polymarketSafe: polymarketDepositWallet,
		embeddedEoa,
		baseSmartWallet,
	} = useFundingAddresses();
	const { signTransaction: privySolanaSignTransaction } =
		useSolanaSignTransaction();
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

			claimDev("start", {
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
			} else if (venue === "limitless") {
				hash = await redeemLimitless();
			} else {
				hash = await redeemLevelUp();
			}

			if (hash) setTxHash(hash);
			claimDev("success", { txHash: hash ?? null });
			return true;
		} catch (e: unknown) {
			console.error("error", e);
			const msg = reportClaimError(e);
			const rec =
				e !== null && typeof e === "object"
					? (e as {
							name?: unknown;
							code?: unknown;
						})
					: {};
			claimDev("error", {
				message: msg,
				name: typeof rec.name === "string" ? rec.name : undefined,
				code: typeof rec.code === "string" ? rec.code : undefined,
				stack: e instanceof Error ? e.stack : undefined,
			});
			setError(msg);
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
			const { signature } = await quoteSignAndSubmitDflowOrder({
				privateApi,
				submitFn: (body) => privateApi.postClaimDflow(body),
				solanaSigner: {
					signTransactionOnly: async (serializedTx: Uint8Array) => {
						const out = await privySolanaSignTransaction({
							transaction: serializedTx,
							wallet: embeddedSolanaWallet,
						});
						return out.signedTransaction;
					},
				},
				orderParams: {
					inputMint: outcomeMint,
					outputMint: SOLANA_USDC_MINT,
					amount: amountBaseUnits,
					slippageBps: "auto",
					predictionMarketSlippageBps: "auto",
				},
				submitExtras: {
					inputMint: outcomeMint,
					outputMint: SOLANA_USDC_MINT,
					amount: amountBaseUnits,
					side: "SELL",
					outcome: resolvedOutcome,
					marketRef: {
						externalMarketId: outcomeMint,
						tokenId: outcomeMint,
					},
				} satisfies Omit<DflowOrderSubmitBody, "signedTx" | "lastValidBlockHeight">,
			});
			return signature;
		}

		async function redeemPolymarket(): Promise<string | undefined> {
			const relayClient = await getPolyRelayClient();
			if (!relayClient)
				throw new Error(
					"Polymarket wallet not ready — connect your wallet and try again"
				);
			if (!polymarketDepositWallet) {
				throw new Error(
					"Polymarket deposit wallet not ready — finish Polymarket onboarding and try again"
				);
			}

			const polyMarket = market as PredictionMarket & {
				_isNegRisk?: boolean;
				_polyAssetTokenId?: string;
			};
			const polyAssetTokenId = String(
				polyMarket._polyAssetTokenId ?? "",
			).trim();
			const polyIsNegRisk = polyMarket._isNegRisk === true;

			async function assertPolymarketOutcomeBurned(
				lastTxHash: string | undefined,
			): Promise<void> {
				if (!polyAssetTokenId || !polymarketDepositWallet) return;
				try {
					const postBalance = await readPolymarketSafeCtfBalanceWei(
						polymarketDepositWallet,
						polyAssetTokenId,
					);
					if (postBalance > 0n) {
						claimDev("negRisk post-check: ERC1155 still > 0 after redeem", {
							txHash: lastTxHash,
							conditionId: market.conditionId,
							assetTokenId: polyAssetTokenId,
							postBalanceWei: postBalance.toString(),
						});
						throw new Error(
							"Polymarket redeem mined but paid out $0 — your outcome tokens are still in your deposit wallet. The market may not be fully resolved on-chain yet (UMA dispute window). Please try again in a few minutes or claim from polymarket.com.",
						);
					}
				} catch (postErr) {
					if (
						postErr instanceof Error &&
						postErr.message.startsWith("Polymarket redeem mined")
					) {
						throw postErr;
					}
					claimDev("negRisk post-check: balance read failed (non-fatal)", {
						err: String(postErr),
					});
				}
			}

			if (polyIsNegRisk) {
				/**
				 * NegRisk Adapter `redeemPositions(conditionId, [yesAmt, noAmt])` — see
				 * `https://docs.polymarket.com/advanced/neg-risk` and the official
				 * `Polymarket/builder-relayer-client/examples/redeem.ts`. Amounts are
				 * raw 6-decimal CTF base units (Polymarket outcome tokens are minted
				 * 1:1 against pUSD). Read from chain — `pv.shares` from the Data API
				 * lags and the `polyWinnings` row only carries the winning side, so
				 * the OTHER side stays `0` and the user's actual ERC1155 balance for
				 * `_polyAssetTokenId` becomes the YES or NO leg based on
				 * `resolvedOutcome`.
				 */
				if (!polyAssetTokenId) {
					throw new Error(
						"Polymarket NegRisk claim missing on-chain asset id — refresh and try again",
					);
				}
				const balanceWei = await readPolymarketSafeCtfBalanceWei(
					polymarketDepositWallet,
					polyAssetTokenId,
				);
				if (balanceWei <= 0n) {
					throw new Error(
						"No redeemable Polymarket tokens on your deposit wallet for this market",
					);
				}
				const amounts: [bigint, bigint] =
					resolvedOutcome === "yes"
						? [balanceWei, 0n]
						: [0n, balanceWei];
				const nrIface = new ethers.Interface(NEG_RISK_ADAPTER_ABI);
				const redeemData = nrIface.encodeFunctionData("redeemPositions", [
					market.conditionId,
					amounts,
				]);

				claimDev("polymarket NegRiskAdapter redeem", {
					conditionId: market.conditionId,
					resolvedOutcome,
					balanceWei: balanceWei.toString(),
				});

				const respOrHash = await executePolygonRelayAndWait(
					relayClient,
					[
						{
							to: POLYGON_NEG_RISK_ADAPTER as string,
							value: "0",
							data: redeemData,
						},
					],
					polymarketDepositWallet,
					"Redeem Polymarket NegRisk winnings",
				);
				await assertPolymarketOutcomeBurned(respOrHash);
				return respOrHash;
			}

			/**
			 * Standard binary market. Polymarket used USDC.e then migrated to pUSD;
			 * both collaterals share the same CTF. Wrong `collateralToken` mines but
			 * pays 0. Off-chain asset-id detection sometimes fails (API / NegRisk
			 * edge cases), so we try pUSD first, then USDC.e, and succeed when the
			 * ERC1155 balance for `_polyAssetTokenId` hits zero.
			 */
			if (!polyAssetTokenId) {
				throw new Error(
					"Polymarket claim missing on-chain asset id — refresh and try again",
				);
			}
			const balanceWeiPre = await readPolymarketSafeCtfBalanceWei(
				polymarketDepositWallet,
				polyAssetTokenId,
			);
			if (balanceWeiPre <= 0n) {
				throw new Error(
					"No redeemable Polymarket tokens on your deposit wallet for this market",
				);
			}

			const detectionHint = detectPolymarketCollateralForAsset(
				market.conditionId,
				polyAssetTokenId,
			);
			const collateralsToTry =
				polymarketCtfRedeemCollateralOrder(detectionHint);
			claimDev("polymarket CTF redeem order", {
				conditionId: market.conditionId,
				detectionHint: detectionHint?.collateral ?? null,
				tryCollaterals: collateralsToTry.map((c) =>
					c === POLYGON_PUSD ? "pUSD" : c === POLYGON_USDC_E ? "USDC.e" : c,
				),
			});

			let lastHash: string | undefined;
			for (let i = 0; i < collateralsToTry.length; i++) {
				if (i > 0) {
					await sleep(RELAYER_INTER_COLLATERAL_SETTLE_MS);
				}

				const collateral = collateralsToTry[i];
				const collateralLabel =
					collateral === POLYGON_PUSD
						? "pUSD"
						: collateral === POLYGON_USDC_E
							? "USDC.e"
							: "unknown";
				const redeemData = iface.encodeFunctionData("redeemPositions", [
					collateral,
					ethers.ZeroHash,
					market.conditionId,
					[YES_INDEX_SET, NO_INDEX_SET],
				]);

				claimDev(`polymarket CTF attempt ${i + 1}/${collateralsToTry.length}`, {
					collateral: collateralLabel,
				});

				lastHash = await executePolygonRelayAndWait(
					relayClient,
					[
						{
							to: POLYGON_CTF as string,
							value: "0",
							data: redeemData,
						},
					],
					polymarketDepositWallet,
					"Redeem Polymarket winnings",
				);

				const postBalance = await readPolymarketSafeCtfBalanceWei(
					polymarketDepositWallet,
					polyAssetTokenId,
				);
				if (postBalance === 0n) {
					return lastHash;
				}

				claimDev("CTF redeem no burn (wrong collateral or unresolved)", {
					attemptCollateral: collateralLabel,
					postBalanceWei: postBalance.toString(),
					txHash: lastHash ?? null,
				});
			}

			claimDev("CTF redeem exhausted both collaterals", {
				lastTxHash: lastHash ?? null,
				conditionId: market.conditionId,
			});
			throw new Error(
				"Could not redeem this Polymarket position (tried both collateral types). The market may not be fully resolved on-chain yet — try again shortly, or redeem on polymarket.com.",
			);
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

			claimDev("predictfun redeem", {
				conditionId: market.conditionId,
				indexSet,
				isNegRisk,
				isYieldBearing,
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

			claimDev("levelup redeem on Base", {
				conditionId: market.conditionId,
				indexSet,
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

		/**
		 * Limitless EOA partner flow: redeem winning outcome ERC1155s on **Base** via the
		 * Gnosis CTF (`getCtf()` on `venue.exchange`) or the NegRisk adapter when
		 * `isNegRisk` and `venue.adapter` are set. Partner HTTP `POST /portfolio/redeem`
		 * is server-wallet–only per Limitless docs — not used here.
		 */
		async function redeemLimitless(): Promise<string> {
			const cidHex = normalizeBytes32ConditionId(market.conditionId!);
			const lx = market as PredictionMarket & {
				_limitlessOutcomeTokenId?: string;
				_limitlessMarketSlug?: string;
				_limitlessVenueExchange?: string;
				_limitlessVenueAdapter?: string;
				_limitlessCollateralAddress?: string;
			};
			const outcomeTokenId = String(lx._limitlessOutcomeTokenId ?? "").trim();
			if (!outcomeTokenId) {
				throw new Error(
					"Limitless claim is missing outcome token id — refresh Winnings and try again.",
				);
			}
			if (!profileId) {
				throw new Error(
					"Profile not loaded yet — wait a moment and try Claim again.",
				);
			}
			if (!signer) {
				throw new Error(
					"Connect your Limitless trading wallet to redeem on Base.",
				);
			}

			const ensureKey = tradingQueryKeys.limitlessEnsureAccount(profileId);
			let ensureData = queryClient.getQueryData(ensureKey);
			let ownerId = parseLimitlessOwnerIdFromEnsureData(ensureData);
			if (ownerId == null) {
				ensureData = await queryClient.fetchQuery({
					queryKey: ensureKey,
					queryFn: async () => {
						let body: Record<string, unknown> | undefined;
						try {
							body = await buildLimitlessEoaEnsureBodyFromSigner({
								getPlainSigningMessage: () =>
									privateApi.getLimitlessAuthSigningMessage(),
								signer,
							});
						} catch (e) {
							console.warn("[claim] limitless ensure EOA body failed", e);
						}
						return privateApi.postLimitlessEnsureAccount(body);
					},
				});
				ownerId = parseLimitlessOwnerIdFromEnsureData(ensureData);
			}
			if (ownerId == null) {
				throw new Error(
					"Limitless partner account is not ready (missing ownerId). Finish Limitless setup from a market trade box, then try Claim again.",
				);
			}

			const limitlessMaker =
				parseLimitlessMakerAddressFromEnsureData(ensureData);
			let signerAddr = "";
			if (typeof signerAddress === "string" && signerAddress.trim()) {
				signerAddr = signerAddress.trim();
			} else {
				signerAddr = await signer.getAddress();
			}
			const makerNorm = limitlessMaker?.toLowerCase() ?? "";
			const signerNorm = signerAddr.toLowerCase();
			if (makerNorm && signerNorm && makerNorm !== signerNorm) {
				throw new Error(
					`Your connected signer (${signerAddr}) does not match your Limitless maker address (${limitlessMaker}). Switch to the wallet you used for Limitless trading.`,
				);
			}

			const slug = String(lx._limitlessMarketSlug ?? "").trim();

			claimDev("limitless redeem: Base on-chain (EOA maker)", {
				conditionId: cidHex,
				ownerId,
				outcomeTokenIdTail: `${outcomeTokenId.slice(0, 14)}…`,
				marketSlug: slug || "(absent — will fetch market JSON if needed)",
				isNegRisk,
				venueExchange: lx._limitlessVenueExchange ? "present" : "absent",
			});

			const baseTxClient = await getLimitlessBaseTxClientForAddress({
				address: signerAddr,
				getClientForChain,
				baseSmartWallet,
				embeddedEoa,
				privyEvmSendTransaction,
			});
			if (!baseTxClient) {
				throw new Error(
					"Limitless Claim could not open Privy sponsored gas for your maker address. Your Limitless maker must be your embedded wallet (or your Base smart wallet if that is the registered maker). If you use an external wallet as maker, fund Base ETH on that address for gas, or redeem on limitless.exchange.",
				);
			}

			const txHash = await redeemLimitlessWinningPositionOnBase({
				signer,
				conditionId: cidHex,
				resolvedOutcome,
				isNegRisk,
				outcomeTokenId,
				marketSlug: slug || undefined,
				limitlessVenueExchange: lx._limitlessVenueExchange,
				limitlessVenueAdapter: lx._limitlessVenueAdapter,
				limitlessCollateralAddress: lx._limitlessCollateralAddress,
				fetchMarketBySlug: (s) => privateApi.getLimitlessMarketBySlug(s),
				baseTxClient,
			});
			claimDev("limitless redeem tx", { txHash });
			return txHash;
		}
	}, [
		account,
		hasSmartWallet,
		signer,
		signerAddress,
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
		privySolanaSignTransaction,
		queryClient,
		profileId,
		embeddedEoa,
		baseSmartWallet,
	]);

	return { claim, isClaiming, error, txHash, isExternalClaim: false };
}

/** @deprecated Use useClaimForVenue instead */
export const useClaimEarningsForMarket = useClaimForVenue;

export default useClaimEarnings;
