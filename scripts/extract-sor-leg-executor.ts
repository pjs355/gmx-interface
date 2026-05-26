/**
 * Extract useSorLegExecutor venue cases + bridge into sor/execute/ and venue execute modules.
 * Run once: npx tsx scripts/extract-sor-leg-executor.ts
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");
const EXECUTOR = path.join(SRC, "features/trading/sor/core/useSorLegExecutor.ts");

const lines = fs.readFileSync(EXECUTOR, "utf8").split("\n");

function slice(start: number, end: number): string {
	return lines.slice(start - 1, end).join("\n");
}

/** Strip case wrapper: `case "x": {` … `}` before next case/default */
function unwrapCaseBody(body: string, caseLabel: string): string {
	const open = `\t\t\t\tcase "${caseLabel}": {`;
	if (!body.startsWith(open)) {
		throw new Error(`Expected case ${caseLabel} wrapper`);
	}
	let inner = body.slice(open.length).trimStart();
	if (inner.endsWith("\t\t\t\t}")) {
		inner = inner.slice(0, -4).trimEnd();
	} else if (inner.endsWith("}")) {
		inner = inner.slice(0, -1).trimEnd();
	}
	return inner;
}

const levelupBody = unwrapCaseBody(slice(655, 801), "levelup");
const polymarketBody = unwrapCaseBody(slice(805, 1110), "polymarket");
const dflowBody = unwrapCaseBody(slice(1113, 1286), "dflow");
const limitlessBody = unwrapCaseBody(slice(1289, 1657), "limitless");
const predictBody = unwrapCaseBody(slice(1660, 1886), "predictfun");
const bridgeBody = slice(1949, 2553); // inside executeBridge callback, after fundingAddresses resolve

const helpersBody = slice(157, 305); // through BridgeResult type removal - we'll split manually
const depsBody = slice(300, 485); // UseSorLegExecutorDeps + address helpers start

// helpers: 157-298 (before export interface)
const legHelpers = slice(157, 298);
const bridgeHelpers = slice(470, 542);

function write(rel: string, content: string): void {
	const full = path.join(SRC, rel);
	fs.mkdirSync(path.dirname(full), { recursive: true });
	fs.writeFileSync(full, content);
	console.log(`wrote ${rel}`);
}

write(
	"features/trading/sor/execute/helpers.ts",
	`${legHelpers.replace(/^function /gm, "export function ")}
`,
);

write(
	"features/trading/sor/execute/bridgeHelpers.ts",
	`import { CHAIN_LIFI_IDS } from "@/features/trading/sor/core/sor-types";
import type { AccountWalletRoles } from "@/context/accountWallets";
import { pickLifiSourceTxHashForStatus } from "@/features/trading/lifi/pickLifiSourceTxHashForStatus";
import type { PrefundStep } from "@/features/trading/sor/prefund/prefundPlan";

${bridgeHelpers
	.replace(/^type SorChainKey/gm, "type SorChainKey")
	.replace(/^function /gm, "export function ")
	.replace(/^const SOLANA/gm, "export const SOLANA")}
`,
);

const venueLegHeader = `import type { VenueLegDispatchInput } from "@/features/trading/sor/execute/venueLegContext";
import type { SorLegResult } from "@/features/trading/sor/execute/types";

export async function executeLeg(input: VenueLegDispatchInput): Promise<SorLegResult> {
	const {
		leg,
		side,
		routeCtx,
		fundingAddresses,
		isLimit,
		limitPrice,
		deps,
		reportSorExecutionPhase,
		privyEvmSendTransaction,
	} = input;
`;

const venueLegFooter = `
}
`;

function indentCase(body: string): string {
	return body
		.split("\n")
		.map((l) => (l.length ? `\t${l}` : l))
		.join("\n");
}

function genVenueLeg(venuePath: string, fnName: string, body: string, extraImports: string): void {
	const destructuring = `
	const {
		tradeExecutionService,
		polyClob,
		predictSession,
		privateApi,
		market,
		matchedMonitor,
		umbrellaId,
		predictNumericId,
		predictMarketDetail,
		account,
		getClientForChain,
		solanaSigner,
		getRelayClient,
		dflowProofVerified,
		predictApprovalsOk,
		predictTokenId,
		ensureLevelUpApprovals,
		ensurePredictApprovals,
		ensurePolymarketApprovals,
		ensureLimitlessApprovals,
		buildLimitlessSignedOrderFromMarket,
		getLimitlessOwnerId,
		getLimitlessMakerAddress,
		ensureDflowProofVerified,
	} = deps;
`;
	write(
		venuePath,
		`${extraImports}
${venueLegHeader}${destructuring}
${indentCase(body)}
${venueLegFooter}`,
	);
}

