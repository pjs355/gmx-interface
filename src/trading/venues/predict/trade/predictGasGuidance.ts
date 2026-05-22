/**
 * Predict approvals / txs on BNB use native BNB for gas unless Privy TEE sponsorship
 * is active. USDT (or funds on Base/Polygon) does not pay gas. LI.FI / Transfers move
 * tokens, not gas, unless you bridge to native BNB.
 */
export function enrichPredictGasOrFundsErrorMessage(message: string): string {
	const m = message.toLowerCase();
	const looksLikeGas =
		m.includes("insufficient funds") ||
		m.includes("insufficient_funds") ||
		m.includes("overshot") ||
		m.includes("intrinsic transaction cost") ||
		m.includes("balance 0,") ||
		m.includes("balance 0 ");
	if (!looksLikeGas) return message;

	if (message.includes("Transfers (LI.FI)")) return message;

	const sponsorshipHint =
		" The app requests Privy TEE gas sponsorship on BSC; if you still see this, confirm Gas sponsorship + BSC + TEE execution are enabled in the Privy Dashboard.";
	const bridgeHint =
		" To move USDT or USDC from another chain to BNB Chain, use Transfers (LI.FI) first—that funds trading collateral but does not add BNB for gas unless you bridge or buy native BNB.";

	return `${message}${sponsorshipHint}${bridgeHint}`;
}
