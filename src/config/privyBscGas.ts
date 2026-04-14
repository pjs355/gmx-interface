/**
 * Privy embedded-wallet gas sponsorship on BNB Smart Chain (Predict.fun txs, LI.FI from BNB).
 *
 * Default is **on**. Set `VITE_PRIVY_DISABLE_BSC_GAS_SPONSOR=true` to pay BNB gas locally
 * (debugging). Legacy: `VITE_PRIVY_SPONSOR_BSC_GAS=false` also disables sponsorship.
 */
const bscSponsorshipExplicitlyDisabled =
	import.meta.env.VITE_PRIVY_DISABLE_BSC_GAS_SPONSOR === "true" ||
	import.meta.env.VITE_PRIVY_SPONSOR_BSC_GAS === "false";

export const PRIVY_SPONSOR_BSC_GAS = !bscSponsorshipExplicitlyDisabled;
