import { useCallback } from "react";
import { usePrivy, useIdentityToken } from "@privy-io/react-auth";
import { predictionMarketService } from "@/services/api/predictionMarketService";
import type { TradeExecutionParams } from "./types";
import type { OrderExecutionResult } from "@/services/api/predictionMarketService";
import { useSignerContext } from "context/SignerContext";
import { getExchangeAddress } from "config/addresses";
import { DEFAULT_RPC_URL } from "config/rpc";

function isValidEthAddress(a: string | undefined): a is string {
	return Boolean(a && /^0x[a-fA-F0-9]{40}$/i.test(a.trim()));
}

/**
 * LevelUp internal prediction-market (CTF): Polymarket-style **SCW maker + embedded
 * signer** when `params.userAddress` (SOR maker / Base SCW) differs from the Privy
 * embedded signer; otherwise EOA maker/signer. EIP-712 is always signed with
 * `activeSigner` (ethers) so the API receives a standard 65-byte ECDSA `signature`.
 */
export function useTradeExecutionService() {
	const {
		hasSmartWallet,
		signer: cachedSigner,
		signerAddress: cachedSignerAddress,
		ready,
		refresh,
	} = useSignerContext();
	const { getAccessToken } = usePrivy();
	const { identityToken } = useIdentityToken();

	const executeTrade = useCallback(
		async (
			params: TradeExecutionParams,
			_privyWallet: unknown,
		): Promise<OrderExecutionResult> => {
			try {
				console.log("🚀 Starting trade execution (LevelUp CTF)…");
				console.log("👤 Maker param (SOR / Base):", params.userAddress);
				console.log("📊 Trade details:", {
					market: params.marketId,
					position: params.position,
					amount: params.amount,
					price: params.price,
					orderType: params.orderType,
				});

				if (!params.market) {
					throw new Error(
						"CRITICAL ERROR: No market data provided. Trade cannot proceed.",
					);
				}

				if (!params.market.yesTokenId || !params.market.noTokenId) {
					throw new Error(
						`CRITICAL ERROR: Missing token IDs in market data. yesTokenId=${params.market.yesTokenId}, noTokenId=${params.market.noTokenId}. Trade cannot proceed.`,
					);
				}

				if (params.position !== "yes" && params.position !== "no") {
					throw new Error(
						`CRITICAL ERROR: Invalid position: ${params.position}. Must be 'yes' or 'no'.`,
					);
				}

				const expectedTokenId =
					params.position === "yes"
						? params.market.yesTokenId
						: params.market.noTokenId;

				const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
				let activeSigner = cachedSigner as {
					getAddress?: () => Promise<string>;
					signTypedData?: (
						domain: unknown,
						types: unknown,
						value: unknown,
					) => Promise<string>;
				};
				let signerAddress = cachedSignerAddress as string | undefined;
				if (
					!signerAddress &&
					activeSigner &&
					typeof activeSigner.getAddress === "function"
				) {
					try {
						signerAddress = await activeSigner.getAddress();
					} catch {
						/* ignore */
					}
				}
				if (!ready || !activeSigner || !signerAddress) {
					console.log("⚠️ Missing signer, attempting refresh…");
					await refresh();
					await wait(600);
					activeSigner = (cachedSigner as typeof activeSigner) || activeSigner;
					signerAddress =
						(cachedSignerAddress as string | undefined) || signerAddress;
					if (
						!signerAddress &&
						activeSigner &&
						typeof activeSigner.getAddress === "function"
					) {
						try {
							signerAddress = await activeSigner.getAddress();
						} catch {
							/* ignore */
						}
					}
				}
				if (!activeSigner || !signerAddress) {
					throw new Error("No signer available from wallet");
				}

				const embeddedWalletAddress = signerAddress.trim();
				const makerParam = params.userAddress?.trim();
				if (!isValidEthAddress(makerParam)) {
					throw new Error(
						"LevelUp trade requires params.userAddress (valid 0x maker on Base).",
					);
				}

				/** SCW-funded maker path: SOR passes SCW; embedded signs (poly-V2). Also if Privy omits smart_wallet but addresses differ. */
				const isSplitScwMaker =
					isValidEthAddress(embeddedWalletAddress) &&
					makerParam.toLowerCase() !== embeddedWalletAddress.toLowerCase();
				/** Legacy poly-V2 gate; union with address-diff so maker stays SCW when linkedAccounts is stale. */
				const isSmart = Boolean(hasSmartWallet) || isSplitScwMaker;

				console.log("🚨 Address mode before order creation:", {
					"params.userAddress": makerParam,
					embeddedWalletAddress,
					isSplitScwMaker,
					hasSmartWallet,
					isSmart,
				});

				const orderData = await predictionMarketService.createOrder(
					params.marketId,
					params.position,
					params.amount,
					params.price,
					isSmart ? makerParam : embeddedWalletAddress,
					params.market,
					params.side,
					embeddedWalletAddress,
				);

				console.log("📝 Order structure created:", orderData);

				if (orderData.tokenId !== expectedTokenId) {
					throw new Error(
						`TOKEN ID MISMATCH! Position: ${params.position}, Expected: ${expectedTokenId}, Actual: ${orderData.tokenId}`,
					);
				}

				if (typeof activeSigner.signTypedData !== "function") {
					throw new Error("Signer does not support signTypedData");
				}
				if (typeof activeSigner.getAddress !== "function") {
					throw new Error("Signer does not support getAddress");
				}
				const signerAddr = await activeSigner.getAddress();

				let onchainNonce: bigint | undefined;
				try {
					const { ethers } = await import("ethers");
					const abi = ["function nonces(address) view returns (uint256)"];
					const provider = new ethers.JsonRpcProvider(DEFAULT_RPC_URL);
					const ex = new ethers.Contract(
						getExchangeAddress(),
						abi,
						provider,
					);
					onchainNonce = await ex.nonces(signerAddr);
					console.log("🔢 On-chain nonce (signer):", onchainNonce?.toString());
				} catch (e) {
					console.warn(
						"⚠️ Failed to fetch on-chain nonce, using order default:",
						e,
					);
				}

				const domain = {
					name: "Polymarket CTF Exchange",
					version: "1",
					chainId: 8453,
					verifyingContract: getExchangeAddress(),
				};

				const types = {
					Order: [
						{ name: "salt", type: "uint256" },
						{ name: "maker", type: "address" },
						{ name: "signer", type: "address" },
						{ name: "taker", type: "address" },
						{ name: "tokenId", type: "uint256" },
						{ name: "makerAmount", type: "uint256" },
						{ name: "takerAmount", type: "uint256" },
						{ name: "expiration", type: "uint256" },
						{ name: "nonce", type: "uint256" },
						{ name: "feeRateBps", type: "uint256" },
						{ name: "side", type: "uint8" },
						{ name: "signatureType", type: "uint8" },
					],
				};

				const sigType = isSmart ? 3 : 0;
				const orderDataForSigning = {
					salt: orderData.salt,
					maker: isSmart ? orderData.maker : signerAddr,
					signer: isSmart ? orderData.signer : signerAddr,
					taker: orderData.taker,
					tokenId: orderData.tokenId,
					makerAmount: orderData.makerAmount,
					takerAmount: orderData.takerAmount,
					expiration: orderData.expiration,
					nonce: Number(onchainNonce ?? orderData.nonce),
					feeRateBps: orderData.feeRateBps,
					side: orderData.numericSide,
					signatureType: sigType,
				};

				if (
					orderDataForSigning.side !== 0 &&
					orderDataForSigning.side !== 1
				) {
					throw new Error(
						`Invalid numericSide for EIP-712: ${orderDataForSigning.side}`,
					);
				}

				const signature = await activeSigner.signTypedData(
					domain,
					types,
					orderDataForSigning,
				);

				if (!signature.startsWith("0x") || signature.length !== 132) {
					console.warn(
						"[LevelUp CTF] Unexpected signature length:",
						signature.length,
					);
				}
				console.log("🔐 Order signed successfully:", signature);

				const nonceSubmitted = Number(onchainNonce ?? orderData.nonce);
				const signedOrder = {
					salt: orderData.salt,
					maker: isSmart ? orderData.maker : signerAddr,
					signer: isSmart ? orderData.signer : signerAddr,
					taker: orderData.taker,
					tokenId: orderData.tokenId,
					makerAmount: orderData.makerAmount,
					takerAmount: orderData.takerAmount,
					expiration: orderData.expiration,
					nonce: nonceSubmitted,
					feeRateBps: orderData.feeRateBps,
					side: params.side,
					signatureType: sigType,
					signature,
					type: params.orderType,
					size: params.amount.toString(),
					price: params.price.toFixed(2),
				};

				const accessToken = await getAccessToken();
				const apiResult = await predictionMarketService.submitOrderToAPI(
					signedOrder,
					params.marketId,
					accessToken ?? undefined,
					identityToken || undefined,
				);

				console.log("✅ Order submitted to server:", apiResult);

				const data = apiResult?.data ?? apiResult;
				const txFromApi =
					(typeof data?.transactionHash === "string" &&
						data.transactionHash) ||
					(typeof data?.txHash === "string" && data.txHash) ||
					(typeof data?.hash === "string" && data.hash) ||
					undefined;
				const orderIdFromApi =
					(typeof data?.orderId === "string" && data.orderId) ||
					(typeof data?.id === "string" && data.id) ||
					String(orderData.salt);

				const result: OrderExecutionResult = {
					success: true,
					orderId: orderIdFromApi,
					...(txFromApi ? { transactionHash: txFromApi } : {}),
				};

				return result;
			} catch (error: unknown) {
				const err = error as Error;
				console.error("❌ Order execution failed:", err);
				console.error("❌ Error details:", {
					message: err.message,
					stack: err.stack,
					name: err.name,
				});

				return {
					success: false,
					error: err.message || "Order execution failed",
				};
			}
		},
		[
			cachedSigner,
			cachedSignerAddress,
			ready,
			hasSmartWallet,
			refresh,
			getAccessToken,
			identityToken,
		],
	);

	const validateTradeParams = useCallback(
		(
			params: Partial<TradeExecutionParams>,
		): {
			isValid: boolean;
			errors: string[];
		} => {
			const errors: string[] = [];

			if (!params.marketId) errors.push("Market ID is required");
			if (!params.position) errors.push("Position (Yes/No) is required");
			if (!params.amount || params.amount <= 0) {
				errors.push("Valid amount is required");
			}
			if (
				params.orderType === "limit" &&
				(!params.price || params.price <= 0)
			) {
				errors.push("Valid price is required for limit orders");
			}
			if (!params.userAddress) errors.push("User address is required");
			if (!params.market) errors.push("Market data is required");

			return {
				isValid: errors.length === 0,
				errors,
			};
		},
		[],
	);

	return {
		executeTrade,
		validateTradeParams,
	};
}
