/**
 * One-time migration: features/trading/polymarket|dflow|predict|limitless → venues/*,
 * sor/* → sor/{core,route,prefund,post-trade}/.
 *
 * Paths in `moves` are relative to `src/` (e.g. `features/trading/...`).
 * Run: npx tsx scripts/migrate-trading-structure.ts
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");

type Move = { from: string; to: string };

const moves: Move[] = [
	// ── Polymarket ──
	{
		from: "features/trading/polymarket/usePolymarketClobTradingSession.ts",
		to: "features/trading/venues/polymarket/session/usePolymarketClobTradingSession.ts",
	},
	{
		from: "features/trading/polymarket/usePolymarketEnsureExecutionReady.ts",
		to: "features/trading/venues/polymarket/session/usePolymarketEnsureExecutionReady.ts",
	},
	{
		from: "features/trading/polymarket/usePolymarketEnsureDepositWalletDeployed.ts",
		to: "features/trading/venues/polymarket/session/usePolymarketEnsureDepositWalletDeployed.ts",
	},
	{
		from: "features/trading/polymarket/PolymarketBackgroundActivation.tsx",
		to: "features/trading/venues/polymarket/session/PolymarketBackgroundActivation.tsx",
	},
	{
		from: "features/trading/polymarket/PolymarketDepositDeployBackgroundActivation.tsx",
		to: "features/trading/venues/polymarket/session/PolymarketDepositDeployBackgroundActivation.tsx",
	},
	{
		from: "features/trading/polymarket/relayClient.ts",
		to: "features/trading/venues/polymarket/session/relayClient.ts",
	},
	{
		from: "features/trading/polymarket/safeActions.ts",
		to: "features/trading/venues/polymarket/session/safeActions.ts",
	},
	{
		from: "features/trading/polymarket/usePolymarketRelay.ts",
		to: "features/trading/venues/polymarket/session/usePolymarketRelay.ts",
	},
	{
		from: "features/trading/polymarket/POLYMARKET_TRADING.md",
		to: "features/trading/venues/polymarket/session/POLYMARKET_TRADING.md",
	},
	{
		from: "features/trading/polymarket/usePolymarketEoaWalletClient.ts",
		to: "features/trading/venues/polymarket/wallet/usePolymarketEoaWalletClient.ts",
	},
	{
		from: "features/trading/polymarket/embeddedPrivyViemSend.ts",
		to: "features/trading/venues/polymarket/wallet/embeddedPrivyViemSend.ts",
	},
	{
		from: "features/trading/polymarket/privyEmbeddedWallet.ts",
		to: "features/trading/venues/polymarket/wallet/privyEmbeddedWallet.ts",
	},
	{
		from: "features/trading/polymarket/ethers5FromEip1193.ts",
		to: "features/trading/venues/polymarket/wallet/ethers5FromEip1193.ts",
	},
	{
		from: "features/trading/polymarket/usePolymarketPositions.ts",
		to: "features/trading/venues/polymarket/portfolio/usePolymarketPositions.ts",
	},
	{
		from: "features/trading/polymarket/usePolymarketTradeHistory.ts",
		to: "features/trading/venues/polymarket/portfolio/usePolymarketTradeHistory.ts",
	},
	{
		from: "features/trading/polymarket/polymarketPositionsRefetchMerge.ts",
		to: "features/trading/venues/polymarket/portfolio/polymarketPositionsRefetchMerge.ts",
	},
	{
		from: "features/trading/polymarket/polymarketClobOrderResult.ts",
		to: "features/trading/venues/polymarket/trade/polymarketClobOrderResult.ts",
	},
	{
		from: "features/trading/polymarket/polymarketSellShareClamp.ts",
		to: "features/trading/venues/polymarket/trade/polymarketSellShareClamp.ts",
	},
	{
		from: "features/trading/polymarket/polymarketSellShareClamp.test.ts",
		to: "features/trading/venues/polymarket/trade/polymarketSellShareClamp.test.ts",
	},
	{
		from: "features/trading/polymarket/polyOutcomeTokenId.ts",
		to: "features/trading/venues/polymarket/trade/polyOutcomeTokenId.ts",
	},
	{
		from: "features/trading/polymarket/polyPositionSide.ts",
		to: "features/trading/venues/polymarket/trade/polyPositionSide.ts",
	},
	{
		from: "features/trading/polymarket/monitorOrderbookAdapter.ts",
		to: "features/trading/venues/polymarket/trade/monitorOrderbookAdapter.ts",
	},
	{
		from: "features/trading/polymarket/polygonCollateralWrap.ts",
		to: "features/trading/venues/polymarket/trade/polygonCollateralWrap.ts",
	},
	{
		from: "features/trading/polymarket/approvalTxs.ts",
		to: "features/trading/venues/polymarket/trade/approvalTxs.ts",
	},
	{
		from: "features/trading/polymarket/polymarketBuilderCode.ts",
		to: "features/trading/venues/polymarket/trade/polymarketBuilderCode.ts",
	},
	{
		from: "features/trading/polymarket/levelUpBuilderConfig.ts",
		to: "features/trading/venues/polymarket/trade/levelUpBuilderConfig.ts",
	},
	{
		from: "features/trading/polymarket/normalizeBuilderSignTimestamp.ts",
		to: "features/trading/venues/polymarket/trade/normalizeBuilderSignTimestamp.ts",
	},
	{
		from: "features/trading/polymarket/polymarketConditionLookup.ts",
		to: "features/trading/venues/polymarket/trade/polymarketConditionLookup.ts",
	},
	{
		from: "features/trading/polymarket/polymarketOrderDebug.ts",
		to: "features/trading/venues/polymarket/trade/polymarketOrderDebug.ts",
	},
	{
		from: "features/trading/polymarket/constants.ts",
		to: "features/trading/venues/polymarket/trade/constants.ts",
	},
	{
		from: "features/trading/polymarket/__tests__/usePolymarketEnsureExecutionReady.test.tsx",
		to: "features/trading/venues/polymarket/session/__tests__/usePolymarketEnsureExecutionReady.test.tsx",
	},
	{
		from: "features/trading/venues/polymarket/PolymarketVenueCard.tsx",
		to: "features/trading/venues/polymarket/ui/PolymarketVenueCard.tsx",
	},

	// ── DFlow ──
	{
		from: "features/trading/dflow/quoteSignAndSubmitDflowOrder.ts",
		to: "features/trading/venues/dflow/quote/quoteSignAndSubmitDflowOrder.ts",
	},
	{
		from: "features/trading/dflow/dflowOrderQuoteTypes.ts",
		to: "features/trading/venues/dflow/quote/dflowOrderQuoteTypes.ts",
	},
	{
		from: "features/trading/dflow/dflowOutcomeAmount.ts",
		to: "features/trading/venues/dflow/quote/dflowOutcomeAmount.ts",
	},
	{
		from: "features/trading/dflow/dflowOutcomeAmount.test.ts",
		to: "features/trading/venues/dflow/quote/dflowOutcomeAmount.test.ts",
	},
	{
		from: "features/trading/dflow/useDflowPositions.ts",
		to: "features/trading/venues/dflow/portfolio/useDflowPositions.ts",
	},
	{
		from: "features/trading/dflow/dflowPositionsApi.ts",
		to: "features/trading/venues/dflow/portfolio/dflowPositionsApi.ts",
	},
	{
		from: "features/trading/dflow/dflowPositionsQueryCache.ts",
		to: "features/trading/venues/dflow/portfolio/dflowPositionsQueryCache.ts",
	},
	{
		from: "features/trading/dflow/useDflowOutcomeBalance.ts",
		to: "features/trading/venues/dflow/portfolio/useDflowOutcomeBalance.ts",
	},
	{
		from: "features/trading/dflow/pendingDflowOutcomeMints.ts",
		to: "features/trading/venues/dflow/portfolio/pendingDflowOutcomeMints.ts",
	},
	{
		from: "features/trading/dflow/dflowCatalogDriftIgnoredMints.ts",
		to: "features/trading/venues/dflow/catalog/dflowCatalogDriftIgnoredMints.ts",
	},
	{
		from: "features/trading/dflow/monitorDflowBooks.ts",
		to: "features/trading/venues/dflow/catalog/monitorDflowBooks.ts",
	},
	{
		from: "features/trading/dflow/dflowUmbrellaLookup.ts",
		to: "features/trading/venues/dflow/catalog/dflowUmbrellaLookup.ts",
	},
	{
		from: "features/trading/dflow/dflowRouteOutcomeMint.ts",
		to: "features/trading/venues/dflow/catalog/dflowRouteOutcomeMint.ts",
	},
	{
		from: "features/trading/dflow/useDflowMintResolver.ts",
		to: "features/trading/venues/dflow/catalog/useDflowMintResolver.ts",
	},
	{
		from: "features/trading/dflow/startDflowProofRedirect.ts",
		to: "features/trading/venues/dflow/onboarding/startDflowProofRedirect.ts",
	},
	{
		from: "features/trading/dflow/DflowProofReturnSync.tsx",
		to: "features/trading/venues/dflow/onboarding/DflowProofReturnSync.tsx",
	},
	{
		from: "features/trading/dflow/dflowHistoryResolveWire.ts",
		to: "features/trading/venues/dflow/onboarding/dflowHistoryResolveWire.ts",
	},

	// ── Predict ──
	{
		from: "features/trading/predict/usePredictTradingSession.ts",
		to: "features/trading/venues/predict/session/usePredictTradingSession.ts",
	},
	{
		from: "features/trading/predict/usePredictEnsureExecutionReady.ts",
		to: "features/trading/venues/predict/session/usePredictEnsureExecutionReady.ts",
	},
	{
		from: "features/trading/predict/usePredictEnsureAuth.ts",
		to: "features/trading/venues/predict/session/usePredictEnsureAuth.ts",
	},
	{
		from: "features/trading/predict/PredictBackgroundActivation.tsx",
		to: "features/trading/venues/predict/session/PredictBackgroundActivation.tsx",
	},
	{
		from: "features/trading/predict/predictSingleMarketBook.ts",
		to: "features/trading/venues/predict/book/predictSingleMarketBook.ts",
	},
	{
		from: "features/trading/predict/predictSingleMarketBook.test.ts",
		to: "features/trading/venues/predict/book/predictSingleMarketBook.test.ts",
	},
	{
		from: "features/trading/predict/predictBookToOrderbookSnapshot.ts",
		to: "features/trading/venues/predict/book/predictBookToOrderbookSnapshot.ts",
	},
	{
		from: "features/trading/predict/usePredictOrderbook.ts",
		to: "features/trading/venues/predict/book/usePredictOrderbook.ts",
	},
	{
		from: "features/trading/predict/usePredictPositions.ts",
		to: "features/trading/venues/predict/portfolio/usePredictPositions.ts",
	},
	{
		from: "features/trading/predict/usePredictOrders.ts",
		to: "features/trading/venues/predict/portfolio/usePredictOrders.ts",
	},
	{
		from: "features/trading/predict/usePredictAccountActivity.ts",
		to: "features/trading/venues/predict/portfolio/usePredictAccountActivity.ts",
	},
	{
		from: "features/trading/predict/usePredictMarketDetailsMap.ts",
		to: "features/trading/venues/predict/portfolio/usePredictMarketDetailsMap.ts",
	},
	{
		from: "features/trading/predict/usePredictMarketDetail.ts",
		to: "features/trading/venues/predict/portfolio/usePredictMarketDetail.ts",
	},
	{
		from: "features/trading/predict/usePredictOrderMatches.ts",
		to: "features/trading/venues/predict/portfolio/usePredictOrderMatches.ts",
	},
	{
		from: "features/trading/predict/predictPositionsApi.ts",
		to: "features/trading/venues/predict/portfolio/predictPositionsApi.ts",
	},
	{
		from: "features/trading/predict/predictActivityApi.ts",
		to: "features/trading/venues/predict/portfolio/predictActivityApi.ts",
	},
	{
		from: "features/trading/predict/predictOrdersApi.ts",
		to: "features/trading/venues/predict/portfolio/predictOrdersApi.ts",
	},
	{
		from: "features/trading/predict/predictMarketApi.ts",
		to: "features/trading/venues/predict/portfolio/predictMarketApi.ts",
	},
	{
		from: "features/trading/predict/sumPredictPositionMarkValue.ts",
		to: "features/trading/venues/predict/portfolio/sumPredictPositionMarkValue.ts",
	},
	{
		from: "features/trading/predict/predictPositionLabel.ts",
		to: "features/trading/venues/predict/portfolio/predictPositionLabel.ts",
	},
	{
		from: "features/trading/predict/predictTradeBoxMatch.ts",
		to: "features/trading/venues/predict/trade/predictTradeBoxMatch.ts",
	},
	{
		from: "features/trading/predict/predictTradeBoxMatch.test.ts",
		to: "features/trading/venues/predict/trade/predictTradeBoxMatch.test.ts",
	},
	{
		from: "features/trading/predict/predictSellShareClamp.ts",
		to: "features/trading/venues/predict/trade/predictSellShareClamp.ts",
	},
	{
		from: "features/trading/predict/predictOrderSubmit.ts",
		to: "features/trading/venues/predict/trade/predictOrderSubmit.ts",
	},
	{
		from: "features/trading/predict/predictPositionSide.ts",
		to: "features/trading/venues/predict/trade/predictPositionSide.ts",
	},
	{
		from: "features/trading/predict/predictOutcome.ts",
		to: "features/trading/venues/predict/trade/predictOutcome.ts",
	},
	{
		from: "features/trading/predict/predictMatchesApi.ts",
		to: "features/trading/venues/predict/trade/predictMatchesApi.ts",
	},
	{
		from: "features/trading/predict/predictGasGuidance.ts",
		to: "features/trading/venues/predict/trade/predictGasGuidance.ts",
	},
	{
		from: "features/trading/predict/predictContractKeys.ts",
		to: "features/trading/venues/predict/trade/predictContractKeys.ts",
	},
	{
		from: "features/trading/predict/resolvePredictUmbrellaFromMonitor.ts",
		to: "features/trading/venues/predict/trade/resolvePredictUmbrellaFromMonitor.ts",
	},
	{
		from: "features/trading/predict/resolvePredictUmbrellaFromMonitor.test.ts",
		to: "features/trading/venues/predict/trade/resolvePredictUmbrellaFromMonitor.test.ts",
	},
	{
		from: "features/trading/predict/usePredictBnbBalances.ts",
		to: "features/trading/venues/predict/wallet/usePredictBnbBalances.ts",
	},
	{
		from: "features/trading/predict/bnbWallet.ts",
		to: "features/trading/venues/predict/wallet/bnbWallet.ts",
	},
	{
		from: "features/trading/predict/usePredictApprovalsStatus.ts",
		to: "features/trading/venues/predict/wallet/usePredictApprovalsStatus.ts",
	},

	// ── Limitless ──
	{
		from: "features/trading/limitless/useLimitlessEnsureExecutionReady.ts",
		to: "features/trading/venues/limitless/session/useLimitlessEnsureExecutionReady.ts",
	},
	{
		from: "features/trading/limitless/limitlessEnsureTradeGate.ts",
		to: "features/trading/venues/limitless/session/limitlessEnsureTradeGate.ts",
	},
	{
		from: "features/trading/limitless/limitlessEnsureAccountRequest.ts",
		to: "features/trading/venues/limitless/session/limitlessEnsureAccountRequest.ts",
	},
	{
		from: "features/trading/limitless/limitlessEnsureEoaBody.ts",
		to: "features/trading/venues/limitless/session/limitlessEnsureEoaBody.ts",
	},
	{
		from: "features/trading/limitless/LimitlessBackgroundActivation.tsx",
		to: "features/trading/venues/limitless/session/LimitlessBackgroundActivation.tsx",
	},
	{
		from: "features/trading/limitless/limitlessSignupWarmupBaseApprovals.ts",
		to: "features/trading/venues/limitless/session/limitlessSignupWarmupBaseApprovals.ts",
	},
	{
		from: "features/trading/limitless/limitlessTradingApprovalsOnBase.ts",
		to: "features/trading/venues/limitless/approvals/limitlessTradingApprovalsOnBase.ts",
	},
	{
		from: "features/trading/limitless/useLimitlessPortfolioVenue.ts",
		to: "features/trading/venues/limitless/portfolio/useLimitlessPortfolioVenue.ts",
	},
	{
		from: "features/trading/limitless/useLimitlessPositions.ts",
		to: "features/trading/venues/limitless/portfolio/useLimitlessPositions.ts",
	},
	{
		from: "features/trading/limitless/splitLimitlessVenuePositions.ts",
		to: "features/trading/venues/limitless/portfolio/splitLimitlessVenuePositions.ts",
	},
	{
		from: "features/trading/limitless/limitlessVenueSharesFilter.ts",
		to: "features/trading/venues/limitless/portfolio/limitlessVenueSharesFilter.ts",
	},
	{
		from: "features/trading/limitless/limitlessPortfolioDebug.ts",
		to: "features/trading/venues/limitless/portfolio/limitlessPortfolioDebug.ts",
	},
	{
		from: "features/trading/limitless/limitlessRedeemOnBase.ts",
		to: "features/trading/venues/limitless/portfolio/limitlessRedeemOnBase.ts",
	},
	{
		from: "features/trading/limitless/limitlessClaimAck.ts",
		to: "features/trading/venues/limitless/portfolio/limitlessClaimAck.ts",
	},
	{
		from: "features/trading/limitless/limitlessSignedClobOrder.ts",
		to: "features/trading/venues/limitless/trade/limitlessSignedClobOrder.ts",
	},
	{
		from: "features/trading/limitless/limitlessTradeBoxMatch.ts",
		to: "features/trading/venues/limitless/trade/limitlessTradeBoxMatch.ts",
	},
	{
		from: "features/trading/limitless/limitlessOrderbook.ts",
		to: "features/trading/venues/limitless/trade/limitlessOrderbook.ts",
	},
	{
		from: "features/trading/limitless/limitlessTokenId.ts",
		to: "features/trading/venues/limitless/trade/limitlessTokenId.ts",
	},
	{
		from: "features/trading/limitless/limitlessCatalogTokenPair.ts",
		to: "features/trading/venues/limitless/trade/limitlessCatalogTokenPair.ts",
	},
	{
		from: "features/trading/limitless/limitlessClientMakerIdentity.ts",
		to: "features/trading/venues/limitless/trade/limitlessClientMakerIdentity.ts",
	},
	{
		from: "features/trading/limitless/limitlessPrivateApiTypes.ts",
		to: "features/trading/venues/limitless/trade/limitlessPrivateApiTypes.ts",
	},
	{
		from: "features/trading/limitless/limitlessConsoleDebug.ts",
		to: "features/trading/venues/limitless/trade/limitlessConsoleDebug.ts",
	},
	{
		from: "features/trading/limitless/limitlessBaseTxClientForAddress.ts",
		to: "features/trading/venues/limitless/trade/limitlessBaseTxClientForAddress.ts",
	},
	{
		from: "features/trading/limitless/limitlessQueryKeys.ts",
		to: "features/trading/venues/limitless/trade/limitlessQueryKeys.ts",
	},

	// ── LevelUp (from sor) ──
	{
		from: "features/trading/sor/levelUpSorSigning.ts",
		to: "features/trading/venues/levelup/execute/levelUpSorSigning.ts",
	},

	// ── SOR core ──
	{ from: "features/trading/sor/sor-types.ts", to: "features/trading/sor/core/sor-types.ts" },
	{ from: "features/trading/sor/sor-api.ts", to: "features/trading/sor/core/sor-api.ts" },
	{ from: "features/trading/sor/useSorRoute.ts", to: "features/trading/sor/core/useSorRoute.ts" },
	{
		from: "features/trading/sor/useSorExecution.ts",
		to: "features/trading/sor/core/useSorExecution.ts",
	},
	{
		from: "features/trading/sor/useSorLegExecutor.ts",
		to: "features/trading/sor/core/useSorLegExecutor.ts",
	},
	{
		from: "features/trading/sor/buildChainBalances.ts",
		to: "features/trading/sor/core/buildChainBalances.ts",
	},
	{ from: "features/trading/sor/wireAmount.ts", to: "features/trading/sor/core/wireAmount.ts" },
	{
		from: "features/trading/sor/sorPredictNetHeldDisplay.ts",
		to: "features/trading/sor/core/sorPredictNetHeldDisplay.ts",
	},
	{
		from: "features/trading/sor/SorKalshiKycShortfallBanner.tsx",
		to: "features/trading/sor/core/SorKalshiKycShortfallBanner.tsx",
	},
	{
		from: "features/trading/sor/SorTransientRouteErrorText.tsx",
		to: "features/trading/sor/core/SorTransientRouteErrorText.tsx",
	},

	// ── SOR route ──
	{
		from: "features/trading/sor/sorQuoteTrust.ts",
		to: "features/trading/sor/route/sorQuoteTrust.ts",
	},
	{
		from: "features/trading/sor/sorPreflight.ts",
		to: "features/trading/sor/route/sorPreflight.ts",
	},

	// ── SOR prefund ──
	{
		from: "features/trading/sor/prefundPlan.ts",
		to: "features/trading/sor/prefund/prefundPlan.ts",
	},
	{
		from: "features/trading/sor/fundingStableBalances.ts",
		to: "features/trading/sor/prefund/fundingStableBalances.ts",
	},
	{
		from: "features/trading/sor/fundingStableBalanceChains.ts",
		to: "features/trading/sor/prefund/fundingStableBalanceChains.ts",
	},
	{
		from: "features/trading/sor/lifiPrefundQuoteSolve.ts",
		to: "features/trading/sor/prefund/lifiPrefundQuoteSolve.ts",
	},
	{
		from: "features/trading/sor/limitlessPrefundSweep.ts",
		to: "features/trading/sor/prefund/limitlessPrefundSweep.ts",
	},
	{
		from: "features/trading/sor/sorPrefundLifiExecutionAlignment.ts",
		to: "features/trading/sor/prefund/sorPrefundLifiExecutionAlignment.ts",
	},
	{
		from: "features/trading/sor/sorBridgeWallTimeBudget.ts",
		to: "features/trading/sor/prefund/sorBridgeWallTimeBudget.ts",
	},
	{
		from: "features/trading/sor/sorBridgeGroups.ts",
		to: "features/trading/sor/prefund/sorBridgeGroups.ts",
	},
	{
		from: "features/trading/sor/predictionBuyCollateralMicro.ts",
		to: "features/trading/sor/prefund/predictionBuyCollateralMicro.ts",
	},
	{
		from: "features/trading/sor/limitlessMakerToScwWithdrawWait.ts",
		to: "features/trading/sor/prefund/limitlessMakerToScwWithdrawWait.ts",
	},
	{
		from: "features/trading/sor/postBridgeOrderResize.ts",
		to: "features/trading/sor/prefund/postBridgeOrderResize.ts",
	},

	// ── SOR post-trade ──
	{
		from: "features/trading/sor/performPostTradeDataRefresh.ts",
		to: "features/trading/sor/post-trade/performPostTradeDataRefresh.ts",
	},
	{
		from: "features/trading/sor/usePostTradeAccountSync.tsx",
		to: "features/trading/sor/post-trade/usePostTradeAccountSync.tsx",
	},
	{
		from: "features/trading/sor/postTradeVenueRefresh.ts",
		to: "features/trading/sor/post-trade/postTradeVenueRefresh.ts",
	},
	{
		from: "features/trading/sor/postTradeRouteAlign.ts",
		to: "features/trading/sor/post-trade/postTradeRouteAlign.ts",
	},
	{
		from: "features/trading/sor/postTradeReconcile.ts",
		to: "features/trading/sor/post-trade/postTradeReconcile.ts",
	},
	{
		from: "features/trading/sor/postTradeBaseline.ts",
		to: "features/trading/sor/post-trade/postTradeBaseline.ts",
	},
	{
		from: "features/trading/sor/pollAccountRefresh.ts",
		to: "features/trading/sor/post-trade/pollAccountRefresh.ts",
	},
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
	if (!fileRel.includes("features/trading/sor/")) return content;

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
		s = s.replace(new RegExp(`from "\\.\\./${name}"`, "g"), `from "../${target}"`);
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
		"features/trading/polymarket",
		"features/trading/dflow",
		"features/trading/predict",
		"features/trading/limitless",
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
