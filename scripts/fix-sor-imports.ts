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
	if (!rel.startsWith("src/features/trading/sor/")) return content;

	let s = content;

	if (rel.startsWith("src/features/trading/sor/core/")) {
		s = s.replaceAll('from "./core/sor-types"', 'from "./sor-types"');
		s = s.replaceAll('from "./core/sor-api"', 'from "./sor-api"');
		s = s.replaceAll('from "./core/useSorExecution"', 'from "./useSorExecution"');
		s = s.replaceAll('from "./route/sorPreflight"', 'from "../route/sorPreflight"');
		s = s.replaceAll('from "./prefund/sorBridgeGroups"', 'from "../prefund/sorBridgeGroups"');
	} else if (rel.startsWith("src/features/trading/sor/route/")) {
		s = s.replaceAll('from "./core/sor-types"', 'from "../core/sor-types"');
	} else if (rel.startsWith("src/features/trading/sor/prefund/")) {
		s = s.replaceAll('from "./core/sor-types"', 'from "../core/sor-types"');
		s = s.replaceAll('from "./prefund/fundingStableBalances"', 'from "./fundingStableBalances"');
		s = s.replaceAll(
			'from "./prefund/fundingStableBalanceChains"',
			'from "./fundingStableBalanceChains"',
		);
		s = s.replaceAll('from "./prefund/prefundPlan"', 'from "./prefundPlan"');
	} else if (rel.startsWith("src/features/trading/sor/post-trade/")) {
		s = s.replaceAll('from "./core/sor-types"', 'from "../core/sor-types"');
		s = s.replaceAll(
			'from "./prefund/fundingStableBalances"',
			'from "../prefund/fundingStableBalances"',
		);
		s = s.replaceAll('from "./post-trade/postTradeBaseline"', 'from "./postTradeBaseline"');
	} else if (rel.startsWith("src/features/trading/sor/tests/")) {
		// already fixed by prior pass; ensure no double core/
		s = s.replaceAll('from "../core/core/', 'from "../core/');
		s = s.replaceAll('from "../prefund/prefund/', 'from "../prefund/');
	} else if (rel === "src/features/trading/sor/sorUiUtils.ts") {
		s = s.replaceAll('from "./core/sor-types"', 'from "./core/sor-types"');
	}

	if (rel === "src/features/trading/sor/index.ts") {
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
	"session/safeActions.ts": [['from "./approvalTxs"', 'from "../trade/approvalTxs"']],
	"session/PolymarketBackgroundActivation.tsx": [
		['from "./usePolymarketEoaWalletClient"', 'from "../wallet/usePolymarketEoaWalletClient"'],
	],
	"session/PolymarketDepositDeployBackgroundActivation.tsx": [
		['from "./usePolymarketEoaWalletClient"', 'from "../wallet/usePolymarketEoaWalletClient"'],
	],
	"wallet/usePolymarketEoaWalletClient.ts": [
		[
			'from "@/features/trading/polymarket/privyEmbeddedWallet"',
			'from "@/features/trading/venues/polymarket/wallet/privyEmbeddedWallet"',
		],
	],
	"trade/polyPositionSide.ts": [
		[
			'from "@/features/trading/polymarket/polymarketConditionLookup"',
			'from "@/features/trading/venues/polymarket/trade/polymarketConditionLookup"',
		],
		[
			'from "@/features/trading/polymarket/polyOutcomeTokenId"',
			'from "@/features/trading/venues/polymarket/trade/polyOutcomeTokenId"',
		],
	],
};

function fixPolymarketFile(rel: string, content: string): string {
	const suffix = rel.replace("src/features/trading/venues/polymarket/", "");
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
		.split("@/features/trading/polymarket/")
		.join("@/features/trading/venues/polymarket/trade/")
		.split("@/features/trading/dflow/")
		.join("@/features/trading/venues/dflow/quote/")
		.split("@/features/trading/predict/")
		.join("@/features/trading/venues/predict/trade/")
		.split("@/features/trading/limitless/")
		.join("@/features/trading/venues/limitless/trade/");
}

