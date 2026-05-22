/**
 * One-time migration: trading/polymarket|dflow|predict|limitless → venues/*,
 * sor/* → sor/{core,route,prefund,post-trade}/.
 *
 * Run: npx tsx scripts/migrate-trading-structure.ts
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");

type Move = { from: string; to: string };

const moves: Move[] = [
	// ── Polymarket ──
	{ from: "trading/polymarket/usePolymarketClobTradingSession.ts", to: "trading/venues/polymarket/session/usePolymarketClobTradingSession.ts" },
	{ from: "trading/polymarket/usePolymarketEnsureExecutionReady.ts", to: "trading/venues/polymarket/session/usePolymarketEnsureExecutionReady.ts" },
	{ from: "trading/polymarket/usePolymarketEnsureDepositWalletDeployed.ts", to: "trading/venues/polymarket/session/usePolymarketEnsureDepositWalletDeployed.ts" },
	{ from: "trading/polymarket/PolymarketBackgroundActivation.tsx", to: "trading/venues/polymarket/session/PolymarketBackgroundActivation.tsx" },
	{ from: "trading/polymarket/PolymarketDepositDeployBackgroundActivation.tsx", to: "trading/venues/polymarket/session/PolymarketDepositDeployBackgroundActivation.tsx" },
	{ from: "trading/polymarket/relayClient.ts", to: "trading/venues/polymarket/session/relayClient.ts" },
	{ from: "trading/polymarket/safeActions.ts", to: "trading/venues/polymarket/session/safeActions.ts" },
	{ from: "trading/polymarket/usePolymarketRelay.ts", to: "trading/venues/polymarket/session/usePolymarketRelay.ts" },
	{ from: "trading/polymarket/POLYMARKET_TRADING.md", to: "trading/venues/polymarket/session/POLYMARKET_TRADING.md" },
	{ from: "trading/polymarket/usePolymarketEoaWalletClient.ts", to: "trading/venues/polymarket/wallet/usePolymarketEoaWalletClient.ts" },
	{ from: "trading/polymarket/embeddedPrivyViemSend.ts", to: "trading/venues/polymarket/wallet/embeddedPrivyViemSend.ts" },
	{ from: "trading/polymarket/privyEmbeddedWallet.ts", to: "trading/venues/polymarket/wallet/privyEmbeddedWallet.ts" },
	{ from: "trading/polymarket/ethers5FromEip1193.ts", to: "trading/venues/polymarket/wallet/ethers5FromEip1193.ts" },
	{ from: "trading/polymarket/usePolymarketPositions.ts", to: "trading/venues/polymarket/portfolio/usePolymarketPositions.ts" },
	{ from: "trading/polymarket/usePolymarketTradeHistory.ts", to: "trading/venues/polymarket/portfolio/usePolymarketTradeHistory.ts" },
	{ from: "trading/polymarket/polymarketPositionsRefetchMerge.ts", to: "trading/venues/polymarket/portfolio/polymarketPositionsRefetchMerge.ts" },
	{ from: "trading/polymarket/polymarketClobOrderResult.ts", to: "trading/venues/polymarket/trade/polymarketClobOrderResult.ts" },
	{ from: "trading/polymarket/polymarketSellShareClamp.ts", to: "trading/venues/polymarket/trade/polymarketSellShareClamp.ts" },
	{ from: "trading/polymarket/polymarketSellShareClamp.test.ts", to: "trading/venues/polymarket/trade/polymarketSellShareClamp.test.ts" },
	{ from: "trading/polymarket/polyOutcomeTokenId.ts", to: "trading/venues/polymarket/trade/polyOutcomeTokenId.ts" },
	{ from: "trading/polymarket/polyPositionSide.ts", to: "trading/venues/polymarket/trade/polyPositionSide.ts" },
	{ from: "trading/polymarket/monitorOrderbookAdapter.ts", to: "trading/venues/polymarket/trade/monitorOrderbookAdapter.ts" },
	{ from: "trading/polymarket/polygonCollateralWrap.ts", to: "trading/venues/polymarket/trade/polygonCollateralWrap.ts" },
	{ from: "trading/polymarket/approvalTxs.ts", to: "trading/venues/polymarket/trade/approvalTxs.ts" },
	{ from: "trading/polymarket/polymarketBuilderCode.ts", to: "trading/venues/polymarket/trade/polymarketBuilderCode.ts" },
	{ from: "trading/polymarket/levelUpBuilderConfig.ts", to: "trading/venues/polymarket/trade/levelUpBuilderConfig.ts" },
	{ from: "trading/polymarket/normalizeBuilderSignTimestamp.ts", to: "trading/venues/polymarket/trade/normalizeBuilderSignTimestamp.ts" },
	{ from: "trading/polymarket/polymarketConditionLookup.ts", to: "trading/venues/polymarket/trade/polymarketConditionLookup.ts" },
	{ from: "trading/polymarket/polymarketOrderDebug.ts", to: "trading/venues/polymarket/trade/polymarketOrderDebug.ts" },
	{ from: "trading/polymarket/constants.ts", to: "trading/venues/polymarket/trade/constants.ts" },
	{ from: "trading/polymarket/__tests__/usePolymarketEnsureExecutionReady.test.tsx", to: "trading/venues/polymarket/session/__tests__/usePolymarketEnsureExecutionReady.test.tsx" },
	{ from: "trading/venues/polymarket/PolymarketVenueCard.tsx", to: "trading/venues/polymarket/ui/PolymarketVenueCard.tsx" },

	// ── DFlow ──
	{ from: "trading/dflow/quoteSignAndSubmitDflowOrder.ts", to: "trading/venues/dflow/quote/quoteSignAndSubmitDflowOrder.ts" },
	{ from: "trading/dflow/dflowOrderQuoteTypes.ts", to: "trading/venues/dflow/quote/dflowOrderQuoteTypes.ts" },
	{ from: "trading/dflow/dflowOutcomeAmount.ts", to: "trading/venues/dflow/quote/dflowOutcomeAmount.ts" },
	{ from: "trading/dflow/dflowOutcomeAmount.test.ts", to: "trading/venues/dflow/quote/dflowOutcomeAmount.test.ts" },
	{ from: "trading/dflow/useDflowPositions.ts", to: "trading/venues/dflow/portfolio/useDflowPositions.ts" },
	{ from: "trading/dflow/dflowPositionsApi.ts", to: "trading/venues/dflow/portfolio/dflowPositionsApi.ts" },
	{ from: "trading/dflow/dflowPositionsQueryCache.ts", to: "trading/venues/dflow/portfolio/dflowPositionsQueryCache.ts" },
	{ from: "trading/dflow/useDflowOutcomeBalance.ts", to: "trading/venues/dflow/portfolio/useDflowOutcomeBalance.ts" },
	{ from: "trading/dflow/pendingDflowOutcomeMints.ts", to: "trading/venues/dflow/portfolio/pendingDflowOutcomeMints.ts" },
	{ from: "trading/dflow/dflowCatalogDriftIgnoredMints.ts", to: "trading/venues/dflow/catalog/dflowCatalogDriftIgnoredMints.ts" },
	{ from: "trading/dflow/monitorDflowBooks.ts", to: "trading/venues/dflow/catalog/monitorDflowBooks.ts" },
	{ from: "trading/dflow/dflowUmbrellaLookup.ts", to: "trading/venues/dflow/catalog/dflowUmbrellaLookup.ts" },
	{ from: "trading/dflow/dflowRouteOutcomeMint.ts", to: "trading/venues/dflow/catalog/dflowRouteOutcomeMint.ts" },
	{ from: "trading/dflow/useDflowMintResolver.ts", to: "trading/venues/dflow/catalog/useDflowMintResolver.ts" },
	{ from: "trading/dflow/startDflowProofRedirect.ts", to: "trading/venues/dflow/onboarding/startDflowProofRedirect.ts" },
	{ from: "trading/dflow/DflowProofReturnSync.tsx", to: "trading/venues/dflow/onboarding/DflowProofReturnSync.tsx" },
	{ from: "trading/dflow/dflowHistoryResolveWire.ts", to: "trading/venues/dflow/onboarding/dflowHistoryResolveWire.ts" },

	// ── Predict ──
	{ from: "trading/predict/usePredictTradingSession.ts", to: "trading/venues/predict/session/usePredictTradingSession.ts" },
	{ from: "trading/predict/usePredictEnsureExecutionReady.ts", to: "trading/venues/predict/session/usePredictEnsureExecutionReady.ts" },
	{ from: "trading/predict/usePredictEnsureAuth.ts", to: "trading/venues/predict/session/usePredictEnsureAuth.ts" },
	{ from: "trading/predict/PredictBackgroundActivation.tsx", to: "trading/venues/predict/session/PredictBackgroundActivation.tsx" },
	{ from: "trading/predict/predictSingleMarketBook.ts", to: "trading/venues/predict/book/predictSingleMarketBook.ts" },
	{ from: "trading/predict/predictSingleMarketBook.test.ts", to: "trading/venues/predict/book/predictSingleMarketBook.test.ts" },
	{ from: "trading/predict/predictBookToOrderbookSnapshot.ts", to: "trading/venues/predict/book/predictBookToOrderbookSnapshot.ts" },
	{ from: "trading/predict/usePredictOrderbook.ts", to: "trading/venues/predict/book/usePredictOrderbook.ts" },
	{ from: "trading/predict/usePredictPositions.ts", to: "trading/venues/predict/portfolio/usePredictPositions.ts" },
	{ from: "trading/predict/usePredictOrders.ts", to: "trading/venues/predict/portfolio/usePredictOrders.ts" },
	{ from: "trading/predict/usePredictAccountActivity.ts", to: "trading/venues/predict/portfolio/usePredictAccountActivity.ts" },
	{ from: "trading/predict/usePredictMarketDetailsMap.ts", to: "trading/venues/predict/portfolio/usePredictMarketDetailsMap.ts" },
	{ from: "trading/predict/usePredictMarketDetail.ts", to: "trading/venues/predict/portfolio/usePredictMarketDetail.ts" },
	{ from: "trading/predict/usePredictOrderMatches.ts", to: "trading/venues/predict/portfolio/usePredictOrderMatches.ts" },
	{ from: "trading/predict/predictPositionsApi.ts", to: "trading/venues/predict/portfolio/predictPositionsApi.ts" },
	{ from: "trading/predict/predictActivityApi.ts", to: "trading/venues/predict/portfolio/predictActivityApi.ts" },
	{ from: "trading/predict/predictOrdersApi.ts", to: "trading/venues/predict/portfolio/predictOrdersApi.ts" },
	{ from: "trading/predict/predictMarketApi.ts", to: "trading/venues/predict/portfolio/predictMarketApi.ts" },
	{ from: "trading/predict/sumPredictPositionMarkValue.ts", to: "trading/venues/predict/portfolio/sumPredictPositionMarkValue.ts" },
	{ from: "trading/predict/predictPositionLabel.ts", to: "trading/venues/predict/portfolio/predictPositionLabel.ts" },
	{ from: "trading/predict/predictTradeBoxMatch.ts", to: "trading/venues/predict/trade/predictTradeBoxMatch.ts" },
	{ from: "trading/predict/predictTradeBoxMatch.test.ts", to: "trading/venues/predict/trade/predictTradeBoxMatch.test.ts" },
	{ from: "trading/predict/predictSellShareClamp.ts", to: "trading/venues/predict/trade/predictSellShareClamp.ts" },
	{ from: "trading/predict/predictOrderSubmit.ts", to: "trading/venues/predict/trade/predictOrderSubmit.ts" },
	{ from: "trading/predict/predictPositionSide.ts", to: "trading/venues/predict/trade/predictPositionSide.ts" },
	{ from: "trading/predict/predictOutcome.ts", to: "trading/venues/predict/trade/predictOutcome.ts" },
	{ from: "trading/predict/predictMatchesApi.ts", to: "trading/venues/predict/trade/predictMatchesApi.ts" },
	{ from: "trading/predict/predictGasGuidance.ts", to: "trading/venues/predict/trade/predictGasGuidance.ts" },
	{ from: "trading/predict/predictContractKeys.ts", to: "trading/venues/predict/trade/predictContractKeys.ts" },
	{ from: "trading/predict/resolvePredictUmbrellaFromMonitor.ts", to: "trading/venues/predict/trade/resolvePredictUmbrellaFromMonitor.ts" },
	{ from: "trading/predict/resolvePredictUmbrellaFromMonitor.test.ts", to: "trading/venues/predict/trade/resolvePredictUmbrellaFromMonitor.test.ts" },
	{ from: "trading/predict/usePredictBnbBalances.ts", to: "trading/venues/predict/wallet/usePredictBnbBalances.ts" },
	{ from: "trading/predict/bnbWallet.ts", to: "trading/venues/predict/wallet/bnbWallet.ts" },
	{ from: "trading/predict/usePredictApprovalsStatus.ts", to: "trading/venues/predict/wallet/usePredictApprovalsStatus.ts" },

	// ── Limitless ──
	{ from: "trading/limitless/useLimitlessEnsureExecutionReady.ts", to: "trading/venues/limitless/session/useLimitlessEnsureExecutionReady.ts" },
	{ from: "trading/limitless/limitlessEnsureTradeGate.ts", to: "trading/venues/limitless/session/limitlessEnsureTradeGate.ts" },
	{ from: "trading/limitless/limitlessEnsureAccountRequest.ts", to: "trading/venues/limitless/session/limitlessEnsureAccountRequest.ts" },
	{ from: "trading/limitless/limitlessEnsureEoaBody.ts", to: "trading/venues/limitless/session/limitlessEnsureEoaBody.ts" },
	{ from: "trading/limitless/LimitlessBackgroundActivation.tsx", to: "trading/venues/limitless/session/LimitlessBackgroundActivation.tsx" },
	{ from: "trading/limitless/limitlessSignupWarmupBaseApprovals.ts", to: "trading/venues/limitless/session/limitlessSignupWarmupBaseApprovals.ts" },
	{ from: "trading/limitless/limitlessTradingApprovalsOnBase.ts", to: "trading/venues/limitless/approvals/limitlessTradingApprovalsOnBase.ts" },
	{ from: "trading/limitless/useLimitlessPortfolioVenue.ts", to: "trading/venues/limitless/portfolio/useLimitlessPortfolioVenue.ts" },
	{ from: "trading/limitless/useLimitlessPositions.ts", to: "trading/venues/limitless/portfolio/useLimitlessPositions.ts" },
	{ from: "trading/limitless/splitLimitlessVenuePositions.ts", to: "trading/venues/limitless/portfolio/splitLimitlessVenuePositions.ts" },
	{ from: "trading/limitless/limitlessVenueSharesFilter.ts", to: "trading/venues/limitless/portfolio/limitlessVenueSharesFilter.ts" },
	{ from: "trading/limitless/limitlessPortfolioDebug.ts", to: "trading/venues/limitless/portfolio/limitlessPortfolioDebug.ts" },
	{ from: "trading/limitless/limitlessRedeemOnBase.ts", to: "trading/venues/limitless/portfolio/limitlessRedeemOnBase.ts" },
	{ from: "trading/limitless/limitlessClaimAck.ts", to: "trading/venues/limitless/portfolio/limitlessClaimAck.ts" },
	{ from: "trading/limitless/limitlessSignedClobOrder.ts", to: "trading/venues/limitless/trade/limitlessSignedClobOrder.ts" },
	{ from: "trading/limitless/limitlessTradeBoxMatch.ts", to: "trading/venues/limitless/trade/limitlessTradeBoxMatch.ts" },
	{ from: "trading/limitless/limitlessOrderbook.ts", to: "trading/venues/limitless/trade/limitlessOrderbook.ts" },
	{ from: "trading/limitless/limitlessTokenId.ts", to: "trading/venues/limitless/trade/limitlessTokenId.ts" },
	{ from: "trading/limitless/limitlessCatalogTokenPair.ts", to: "trading/venues/limitless/trade/limitlessCatalogTokenPair.ts" },
	{ from: "trading/limitless/limitlessClientMakerIdentity.ts", to: "trading/venues/limitless/trade/limitlessClientMakerIdentity.ts" },
	{ from: "trading/limitless/limitlessPrivateApiTypes.ts", to: "trading/venues/limitless/trade/limitlessPrivateApiTypes.ts" },
	{ from: "trading/limitless/limitlessConsoleDebug.ts", to: "trading/venues/limitless/trade/limitlessConsoleDebug.ts" },
	{ from: "trading/limitless/limitlessBaseTxClientForAddress.ts", to: "trading/venues/limitless/trade/limitlessBaseTxClientForAddress.ts" },
	{ from: "trading/limitless/limitlessQueryKeys.ts", to: "trading/venues/limitless/trade/limitlessQueryKeys.ts" },

	// ── LevelUp (from sor) ──
	{ from: "trading/sor/levelUpSorSigning.ts", to: "trading/venues/levelup/execute/levelUpSorSigning.ts" },

	// ── SOR core ──
	{ from: "trading/sor/sor-types.ts", to: "trading/sor/core/sor-types.ts" },
	{ from: "trading/sor/sor-api.ts", to: "trading/sor/core/sor-api.ts" },
	{ from: "trading/sor/useSorRoute.ts", to: "trading/sor/core/useSorRoute.ts" },
	{ from: "trading/sor/useSorExecution.ts", to: "trading/sor/core/useSorExecution.ts" },
	{ from: "trading/sor/useSorLegExecutor.ts", to: "trading/sor/core/useSorLegExecutor.ts" },
	{ from: "trading/sor/buildChainBalances.ts", to: "trading/sor/core/buildChainBalances.ts" },
	{ from: "trading/sor/wireAmount.ts", to: "trading/sor/core/wireAmount.ts" },
	{ from: "trading/sor/sorPredictNetHeldDisplay.ts", to: "trading/sor/core/sorPredictNetHeldDisplay.ts" },
	{ from: "trading/sor/SorKalshiKycShortfallBanner.tsx", to: "trading/sor/core/SorKalshiKycShortfallBanner.tsx" },
	{ from: "trading/sor/SorTransientRouteErrorText.tsx", to: "trading/sor/core/SorTransientRouteErrorText.tsx" },

	// ── SOR route ──
	{ from: "trading/sor/sorQuoteTrust.ts", to: "trading/sor/route/sorQuoteTrust.ts" },
	{ from: "trading/sor/sorPreflight.ts", to: "trading/sor/route/sorPreflight.ts" },

	// ── SOR prefund ──
	{ from: "trading/sor/prefundPlan.ts", to: "trading/sor/prefund/prefundPlan.ts" },
	{ from: "trading/sor/fundingStableBalances.ts", to: "trading/sor/prefund/fundingStableBalances.ts" },
	{ from: "trading/sor/fundingStableBalanceChains.ts", to: "trading/sor/prefund/fundingStableBalanceChains.ts" },
	{ from: "trading/sor/lifiPrefundQuoteSolve.ts", to: "trading/sor/prefund/lifiPrefundQuoteSolve.ts" },
	{ from: "trading/sor/limitlessPrefundSweep.ts", to: "trading/sor/prefund/limitlessPrefundSweep.ts" },
	{ from: "trading/sor/sorPrefundLifiExecutionAlignment.ts", to: "trading/sor/prefund/sorPrefundLifiExecutionAlignment.ts" },
	{ from: "trading/sor/sorBridgeWallTimeBudget.ts", to: "trading/sor/prefund/sorBridgeWallTimeBudget.ts" },
	{ from: "trading/sor/sorBridgeGroups.ts", to: "trading/sor/prefund/sorBridgeGroups.ts" },
	{ from: "trading/sor/predictionBuyCollateralMicro.ts", to: "trading/sor/prefund/predictionBuyCollateralMicro.ts" },
	{ from: "trading/sor/limitlessMakerToScwWithdrawWait.ts", to: "trading/sor/prefund/limitlessMakerToScwWithdrawWait.ts" },
	{ from: "trading/sor/postBridgeOrderResize.ts", to: "trading/sor/prefund/postBridgeOrderResize.ts" },

	// ── SOR post-trade ──
	{ from: "trading/sor/performPostTradeDataRefresh.ts", to: "trading/sor/post-trade/performPostTradeDataRefresh.ts" },
	{ from: "trading/sor/usePostTradeAccountSync.tsx", to: "trading/sor/post-trade/usePostTradeAccountSync.tsx" },
	{ from: "trading/sor/postTradeVenueRefresh.ts", to: "trading/sor/post-trade/postTradeVenueRefresh.ts" },
	{ from: "trading/sor/postTradeRouteAlign.ts", to: "trading/sor/post-trade/postTradeRouteAlign.ts" },
	{ from: "trading/sor/postTradeReconcile.ts", to: "trading/sor/post-trade/postTradeReconcile.ts" },
	{ from: "trading/sor/postTradeBaseline.ts", to: "trading/sor/post-trade/postTradeBaseline.ts" },
	{ from: "trading/sor/pollAccountRefresh.ts", to: "trading/sor/post-trade/pollAccountRefresh.ts" },
];

function ensureDir(filePath: string): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function moveFile(fromRel: string, toRel: string): void {
	const from = path.join(SRC, fromRel);
	const to = path.join(SRC, toRel);
	if (!fs.existsSync(from)) {
		console.warn(`skip missing: ${fromRel}`);
		return;
	}
	ensureDir(to);
	fs.renameSync(from, to);
	console.log(`moved ${fromRel} → ${toRel}`);
}

/** Build old @/ path → new @/ path from move list */
function buildImportReplacements(): Array<[string, string]> {
	const reps: Array<[string, string]> = [];
	for (const { from, to } of moves) {
		const fromNoExt = from.replace(/\.(tsx?|md)$/, "");
		const toNoExt = to.replace(/\.(tsx?|md)$/, "");
		reps.push([`@/${fromNoExt}`, `@/${toNoExt}`]);
	}
	// Sort longest first so specific paths win over prefixes
	reps.sort((a, b) => b[0].length - a[0].length);
	return reps;
}

