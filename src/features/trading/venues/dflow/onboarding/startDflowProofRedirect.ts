import bs58 from "bs58";

import type { DflowVerifyResponse } from "@/services/privateApi";

type MinimalDflowApi = {
	getDflowVerify(): Promise<DflowVerifyResponse>;
};

export type DflowProofSignMessage = (opts: { message: Uint8Array }) => Promise<Uint8Array>;

export type StartDflowProofRedirectResult = "redirected" | "already_verified";

/**
 * Same flow as Profile → “Get Verified”: sign the server message and redirect to Proof / DFlow.
 * Caller supplies the full post-Proof return URL (typically current page with `dflow_proof=1`).
 */
export async function startDflowProofRedirect(
	api: MinimalDflowApi,
	signMessage: DflowProofSignMessage,
	proofReturnUrl: string,
): Promise<StartDflowProofRedirectResult> {
	const result = await api.getDflowVerify();
	if (result.verified === true) {
		return "already_verified";
	}

	const messageBytes = new TextEncoder().encode(result.proofMessage);
	const sigBytes = await signMessage({ message: messageBytes });
	const sigBase58 = bs58.encode(sigBytes);
	const walletPubkey = result.solanaWalletAddress;

	const redirectUri = encodeURIComponent(proofReturnUrl);
	const proofUrl =
		`${result.proofRedirectBase}?wallet=${walletPubkey}` +
		`&signature=${sigBase58}` +
		`&timestamp=${result.timestamp}` +
		`&redirect_uri=${redirectUri}`;

	window.location.href = proofUrl;
	return "redirected";
}
