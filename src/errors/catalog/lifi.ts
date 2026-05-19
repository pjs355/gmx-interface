import { defineError } from "../types";

/** LI.FI / bridge / prefund (transfers UI + SOR bridge legs + executeLifiSteps). */

export const LIFI_NO_BRIDGE_DATA = defineError(
	"LIFI_NO_BRIDGE_DATA",
	"No bridge data for this transfer.",
);
export const LIFI_BRIDGE_FAILED = defineError(
	"LIFI_BRIDGE_FAILED",
	"Transfer failed. Try again.",
);
export const LIFI_NO_BRIDGE_STEPS = defineError(
	"LIFI_NO_BRIDGE_STEPS",
	"Bridge quote returned no steps. Refresh the amount and try again.",
);
export const LIFI_NO_TX_HASH = defineError(
	"LIFI_NO_TX_HASH",
	"Transfer did not produce a transaction hash.",
);
export const LIFI_NO_TX_HASH_WALLET = defineError(
	"LIFI_NO_TX_HASH_WALLET",
	"Wallet did not return a transaction hash.",
);
export const LIFI_NO_WALLET_FOR_CHAIN = defineError(
	"LIFI_NO_WALLET_FOR_CHAIN",
	"No wallet is connected for the source chain.",
);
export const LIFI_INVALID_WALLET_ADDRESS = defineError(
	"LIFI_INVALID_WALLET_ADDRESS",
	"Wallet address is invalid for this route.",
);
export const LIFI_INVALID_WALLET_ADDRESS_RETRY = defineError(
	"LIFI_INVALID_WALLET_ADDRESS_RETRY",
	"Wallet address is invalid for this route. Refresh and try again.",
);
export const LIFI_INSUFFICIENT_BALANCE = defineError(
	"LIFI_INSUFFICIENT_BALANCE",
	"Insufficient balance in the source wallet for this amount.",
);
export const LIFI_SOLANA_WALLET_UNAVAILABLE = defineError(
	"LIFI_SOLANA_WALLET_UNAVAILABLE",
	"Solana wallet is unavailable. Reload the page and try again.",
);
export const LIFI_POLY_EMBEDDED_WALLET_LOADING = defineError(
	"LIFI_POLY_EMBEDDED_WALLET_LOADING",
	"Transfers from Polymarket need your embedded wallet. Wait for it to finish loading or reconnect.",
);
export const LIFI_STATUS_NO_FIELD = defineError(
	"LIFI_STATUS_NO_FIELD",
	"Transfer status could not be confirmed. Check your wallet history.",
);
export const LIFI_STATUS_FAILED = defineError(
	"LIFI_STATUS_FAILED",
	"Transfer did not complete on chain. Check your wallet and try again.",
);
export const LIFI_STATUS_UNEXPECTED = defineError(
	"LIFI_STATUS_UNEXPECTED",
	"Transfer ended in an unexpected state. Check your wallet and try again.",
);
export const LIFI_POLL_TIMEOUT = defineError(
	"LIFI_POLL_TIMEOUT",
	"Transfer is taking longer than expected. Check your wallet before retrying.",
);
export const LIFI_INVALID_RECIPIENT = defineError(
	"LIFI_INVALID_RECIPIENT",
	"Recipient address is invalid.",
);
export const LIFI_WITHDRAW_STEP_FAILED = defineError(
	"LIFI_WITHDRAW_STEP_FAILED",
	"Withdraw step failed.",
);
export const LIFI_SCW_LIMITLESS_SWEEP_NOT_PLANNED = defineError(
	"LIFI_SCW_LIMITLESS_SWEEP_NOT_PLANNED",
	"Limitless prefund sweep was not planned for this route.",
);
export const LIFI_STEP_FAILED = defineError(
	"LIFI_STEP_FAILED",
	"A transfer step failed. Try again.",
);
export const LIFI_NO_WALLET_CLIENT = defineError(
	"LIFI_NO_WALLET_CLIENT",
	"No wallet client is available for this chain.",
);
export const LIFI_RELAYER_NO_TX_HASH = defineError(
	"LIFI_RELAYER_NO_TX_HASH",
	"Relayer did not return a transaction hash.",
);
export const LIFI_POLY_RELAY_REQUIRES_EMBEDDED = defineError(
	"LIFI_POLY_RELAY_REQUIRES_EMBEDDED",
	"Polymarket transfer requires your embedded wallet.",
);
export const LIFI_EMBEDDED_ADDRESS_UNAVAILABLE = defineError(
	"LIFI_EMBEDDED_ADDRESS_UNAVAILABLE",
	"Embedded wallet address is unavailable.",
);
export const LIFI_QUOTE_FAILED = defineError(
	"LIFI_QUOTE_FAILED",
	"Could not fetch a bridge quote. Try again.",
);
