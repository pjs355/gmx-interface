import { useCallback } from "react";
import { usePrivy, useIdentityToken } from "@privy-io/react-auth";
import { predictionMarketService } from "@/services/api/predictionMarketService";
import type { TradeExecutionParams } from "./types";
import type { OrderExecutionResult } from "@/services/api/predictionMarketService";
import { useSignerContext } from "context/SignerContext";
import { getExchangeAddress } from "config/addresses";
import { DEFAULT_RPC_URL } from "config/rpc";

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

	// Execute a trade (create order, sign, submit)
	const executeTrade = useCallback(
		async (
			params: TradeExecutionParams,
			privyWallet: any // Keep for backward compatibility but won't use it
		): Promise<OrderExecutionResult> => {
			try {
				console.log("🚀 Starting trade execution...");
				console.log("👤 User wallet:", params.userAddress);
				console.log("🔐 Privy wallet:", privyWallet);
				console.log("📊 Trade details:", {
					market: params.marketId,
					position: params.position,
					amount: params.amount,
					price: params.price,
					orderType: params.orderType,
				});

				console.log("🔍 Market data for token IDs:", {
					yesTokenId: params.market.yesTokenId,
					noTokenId: params.market.noTokenId,
					marketId: params.market.marketId,
					conditionId: params.market.conditionId,
				});

				// CRITICAL: Validate market data exists (NO FALLBACKS)
				if (!params.market) {
					throw new Error(
						`CRITICAL ERROR: No market data provided. Trade cannot proceed.`
					);
				}

				if (!params.market.yesTokenId || !params.market.noTokenId) {
					throw new Error(
						`CRITICAL ERROR: Missing token IDs in market data. yesTokenId=${params.market.yesTokenId}, noTokenId=${params.market.noTokenId}. Trade cannot proceed.`
					);
				}

				// CRITICAL: Validate position parameter
				if (params.position !== "yes" && params.position !== "no") {
					throw new Error(
						`CRITICAL ERROR: Invalid position: ${params.position}. Must be 'yes' or 'no'.`
					);
				}

				// SINGLE SOURCE OF TRUTH: Determine expected token ID from market data only
				const expectedTokenId =
					params.position === "yes"
						? params.market.yesTokenId
						: params.market.noTokenId;
				console.log(
					"🎯 SINGLE SOURCE OF TRUTH - Token ID validation:",
					{
						position: params.position,
						expectedTokenId: expectedTokenId,
						yesTokenId: params.market.yesTokenId,
						noTokenId: params.market.noTokenId,
						marketId: params.market.marketId,
					}
				);

				// Resolve trading identity (maker/signer) and signer
				const wait = (ms: number) =>
					new Promise((r) => setTimeout(r, ms));
				let activeSigner = cachedSigner as any;
				let signerAddress = cachedSignerAddress as string | undefined;
				// Try direct resolve if cached signer not ready
				// No cross-hook signer resolution; rely solely on SignerContext
				if (
					!signerAddress &&
					activeSigner &&
					typeof activeSigner.getAddress === "function"
				) {
					try {
						signerAddress = await activeSigner.getAddress();
					} catch {}
				}
				if (!ready || !activeSigner || !signerAddress) {
					console.log("⚠️ Missing signer, attempting refresh...");
					await refresh();
					await wait(600);
					// Re-check cache
					activeSigner = (cachedSigner as any) || activeSigner;
					signerAddress =
						(cachedSignerAddress as any) || signerAddress;
					// One more direct attempt
					// No direct wallet calls
					if (
						!signerAddress &&
						activeSigner &&
						typeof activeSigner.getAddress === "function"
					) {
						try {
							signerAddress = await activeSigner.getAddress();
						} catch {}
					}
				}
				if (!activeSigner || !signerAddress) {
					throw new Error("No signer available from wallet");
				}
				const isSmart = Boolean(hasSmartWallet);
				const embeddedWalletAddress = signerAddress;

				console.log("🚨 FINAL ADDRESS CHECK BEFORE ORDER CREATION:", {
					"params.userAddress (smart wallet)": params.userAddress,
					"embeddedWalletAddress (should be embedded)":
						embeddedWalletAddress,
					"addresses are different":
						params.userAddress !== embeddedWalletAddress,
				});

				// Create the order structure using the service (maker/signers differ by wallet type)
				const orderData = await predictionMarketService.createOrder(
					params.marketId,
					params.position,
					params.amount,
					params.price,
					isSmart ? (params.userAddress as string) : signerAddress, // maker
					params.market,
					params.side, // buy/sell for numeric side
					isSmart ? embeddedWalletAddress : signerAddress // signer
				);

				console.log("📝 Order structure created:", orderData);
				console.log("🔍 Address verification:", {
					"maker (smart wallet)": orderData.maker,
					"signer (embedded wallet)": orderData.signer,
					"userAddress param": params.userAddress,
					embeddedWalletAddress: embeddedWalletAddress,
					"addresses match":
						orderData.maker === params.userAddress &&
						orderData.signer === embeddedWalletAddress,
				});

				// CRITICAL: Validate that the correct token ID was used
				const actualTokenId = orderData.tokenId;
				const isCorrectTokenId = actualTokenId === expectedTokenId;

				console.log("🔍 TOKEN ID VERIFICATION:", {
					position: params.position,
					expectedTokenId: expectedTokenId,
					actualTokenId: actualTokenId,
					isCorrectTokenId: isCorrectTokenId,
					yesTokenId: params.market.yesTokenId,
					noTokenId: params.market.noTokenId,
				});

				if (!isCorrectTokenId) {
					throw new Error(
						`TOKEN ID MISMATCH! Position: ${params.position}, Expected: ${expectedTokenId}, Actual: ${actualTokenId}`
					);
				}

				console.log(
					"✅ TOKEN ID VALIDATION PASSED - Correct token ID used"
				);

				// activeSigner is resolved; no retries needed since Privy context is already loaded

				console.log("🔐 Signer ready:", {
					address: await activeSigner.getAddress(),
					hasSignTypedData:
						typeof activeSigner.signTypedData === "function",
				});

				// Resolve on-chain CTF exchange nonce for signer address
				const signerAddr = await activeSigner.getAddress();
				let onchainNonce: bigint | undefined;
				try {
					const { ethers } = await import("ethers");
					const abi = [
						"function nonces(address) view returns (uint256)",
					];
					const provider =
						(activeSigner as any).provider ??
						new ethers.JsonRpcProvider(DEFAULT_RPC_URL);
					const ex = new ethers.Contract(
						getExchangeAddress(),
						abi,
						provider
					);
					onchainNonce = await ex.nonces(signerAddr);
					console.log(
						"🔢 On-chain nonce fetched:",
						onchainNonce?.toString()
					);
				} catch (e) {
					console.warn(
						"⚠️ Failed to fetch on-chain nonce, will use service-provided value:",
						e
					);
				}

				// Define the domain and types for EIP-712 signing (EXACTLY like your script)
				const domain = {
					name: "Polymarket CTF Exchange",
					version: "1",
					chainId: 8453, // Base chain ID
					verifyingContract: getExchangeAddress(), // EXCHANGE contract
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

				// Create the order data for EIP-712 signing using numericSide
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
					side: orderData.numericSide, // Use numericSide for EIP-712 signing
					signatureType: isSmart ? 3 : 0,
				};

				console.log("📋 Signing domain:", domain);
				console.log("📋 Signing types:", types);
				console.log("📋 Order data to sign:", orderDataForSigning);
				console.log("🔍 CRITICAL: Side value for signing:", {
					side: orderDataForSigning.side,
					type: typeof orderDataForSigning.side,
					isNumber: typeof orderDataForSigning.side === "number",
					isString: typeof orderDataForSigning.side === "string",
				});

				console.log("🔍 CRITICAL: Side comparison - Signing vs API:", {
					signingSide: orderDataForSigning.side,
					signingType: typeof orderDataForSigning.side,
					apiSide: params.side,
					apiType: typeof params.side,
					correctSigning:
						typeof orderDataForSigning.side === "number" &&
						(orderDataForSigning.side === 0 ||
							orderDataForSigning.side === 1),
					correctApi:
						typeof params.side === "string" &&
						(params.side === "buy" || params.side === "sell"),
				});

				console.log(
					"🔐 COMPLETE SIGNING STRUCTURE (NUMERIC VALUES ONLY):",
					JSON.stringify(orderDataForSigning, null, 2)
				);

				console.log("🔍 DETAILED SIGNING ANALYSIS:", {
					"orderData.numericSide": orderData.numericSide,
					"typeof orderData.numericSide":
						typeof orderData.numericSide,
					"orderDataForSigning.side": orderDataForSigning.side,
					"typeof orderDataForSigning.side":
						typeof orderDataForSigning.side,
					"params.side": params.side,
					"typeof params.side": typeof params.side,
				});

				// Sign the order using the ethers signer
				console.log("🚨 ABOUT TO SIGN - Final check:", {
					"orderDataForSigning.side": orderDataForSigning.side,
					"typeof orderDataForSigning.side":
						typeof orderDataForSigning.side,
					orderDataForSigning: orderDataForSigning,
				});

				const signature = await activeSigner.signTypedData(
					domain,
					types,
					orderDataForSigning
				);
				console.log("🔐 Order signed successfully:", signature);

				// Add signature to order
				const signedOrder = {
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
					side: params.side,
					signatureType: isSmart ? 3 : 0,
					signature: signature,
					// Additional fields for server
					type: params.orderType, // Use the dropdown selection: "market" or "limit"
					size: params.amount.toString(),
					// Add price for both market and limit orders - API requires exactly 2 decimal places
					price: params.price.toFixed(2),
				};

				console.log("📋 Final signed order:", signedOrder);
				console.log("🔐 Signature details:", {
					signature: signature,
					signatureLength: signature.length,
					isHex: signature.startsWith("0x"),
				});

				console.log(
					"🌐 COMPLETE API PAYLOAD (STRING VALUES):",
					JSON.stringify(signedOrder, null, 2)
				);

				// Submit the signed order to your local server
				console.log("🌐 Submitting signed order to server...");
				console.log(
					"📤 Full order payload being sent:",
					JSON.stringify(signedOrder, null, 2)
				);

				// Debug: Check required fields
				console.log("🔍 Required fields check:", {
					type: signedOrder.type,
					side: signedOrder.side,
					size: signedOrder.size,
					hasType: Boolean(signedOrder.type),
					hasSide: Boolean(signedOrder.side),
					hasSize: Boolean(signedOrder.size),
				});

				const accessToken = await getAccessToken();
				const apiResult =
					await predictionMarketService.submitOrderToAPI(
						signedOrder,
						params.marketId,
						accessToken,
						identityToken || undefined
					);

				console.log("✅ Order submitted to server:", apiResult);

				// For now, simulate successful execution
				const result: OrderExecutionResult = {
					success: true,
					orderId: `order_${Date.now()}_${Math.random()
						.toString(36)
						.substr(2, 9)}`,
					transactionHash:
						"0x" +
						Array.from({ length: 64 }, () =>
							Math.floor(Math.random() * 16).toString(16)
						).join(""),
				};

				return result;
			} catch (error: any) {
				console.error("❌ Order execution failed:", error);
				console.error("❌ Error details:", {
					message: error.message,
					stack: error.stack,
					name: error.name,
				});

				return {
					success: false,
					error: error.message || "Order execution failed",
				};
			}
		},
		[cachedSigner, cachedSignerAddress, ready, hasSmartWallet, refresh]
	);

	// Validate trade parameters before execution
	const validateTradeParams = useCallback(
		(
			params: Partial<TradeExecutionParams>
		): {
			isValid: boolean;
			errors: string[];
		} => {
			const errors: string[] = [];

			if (!params.marketId) errors.push("Market ID is required");
			if (!params.position) errors.push("Position (Yes/No) is required");
			if (!params.amount || params.amount <= 0)
				errors.push("Valid amount is required");
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
		[]
	);

	return {
		executeTrade,
		validateTradeParams,
	};
}
