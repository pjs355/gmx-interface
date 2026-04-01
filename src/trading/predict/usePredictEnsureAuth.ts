import { useEffect, useRef, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { BrowserProvider } from "ethers";
import { OrderBuilder, ChainId } from "@predictdotfun/sdk";
import { useQueryClient } from "@tanstack/react-query";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { ensurePredictChain, getBscBrowserSigner } from "./bnbWallet";

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
	const api = usePrivateApiClient();
	const queryClient = useQueryClient();
	const attempted = useRef(false);
	const [state, setState] = useState<"idle" | "pending" | "done" | "error">(
		"idle"
	);

	useEffect(() => {
		console.log("[PredictEnsureAuth] Check: shouldAuth=", shouldAuth,
			"authenticated=", authenticated, "attempted=", attempted.current,
			"wallets=", wallets?.length ?? 0);

		if (!shouldAuth || !authenticated || attempted.current) return;

		const embedded = (wallets || []).find(
			(w: any) =>
				w?.walletClientType === "privy" || w?.connectorType === "privy"
		) as { getEthereumProvider?: () => Promise<any> } | undefined;

		if (!embedded?.getEthereumProvider) {
			console.warn("[PredictEnsureAuth] No embedded wallet with getEthereumProvider found");
			return;
		}

		attempted.current = true;
		setState("pending");
		console.log("[PredictEnsureAuth] Starting auto-auth flow...");

		(async () => {
			const ethereum = await embedded.getEthereumProvider!();
			console.log("[PredictEnsureAuth] Got ethereum provider");

			const { message } = await api.getPredictAuthMessage();
			if (!message) throw new Error("No auth message returned from backend");
			console.log("[PredictEnsureAuth] Got auth message, signing...");

			let signature: string;
			let signer: string;

			if (predictAccount) {
				await ensurePredictChain(ethereum);
				const ethSigner = await getBscBrowserSigner(ethereum);
				const builder = await OrderBuilder.make(
					ChainId.BnbMainnet,
					ethSigner as any,
					{ predictAccount }
				);
				signature = await builder.signPredictAccountMessage(message);
				signer = predictAccount;
				console.log("[PredictEnsureAuth] Signed via Smart Account:", signer.slice(0, 10));
			} else {
				const provider = new BrowserProvider(ethereum);
				const ethSigner = await provider.getSigner();
				signer = await ethSigner.getAddress();
				signature = await ethSigner.signMessage(message);
				console.log("[PredictEnsureAuth] Signed via EOA:", signer.slice(0, 10));
			}

			await api.completePredictAuth({ signer, message, signature });
			console.log("[PredictEnsureAuth] Auth complete, refetching predict-orders...");

			await queryClient.refetchQueries({
				queryKey: ["predict-orders"],
				type: "active",
			});

			setState("done");
			console.log("[PredictEnsureAuth] Session established, orders refetch finished");
		})().catch((err) => {
			console.warn("[PredictEnsureAuth] Auto-auth failed:", err?.message ?? err);
			setState("error");
		});
	}, [shouldAuth, authenticated, wallets, api, queryClient]);

	return state;
}