// Read original imports from executor for venue-specific imports - use full import block from file
const importBlock = slice(1, 151);

genVenueLeg(
	"features/trading/venues/levelup/execute/executeLeg.ts",
	"executeLevelUpLeg",
	levelupBody,
	importBlock,
);
genVenueLeg(
	"features/trading/venues/polymarket/execute/executeLeg.ts",
	"executePolymarketLeg",
	polymarketBody,
	importBlock +
		'\nimport { isPolymarketAllowanceRecoverableError } from "@/features/trading/sor/execute/helpers";\n',
);
genVenueLeg(
	"features/trading/venues/dflow/execute/executeLeg.ts",
	"executeDflowLeg",
	dflowBody,
	importBlock +
		'\nimport { sumDflowFillOutBaseUnitsForOutputMint } from "@/features/trading/sor/execute/helpers";\n',
);
genVenueLeg(
	"features/trading/venues/limitless/execute/executeLeg.ts",
	"executeLimitlessLeg",
	limitlessBody,
	importBlock +
		'\nimport { floorLimitlessFokMakerAmountHuman, interpretLimitlessDelegatedOrderResponse } from "@/features/trading/sor/execute/helpers";\n',
);
genVenueLeg(
	"features/trading/venues/predict/execute/executeLeg.ts",
	"executePredictLeg",
	predictBody,
	importBlock,
);

write(
	"features/trading/sor/execute/venueLegContext.ts",
	`import type { MutableRefObject } from "react";
import type { AccountWalletRoles } from "@/context/accountWallets";
import type { RouteLeg } from "@/features/trading/sor/core/sor-types";
import type { SorExecutionPhase, SorLegRouteContext } from "@/features/trading/sor/core/useSorExecution";
import type { UseSorLegExecutorDeps } from "@/features/trading/sor/execute/deps";

/** Privy \`sendTransaction\` from \`useSendTransaction()\`. */
export type PrivyEvmSendTransaction = (input: {
	to: \`0x\${string}\`;
	data?: \`0x\${string}\`;
	value?: bigint;
	chainId?: number;
}) => Promise<{ hash?: string } | string>;

export type VenueLegDispatchInput = {
	leg: RouteLeg;
	side: "buy" | "sell";
	routeCtx?: SorLegRouteContext;
	fundingAddresses: AccountWalletRoles;
	isLimit: boolean;
	limitPrice: number | undefined;
	deps: UseSorLegExecutorDeps;
	reportSorExecutionPhase: (phase: SorExecutionPhase) => void;
	privyEvmSendTransaction: PrivyEvmSendTransaction;
};

export type SorBridgeExecuteInput = {
	leg: RouteLeg;
	fundingAddresses: AccountWalletRoles;
	opts?: {
		amountUsdOverride?: number;
		budgetUsdOverride?: number;
		onPrefundProgress?: (p: { current: number; total: number }) => void;
		strictLifiDestMinAtSendCap?: boolean;
	};
	deps: UseSorLegExecutorDeps;
	reportSorExecutionPhase: (phase: SorExecutionPhase) => void;
	privyEvmSendTransaction: PrivyEvmSendTransaction;
	getSignerForChain: ReturnType<
		typeof import("@/features/trading/lifi/useFundingLifiExecution").useFundingLifiExecution
	>["getSignerForChain"];
	preparePolygonRelay: ReturnType<
		typeof import("@/features/trading/lifi/useFundingLifiExecution").useFundingLifiExecution
	>["preparePolygonRelay"];
	buildExecuteLifiStepsOptions: ReturnType<
		typeof import("@/features/trading/lifi/useFundingLifiExecution").useFundingLifiExecution
	>["buildExecuteLifiStepsOptions"];
};
`,
);

// deps.ts - extract interface only (lines 300-485 but interface ends before addressForChain)
const depsInterface = slice(300, 468);
write(
	"features/trading/sor/execute/deps.ts",
	`${slice(1, 12).replace('from "./sor-types"', 'from "@/features/trading/sor/core/sor-types"')}
import type { MutableRefObject } from "react";
import type { RelayClient } from "@polymarket/builder-relayer-client";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { MatchedMarket } from "@/types/odds-monitor";
import type { PredictMarketDetail } from "@/features/trading/venues/predict/portfolio/predictMarketApi";
import type { Book } from "@predictdotfun/sdk";
import type { TradeExecutionParams } from "@/components/PredictionMarketTradeBox/types";
import type { SolanaSignerCapable, SendTransactionCapable } from "@/features/trading/lifi/sendTransactionTypes";
import type {
	BaseSmartWalletPendingUsdc,
} from "@/types/trading";
import type {
	DflowOrderParams,
	DflowOrderStatusResponse,
	DflowOrderSubmitBody,
	DflowOrderSubmitResponse,
} from "@/services/privateApi/client";
import type { SorExecutionPhase } from "@/features/trading/sor/core/useSorExecution";
import type { BuildLimitlessSorOrderInput } from "@/features/trading/venues/limitless/trade/limitlessSignedClobOrder";
import type { LimitlessSignedOrderSubmit } from "@/features/trading/venues/limitless/trade/limitlessPrivateApiTypes";
import type { AccountWalletGate, VenueAddressChainMap } from "@/context/accountWallets";

${depsInterface.replace("export interface UseSorLegExecutorDeps", "export interface UseSorLegExecutorDeps")}
`,
);

