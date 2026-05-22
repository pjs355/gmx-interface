/**
 * Fix broken relative imports after sor/ + venues/ restructure.
 * Run: npx tsx scripts/fix-sor-imports.ts
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");

function walkDir(dir: string, out: string[] = []): string[] {
	for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, ent.name);
		if (ent.name === "node_modules" || ent.name === "dist") continue;
		if (ent.isDirectory()) walkDir(p, out);
		else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
	}
	return out;
}

function fixSorFile(rel: string, content: string): string {
	if (!rel.startsWith("src/trading/sor/")) return content;

	let s = content;

	if (rel.startsWith("src/trading/sor/core/")) {
		s = s.replaceAll('from "./core/sor-types"', 'from "./sor-types"');
		s = s.replaceAll('from "./core/sor-api"', 'from "./sor-api"');
		s = s.replaceAll('from "./core/useSorExecution"', 'from "./useSorExecution"');
		s = s.replaceAll('from "./route/sorPreflight"', 'from "../route/sorPreflight"');
		s = s.replaceAll('from "./prefund/sorBridgeGroups"', 'from "../prefund/sorBridgeGroups"');
	} else if (rel.startsWith("src/trading/sor/route/")) {
		s = s.replaceAll('from "./core/sor-types"', 'from "../core/sor-types"');
	} else if (rel.startsWith("src/trading/sor/prefund/")) {
		s = s.replaceAll('from "./core/sor-types"', 'from "../core/sor-types"');
		s = s.replaceAll('from "./prefund/fundingStableBalances"', 'from "./fundingStableBalances"');
		s = s.replaceAll('from "./prefund/fundingStableBalanceChains"', 'from "./fundingStableBalanceChains"');
		s = s.replaceAll('from "./prefund/prefundPlan"', 'from "./prefundPlan"');
	} else if (rel.startsWith("src/trading/sor/post-trade/")) {
		s = s.replaceAll('from "./core/sor-types"', 'from "../core/sor-types"');
		s = s.replaceAll('from "./prefund/fundingStableBalances"', 'from "../prefund/fundingStableBalances"');
		s = s.replaceAll('from "./post-trade/postTradeBaseline"', 'from "./postTradeBaseline"');
	} else if (rel.startsWith("src/trading/sor/__tests__/")) {
		// already fixed by prior pass; ensure no double core/
		s = s.replaceAll('from "../core/core/', 'from "../core/');
		s = s.replaceAll('from "../prefund/prefund/', 'from "../prefund/');
	} else if (rel === "src/trading/sor/sorUiUtils.ts") {
		s = s.replaceAll('from "./core/sor-types"', 'from "./core/sor-types"');
	}

	if (rel === "src/trading/sor/index.ts") {
		s = s.replace(
			'export { SorKalshiKycShortfallBanner } from "./SorKalshiKycShortfallBanner";',
			'export { SorKalshiKycShortfallBanner } from "./core/SorKalshiKycShortfallBanner";',
		);
		s = s.replace(
			'export { SorTransientRouteErrorText } from "./SorTransientRouteErrorText";',
			'export { SorTransientRouteErrorText } from "./core/SorTransientRouteErrorText";',
		);
	}

	return s;
}

const polymarketRelativeFixes: Record<string, Array<[string, string]>> = {
	"session/usePolymarketClobTradingSession.ts": [
		['from "./polymarketBuilderCode"', 'from "../trade/polymarketBuilderCode"'],
		['from "./ethers5FromEip1193"', 'from "../wallet/ethers5FromEip1193"'],
		['from "./usePolymarketEoaWalletClient"', 'from "../wallet/usePolymarketEoaWalletClient"'],
		['from "./polymarketClobOrderResult"', 'from "../trade/polymarketClobOrderResult"'],
		['from "./polymarketOrderDebug"', 'from "../trade/polymarketOrderDebug"'],
	],
	"session/usePolymarketEnsureExecutionReady.ts": [
		['from "./usePolymarketEoaWalletClient"', 'from "../wallet/usePolymarketEoaWalletClient"'],
		['from "./approvalTxs"', 'from "../trade/approvalTxs"'],
	],
	"session/usePolymarketRelay.ts": [
		['from "./usePolymarketEoaWalletClient"', 'from "../wallet/usePolymarketEoaWalletClient"'],
	],
	"session/relayClient.ts": [
		['from "./levelUpBuilderConfig"', 'from "../trade/levelUpBuilderConfig"'],
	],
	"session/safeActions.ts": [
		['from "./approvalTxs"', 'from "../trade/approvalTxs"'],
	],
	"session/PolymarketBackgroundActivation.tsx": [
		['from "./usePolymarketEoaWalletClient"', 'from "../wallet/usePolymarketEoaWalletClient"'],
	],
	"session/PolymarketDepositDeployBackgroundActivation.tsx": [
		['from "./usePolymarketEoaWalletClient"', 'from "../wallet/usePolymarketEoaWalletClient"'],
	],
	"wallet/usePolymarketEoaWalletClient.ts": [
		[
			'from "@/trading/polymarket/privyEmbeddedWallet"',
			'from "@/trading/venues/polymarket/wallet/privyEmbeddedWallet"',
		],
	],
	"trade/polyPositionSide.ts": [
		[
			'from "@/trading/polymarket/polymarketConditionLookup"',
			'from "@/trading/venues/polymarket/trade/polymarketConditionLookup"',
		],
		[
			'from "@/trading/polymarket/polyOutcomeTokenId"',
			'from "@/trading/venues/polymarket/trade/polyOutcomeTokenId"',
		],
	],
};

function fixPolymarketFile(rel: string, content: string): string {
	const suffix = rel.replace("src/trading/venues/polymarket/", "");
	const fixes = polymarketRelativeFixes[suffix];
	if (!fixes) return content;
	let s = content;
	for (const [from, to] of fixes) {
		s = s.split(from).join(to);
	}
	return s;
}

function fixLegacyVenueImports(content: string): string {
	return content
		.split("@/trading/polymarket/")
		.join("@/trading/venues/polymarket/trade/")
		.split("@/trading/dflow/")
		.join("@/trading/venues/dflow/quote/")
		.split("@/trading/predict/")
		.join("@/trading/venues/predict/trade/")
		.split("@/trading/limitless/")
		.join("@/trading/venues/limitless/trade/");
}

// Targeted fixes for paths that aren't under trade/
const legacyPathFixes: Array<[string, string]> = [
	["@/trading/venues/polymarket/trade/usePolymarketClobTradingSession", "@/trading/venues/polymarket/session/usePolymarketClobTradingSession"],
	["@/trading/venues/polymarket/trade/usePolymarketEnsureExecutionReady", "@/trading/venues/polymarket/session/usePolymarketEnsureExecutionReady"],
	["@/trading/venues/polymarket/trade/usePolymarketEnsureDepositWalletDeployed", "@/trading/venues/polymarket/session/usePolymarketEnsureDepositWalletDeployed"],
	["@/trading/venues/polymarket/trade/usePolymarketRelay", "@/trading/venues/polymarket/session/usePolymarketRelay"],
	["@/trading/venues/polymarket/trade/safeActions", "@/trading/venues/polymarket/session/safeActions"],
	["@/trading/venues/polymarket/trade/relayClient", "@/trading/venues/polymarket/session/relayClient"],
	["@/trading/venues/polymarket/trade/PolymarketBackgroundActivation", "@/trading/venues/polymarket/session/PolymarketBackgroundActivation"],
	["@/trading/venues/polymarket/trade/PolymarketDepositDeployBackgroundActivation", "@/trading/venues/polymarket/session/PolymarketDepositDeployBackgroundActivation"],
	["@/trading/venues/polymarket/trade/usePolymarketEoaWalletClient", "@/trading/venues/polymarket/wallet/usePolymarketEoaWalletClient"],
	["@/trading/venues/polymarket/trade/embeddedPrivyViemSend", "@/trading/venues/polymarket/wallet/embeddedPrivyViemSend"],
	["@/trading/venues/polymarket/trade/privyEmbeddedWallet", "@/trading/venues/polymarket/wallet/privyEmbeddedWallet"],
	["@/trading/venues/polymarket/trade/ethers5FromEip1193", "@/trading/venues/polymarket/wallet/ethers5FromEip1193"],
	["@/trading/venues/polymarket/trade/usePolymarketPositions", "@/trading/venues/polymarket/portfolio/usePolymarketPositions"],
	["@/trading/venues/polymarket/trade/usePolymarketTradeHistory", "@/trading/venues/polymarket/portfolio/usePolymarketTradeHistory"],
	["@/trading/venues/polymarket/trade/polymarketPositionsRefetchMerge", "@/trading/venues/polymarket/portfolio/polymarketPositionsRefetchMerge"],
	["@/trading/venues/polymarket/trade/PolymarketVenueCard", "@/trading/venues/polymarket/ui/PolymarketVenueCard"],
	["@/trading/venues/dflow/quote/useDflowPositions", "@/trading/venues/dflow/portfolio/useDflowPositions"],
	["@/trading/venues/dflow/quote/dflowPositionsApi", "@/trading/venues/dflow/portfolio/dflowPositionsApi"],
	["@/trading/venues/dflow/quote/pendingDflowOutcomeMints", "@/trading/venues/dflow/portfolio/pendingDflowOutcomeMints"],
	["@/trading/venues/dflow/quote/monitorDflowBooks", "@/trading/venues/dflow/catalog/monitorDflowBooks"],
	["@/trading/venues/dflow/quote/dflowRouteOutcomeMint", "@/trading/venues/dflow/catalog/dflowRouteOutcomeMint"],
	["@/trading/venues/dflow/quote/startDflowProofRedirect", "@/trading/venues/dflow/onboarding/startDflowProofRedirect"],
	["@/trading/venues/dflow/quote/DflowProofReturnSync", "@/trading/venues/dflow/onboarding/DflowProofReturnSync"],
	["@/trading/venues/predict/trade/usePredictTradingSession", "@/trading/venues/predict/session/usePredictTradingSession"],
	["@/trading/venues/predict/trade/usePredictEnsureExecutionReady", "@/trading/venues/predict/session/usePredictEnsureExecutionReady"],
	["@/trading/venues/predict/trade/PredictBackgroundActivation", "@/trading/venues/predict/session/PredictBackgroundActivation"],
	["@/trading/venues/predict/trade/predictSingleMarketBook", "@/trading/venues/predict/book/predictSingleMarketBook"],
	["@/trading/venues/predict/trade/predictBookToOrderbookSnapshot", "@/trading/venues/predict/book/predictBookToOrderbookSnapshot"],
	["@/trading/venues/predict/trade/usePredictOrderbook", "@/trading/venues/predict/book/usePredictOrderbook"],
	["@/trading/venues/predict/trade/usePredictPositions", "@/trading/venues/predict/portfolio/usePredictPositions"],
	["@/trading/venues/predict/trade/usePredictOrders", "@/trading/venues/predict/portfolio/usePredictOrders"],
	["@/trading/venues/predict/trade/predictMarketApi", "@/trading/venues/predict/portfolio/predictMarketApi"],
	["@/trading/venues/predict/trade/usePredictBnbBalances", "@/trading/venues/predict/wallet/usePredictBnbBalances"],
	["@/trading/venues/limitless/trade/useLimitlessEnsureExecutionReady", "@/trading/venues/limitless/session/useLimitlessEnsureExecutionReady"],
	["@/trading/venues/limitless/trade/limitlessSignupWarmupBaseApprovals", "@/trading/venues/limitless/session/limitlessSignupWarmupBaseApprovals"],
	["@/trading/venues/limitless/trade/LimitlessBackgroundActivation", "@/trading/venues/limitless/session/LimitlessBackgroundActivation"],
	["@/trading/venues/limitless/trade/limitlessTradingApprovalsOnBase", "@/trading/venues/limitless/approvals/limitlessTradingApprovalsOnBase"],
	["@/trading/venues/limitless/trade/useLimitlessPortfolioVenue", "@/trading/venues/limitless/portfolio/useLimitlessPortfolioVenue"],
	["@/trading/sor/levelUpSorSigning", "@/trading/venues/levelup/execute/levelUpSorSigning"],
];

function applyLegacyPathFixes(content: string): string {
	let s = content;
	for (const [from, to] of legacyPathFixes) {
		s = s.split(from).join(to);
	}
	return s;
}

function main(): void {
	const files = walkDir(SRC);
	for (const file of files) {
		const rel = path.relative(ROOT, file);
		let next = fs.readFileSync(file, "utf8");
		const orig = next;
		next = fixSorFile(rel, next);
		if (rel.startsWith("src/trading/venues/polymarket/")) {
			next = fixPolymarketFile(rel, next);
		}
		next = fixLegacyVenueImports(next);
		next = applyLegacyPathFixes(next);
		if (next !== orig) {
			fs.writeFileSync(file, next);
			console.log(`fixed: ${rel}`);
		}
	}
	console.log("Done.");
}

main();