function walkDir(dir: string, out: string[] = []): string[] {
	for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, ent.name);
		if (ent.name === "node_modules" || ent.name === "dist") continue;
		if (ent.isDirectory()) walkDir(p, out);
		else if (/\.(ts|tsx|md|json)$/.test(ent.name)) out.push(p);
	}
	return out;
}

function applyImportReplacements(content: string, reps: Array<[string, string]>): string {
	let s = content;
	for (const [from, to] of reps) {
		s = s.split(from).join(to);
	}
	return s;
}

function fixSorRelativeImports(content: string, fileRel: string): string {
	// sor/__tests__/*.test.ts: ../foo → ../core/foo or correct subfolder
	if (!fileRel.includes("trading/sor/")) return content;

	const subfolderMap: Record<string, string> = {
		"sor-types": "core/sor-types",
		"sor-api": "core/sor-api",
		useSorRoute: "core/useSorRoute",
		useSorExecution: "core/useSorExecution",
		useSorLegExecutor: "core/useSorLegExecutor",
		buildChainBalances: "core/buildChainBalances",
		wireAmount: "core/wireAmount",
		sorPredictNetHeldDisplay: "core/sorPredictNetHeldDisplay",
		sorQuoteTrust: "route/sorQuoteTrust",
		sorPreflight: "route/sorPreflight",
		prefundPlan: "prefund/prefundPlan",
		fundingStableBalances: "prefund/fundingStableBalances",
		fundingStableBalanceChains: "prefund/fundingStableBalanceChains",
		lifiPrefundQuoteSolve: "prefund/lifiPrefundQuoteSolve",
		limitlessPrefundSweep: "prefund/limitlessPrefundSweep",
		sorPrefundLifiExecutionAlignment: "prefund/sorPrefundLifiExecutionAlignment",
		sorBridgeWallTimeBudget: "prefund/sorBridgeWallTimeBudget",
		sorBridgeGroups: "prefund/sorBridgeGroups",
		predictionBuyCollateralMicro: "prefund/predictionBuyCollateralMicro",
		limitlessMakerToScwWithdrawWait: "prefund/limitlessMakerToScwWithdrawWait",
		postBridgeOrderResize: "prefund/postBridgeOrderResize",
		performPostTradeDataRefresh: "post-trade/performPostTradeDataRefresh",
		usePostTradeAccountSync: "post-trade/usePostTradeAccountSync",
		postTradeVenueRefresh: "post-trade/postTradeVenueRefresh",
		postTradeRouteAlign: "post-trade/postTradeRouteAlign",
		postTradeReconcile: "post-trade/postTradeReconcile",
		postTradeBaseline: "post-trade/postTradeBaseline",
		pollAccountRefresh: "post-trade/pollAccountRefresh",
		levelUpSorSigning: "../venues/levelup/execute/levelUpSorSigning",
	};

	let s = content;
	for (const [name, target] of Object.entries(subfolderMap)) {
		s = s.replace(
			new RegExp(`from "\\.\\./${name}"`, "g"),
			`from "../${target}"`,
		);
		s = s.replace(
			new RegExp(`from "\\./${name}"`, "g"),
			`from "./${target.replace(/^\.\.\//, "")}"`,
		);
	}
	return s;
}

