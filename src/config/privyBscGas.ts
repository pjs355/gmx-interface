/**
 * Privy embedded-wallet gas sponsorship on BNB Smart Chain (Predict.fun txs, LI.FI from BNB).
 *
 * Default is **off**: you pay BNB for gas. Set `VITE_PRIVY_SPONSOR_BSC_GAS=true` in `.env`
 * when Privy sponsorship should be requested again.
 */
export const PRIVY_SPONSOR_BSC_GAS =
	import.meta.env.VITE_PRIVY_SPONSOR_BSC_GAS === "true";
