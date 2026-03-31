export type PolymarketExecutionGate = {
	blocked: boolean;
	reasonCodes: string[];
	messages: string[];
	isLoading: boolean;
};

const DISABLED_GATE: PolymarketExecutionGate = {
	blocked: false,
	reasonCodes: [],
	messages: [],
	isLoading: false,
};

/**
 * Prediction market execution is not gated on `GET …/account-overview` routing flags.
 * Readiness for Polymarket CLOB follows the same wallet resolution as Transfers / LI.FI
 * (`useFundingAddresses`); LevelUp venue uses on-chain wallet + approvals only.
 */
export function usePolymarketExecutionGate(): PolymarketExecutionGate {
	return DISABLED_GATE;
}