write(
	"features/trading/sor/execute/dispatchLeg.ts",
	`import { formatUnknownSorVenue, userMessage, SOR_MISSING_LIMIT_PRICE, SOR_REFUSE_BRIDGE_ON_SELL } from "@/errors";
import type { RouteLeg, SorVenue } from "@/features/trading/sor/core/sor-types";
import type { SorLegResult } from "@/features/trading/sor/execute/types";
import type { VenueLegDispatchInput } from "@/features/trading/sor/execute/venueLegContext";
import { executeLeg as executeDflowLeg } from "@/features/trading/venues/dflow/execute/executeLeg";
import { executeLeg as executeLevelUpLeg } from "@/features/trading/venues/levelup/execute/executeLeg";
import { executeLeg as executeLimitlessLeg } from "@/features/trading/venues/limitless/execute/executeLeg";
import { executeLeg as executePolymarketLeg } from "@/features/trading/venues/polymarket/execute/executeLeg";
import { executeLeg as executePredictLeg } from "@/features/trading/venues/predict/execute/executeLeg";

export async function dispatchSorLeg(
	input: Omit<VenueLegDispatchInput, "isLimit" | "limitPrice"> & {
		leg: RouteLeg;
		side: "buy" | "sell";
	},
): Promise<SorLegResult> {
	const { leg, side } = input;

	if (side === "sell" && leg.bridge !== null) {
		return {
			filled: false,
			filledShares: 0,
			error: userMessage(SOR_REFUSE_BRIDGE_ON_SELL),
		};
	}

	const isLimit = leg.orderType === "limit";
	const limitPrice =
		isLimit && typeof leg.limitPriceCents === "number"
			? leg.limitPriceCents / 100
			: undefined;

	if (isLimit && (limitPrice == null || limitPrice <= 0 || limitPrice >= 1)) {
		return {
			filled: false,
			filledShares: 0,
			error: userMessage(SOR_MISSING_LIMIT_PRICE),
		};
	}

	const ctx: VenueLegDispatchInput = {
		...input,
		isLimit,
		limitPrice,
	};

	const venue: SorVenue = leg.venue;
	switch (venue) {
		case "levelup":
			return executeLevelUpLeg(ctx);
		case "polymarket":
			return executePolymarketLeg(ctx);
		case "dflow":
			return executeDflowLeg(ctx);
		case "limitless":
			return executeLimitlessLeg(ctx);
		case "predictfun":
			return executePredictLeg(ctx);
		default:
			return {
				filled: false,
				filledShares: 0,
				error: formatUnknownSorVenue(String(venue)),
			};
	}
}
`,
);

write(
	"features/trading/sor/execute/executeBridge.ts",
	`${importBlock.replace('from "./sor-types"', 'from "@/features/trading/sor/core/sor-types"').replace('from "./useSorExecution"', 'from "@/features/trading/sor/core/useSorExecution"')}
import type { SorBridgeResult } from "@/features/trading/sor/execute/types";
import type { SorBridgeExecuteInput } from "@/features/trading/sor/execute/venueLegContext";
import {
	addressForChain,
	maskFundingAddress,
	pickBridgeSourceTxHashForLifiStatus,
	prefundSourceAddressForStep,
	SOLANA_LIFI_CHAIN_ID,
} from "@/features/trading/sor/execute/bridgeHelpers";
import { scwPendingMicrosToHumanUsd } from "@/features/trading/sor/execute/helpers";

export async function executeSorBridge(
	input: SorBridgeExecuteInput,
): Promise<SorBridgeResult> {
	const {
		leg,
		fundingAddresses,
		opts,
		deps,
		reportSorExecutionPhase,
		privyEvmSendTransaction,
		getSignerForChain,
		preparePolygonRelay,
		buildExecuteLifiStepsOptions,
	} = input;
	const { privateApi, solanaSigner, getClientForChain } = deps;

${indentCase(bridgeBody.replace(/^\t\t\t/gm, "\t"))}
}
`,
);

console.log(
	"Extraction complete. Replace useSorLegExecutor.ts with thin hook manually or re-run hook generator.",
);