function main(): void {
	console.log("Moving files…");
	for (const m of moves) {
		moveFile(m.from, m.to);
	}

	const reps = buildImportReplacements();
	console.log("\nUpdating imports…");
	const files = walkDir(SRC);
	// Also vitest.config.ts at project root
	files.push(path.join(ROOT, "vitest.config.ts"));

	for (const file of files) {
		if (!fs.existsSync(file)) continue;
		const raw = fs.readFileSync(file, "utf8");
		let next = applyImportReplacements(raw, reps);
		const rel = path.relative(ROOT, file);
		next = fixSorRelativeImports(next, rel);
		if (next !== raw) {
			fs.writeFileSync(file, next);
			console.log(`updated imports: ${rel}`);
		}
	}

	// Remove empty legacy dirs only (never remove trading/venues/* — subdirs hold moved files)
	for (const d of [
		"trading/polymarket",
		"trading/dflow",
		"trading/predict",
		"trading/limitless",
	]) {
		const p = path.join(SRC, d);
		if (fs.existsSync(p)) {
			try {
				fs.rmdirSync(p, { recursive: true });
				console.log(`removed empty dir: ${d}`);
			} catch {
				console.warn(`could not remove: ${d}`);
			}
		}
	}

	console.log("\nDone.");
}

main();
