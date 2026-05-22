import { useEffect, useRef, useState } from "react";
import { usePrivy, useWallets, useSendTransaction } from "@privy-io/react-auth";
import { BrowserProvider } from "ethers";
import { OrderBuilder, ChainId } from "@predictdotfun/sdk";
import { useQueryClient } from "@tanstack/react-query";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { ensurePredictChain, getBscBrowserSigner } from "../wallet/bnbWallet";

const predictAccount =
	import.meta.env.VITE_PREDICT_ACCOUNT_ADDRESS?.trim() || undefined;

/**
 * Silently ensures a Predict.fun auth session exists so the
 * `/api/predict/orders` endpoint can return cost-basis data.
 *
 * Only runs once per mount when `shouldAuth` is true. After a
 * successful auth, invalidates the `predict-orders` React Query
 * cache so cost/avg-price columns refresh automatically.
 */
export function usePredictEnsureAuth(shouldAuth: boolean) {
	const { authenticated } = usePrivy();
	const { wallets } = useWallets();
	const { sendTransaction: privyEvmSendTransaction } = useSendTransaction();
	const api = usePrivateApiClient();
	const queryClient = useQueryClient();
	const attempted = useRef(false);
	const [state, setState] = useState<"idle" | "pending" | "done" | "error">(
		"idle"
	);

	useEffect(() => {
		if (!shouldAuth || !authenticated || attempted.current) return;

		const embedded = (wallets || []).find(
			(w: any) =>
				w?.walletClientType === "privy" || w?.connectorType === "privy"
		) as
			| { getEthereumProvider?: () => Promise<any>; address?: string }
			| undefined;

		if (!embedded?.getEthereumProvider || !embedded.address) {
			console.warn("[PredictEnsureAuth] No embedded wallet with getEthereumProvider found");
			return;
		}
		const address = embedded.address as `0x${string}`;

		attempted.current = true;
		setState("pending");

		(async () => {
			const ethereum = await embedded.getEthereumProvider!();

			const { message } = await api.getPredictAuthMessage();
			if (!message) throw new Error("No auth message returned from backend");

			let signature: string;
			let signer: string;

			if (predictAccount) {
				await ensurePredictChain(ethereum);
				const ethSigner = await getBscBrowserSigner({
					ethereum,
					address,
					sendTransaction: privyEvmSendTransaction,
				});
				const builder = await OrderBuilder.make(
					ChainId.BnbMainnet,
					ethSigner as any,
					{ predictAccount }
				);
				signature = await builder.signPredictAccountMessage(message);
				signer = predictAccount;
			} else {
				const provider = new BrowserProvider(ethereum);
				const ethSigner = await provider.getSigner();
				signer = await ethSigner.getAddress();
				signature = await ethSigner.signMessage(message);
			}

			await api.completePredictAuth({ signer, message, signature });

			await queryClient.refetchQueries({
				queryKey: ["predict-orders"],
				type: "active",
			});

			setState("done");
		})().catch((err) => {
			console.warn("[PredictEnsureAuth] Auto-auth failed:", err?.message ?? err);
			setState("error");
		});
	}, [shouldAuth, authenticated, wallets, api, queryClient, privyEvmSendTransaction]);

	return state;
}