// Targeted fixes for paths that aren't under trade/
const legacyPathFixes: Array<[string, string]> = [
	[
		"@/features/trading/venues/polymarket/trade/usePolymarketClobTradingSession",
		"@/features/trading/venues/polymarket/session/usePolymarketClobTradingSession",
	],
	[
		"@/features/trading/venues/polymarket/trade/usePolymarketEnsureExecutionReady",
		"@/features/trading/venues/polymarket/session/usePolymarketEnsureExecutionReady",
	],
	[
		"@/features/trading/venues/polymarket/trade/usePolymarketEnsureDepositWalletDeployed",
		"@/features/trading/venues/polymarket/session/usePolymarketEnsureDepositWalletDeployed",
	],
	[
		"@/features/trading/venues/polymarket/trade/usePolymarketRelay",
		"@/features/trading/venues/polymarket/session/usePolymarketRelay",
	],
	[
		"@/features/trading/venues/polymarket/trade/safeActions",
		"@/features/trading/venues/polymarket/session/safeActions",
	],
	[
		"@/features/trading/venues/polymarket/trade/relayClient",
		"@/features/trading/venues/polymarket/session/relayClient",
	],
	[
		"@/features/trading/venues/polymarket/trade/PolymarketBackgroundActivation",
		"@/features/trading/venues/polymarket/session/PolymarketBackgroundActivation",
	],
	[
		"@/features/trading/venues/polymarket/trade/PolymarketDepositDeployBackgroundActivation",
		"@/features/trading/venues/polymarket/session/PolymarketDepositDeployBackgroundActivation",
	],
	[
		"@/features/trading/venues/polymarket/trade/usePolymarketEoaWalletClient",
		"@/features/trading/venues/polymarket/wallet/usePolymarketEoaWalletClient",
	],
	[
		"@/features/trading/venues/polymarket/trade/embeddedPrivyViemSend",
		"@/features/trading/venues/polymarket/wallet/embeddedPrivyViemSend",
	],
	[
		"@/features/trading/venues/polymarket/trade/privyEmbeddedWallet",
		"@/features/trading/venues/polymarket/wallet/privyEmbeddedWallet",
	],
	[
		"@/features/trading/venues/polymarket/trade/ethers5FromEip1193",
		"@/features/trading/venues/polymarket/wallet/ethers5FromEip1193",
	],
	[
		"@/features/trading/venues/polymarket/trade/usePolymarketPositions",
		"@/features/trading/venues/polymarket/portfolio/usePolymarketPositions",
	],
	[
		"@/features/trading/venues/polymarket/trade/usePolymarketTradeHistory",
		"@/features/trading/venues/polymarket/portfolio/usePolymarketTradeHistory",
	],
	[
		"@/features/trading/venues/polymarket/trade/polymarketPositionsRefetchMerge",
		"@/features/trading/venues/polymarket/portfolio/polymarketPositionsRefetchMerge",
	],
	[
		"@/features/trading/venues/polymarket/trade/PolymarketVenueCard",
		"@/features/trading/venues/polymarket/ui/PolymarketVenueCard",
	],
	[
		"@/features/trading/venues/dflow/quote/useDflowPositions",
		"@/features/trading/venues/dflow/portfolio/useDflowPositions",
	],
	[
		"@/features/trading/venues/dflow/quote/dflowPositionsApi",
		"@/features/trading/venues/dflow/portfolio/dflowPositionsApi",
	],
	[
		"@/features/trading/venues/dflow/quote/pendingDflowOutcomeMints",
		"@/features/trading/venues/dflow/portfolio/pendingDflowOutcomeMints",
	],
	[
		"@/features/trading/venues/dflow/quote/monitorDflowBooks",
		"@/features/trading/venues/dflow/catalog/monitorDflowBooks",
	],
	[
		"@/features/trading/venues/dflow/quote/dflowRouteOutcomeMint",
		"@/features/trading/venues/dflow/catalog/dflowRouteOutcomeMint",
	],
	[
		"@/features/trading/venues/dflow/quote/startDflowProofRedirect",
		"@/features/trading/venues/dflow/onboarding/startDflowProofRedirect",
	],
	[
		"@/features/trading/venues/dflow/quote/DflowProofReturnSync",
		"@/features/trading/venues/dflow/onboarding/DflowProofReturnSync",
	],
	[
		"@/features/trading/venues/predict/trade/usePredictTradingSession",
		"@/features/trading/venues/predict/session/usePredictTradingSession",
	],
	[
		"@/features/trading/venues/predict/trade/usePredictEnsureExecutionReady",
		"@/features/trading/venues/predict/session/usePredictEnsureExecutionReady",
	],
	[
		"@/features/trading/venues/predict/trade/PredictBackgroundActivation",
		"@/features/trading/venues/predict/session/PredictBackgroundActivation",
	],
	[
		"@/features/trading/venues/predict/trade/predictSingleMarketBook",
		"@/features/trading/venues/predict/book/predictSingleMarketBook",
	],
	[
		"@/features/trading/venues/predict/trade/predictBookToOrderbookSnapshot",
		"@/features/trading/venues/predict/book/predictBookToOrderbookSnapshot",
	],
	[
		"@/features/trading/venues/predict/trade/usePredictOrderbook",
		"@/features/trading/venues/predict/book/usePredictOrderbook",
	],
	[
		"@/features/trading/venues/predict/trade/usePredictPositions",
		"@/features/trading/venues/predict/portfolio/usePredictPositions",
	],
	[
		"@/features/trading/venues/predict/trade/usePredictOrders",
		"@/features/trading/venues/predict/portfolio/usePredictOrders",
	],
	[
		"@/features/trading/venues/predict/trade/predictMarketApi",
		"@/features/trading/venues/predict/portfolio/predictMarketApi",
	],
	[
		"@/features/trading/venues/predict/trade/usePredictBnbBalances",
		"@/features/trading/venues/predict/wallet/usePredictBnbBalances",
	],
	[
		"@/features/trading/venues/limitless/trade/useLimitlessEnsureExecutionReady",
		"@/features/trading/venues/limitless/session/useLimitlessEnsureExecutionReady",
	],
	[
		"@/features/trading/venues/limitless/trade/limitlessSignupWarmupBaseApprovals",
		"@/features/trading/venues/limitless/session/limitlessSignupWarmupBaseApprovals",
	],
	[
		"@/features/trading/venues/limitless/trade/LimitlessBackgroundActivation",
		"@/features/trading/venues/limitless/session/LimitlessBackgroundActivation",
	],
	[
		"@/features/trading/venues/limitless/trade/limitlessTradingApprovalsOnBase",
		"@/features/trading/venues/limitless/approvals/limitlessTradingApprovalsOnBase",
	],
	[
		"@/features/trading/venues/limitless/trade/useLimitlessPortfolioVenue",
		"@/features/trading/venues/limitless/portfolio/useLimitlessPortfolioVenue",
	],
	[
		"@/features/trading/sor/levelUpSorSigning",
		"@/features/trading/venues/levelup/execute/levelUpSorSigning",
	],
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
		if (rel.startsWith("src/features/trading/venues/polymarket/")) {
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
