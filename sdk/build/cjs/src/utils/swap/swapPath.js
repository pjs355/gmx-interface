"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFindSwapPath = exports.getWrappedAddress = void 0;
const markets_1 = require("configs/markets");
const tokens_1 = require("configs/tokens");
const LruCache_1 = require("utils/LruCache");
const markets_2 = require("utils/markets");
const buildMarketsAdjacencyGraph_1 = require("./buildMarketsAdjacencyGraph");
const swapRouting_1 = require("./swapRouting");
const swapStats_1 = require("./swapStats");
const getWrappedAddress = (chainId, address) => {
    return address ? (0, tokens_1.convertTokenAddress)(chainId, address, "wrapped") : undefined;
};
exports.getWrappedAddress = getWrappedAddress;
const DEBUG_MARKET_ADJACENCY_GRAPH_CACHE = new LruCache_1.LRUCache(100);
function buildMarketAdjacencyGraph(chainId, disabledMarkets) {
    if (!disabledMarkets?.length) {
        return (0, swapRouting_1.getMarketAdjacencyGraph)(chainId);
    }
    const cacheKey = `${chainId}-${JSON.stringify(disabledMarkets)}`;
    const cachedGraph = DEBUG_MARKET_ADJACENCY_GRAPH_CACHE.get(cacheKey);
    if (cachedGraph) {
        return cachedGraph;
    }
    const disabledMarketAddresses = disabledMarkets;
    const strippedMarkets = Object.fromEntries(Object.entries(markets_1.MARKETS[chainId]).filter(([marketAddress]) => !disabledMarketAddresses.includes(marketAddress)));
    const graph = (0, buildMarketsAdjacencyGraph_1.buildMarketsAdjacencyGraph)(strippedMarkets);
    DEBUG_MARKET_ADJACENCY_GRAPH_CACHE.set(cacheKey, graph);
    return graph;
}
const FALLBACK_FIND_SWAP_PATH = () => undefined;
const createFindSwapPath = (params) => {
    const { chainId, fromTokenAddress, toTokenAddress, marketsInfoData, disabledMarkets, manualPath, gasEstimationParams, isExpressFeeSwap, maxSwapPathLength, } = params;
    const wrappedFromAddress = (0, exports.getWrappedAddress)(chainId, fromTokenAddress);
    const wrappedToAddress = (0, exports.getWrappedAddress)(chainId, toTokenAddress);
    const wrappedToken = (0, tokens_1.getWrappedToken)(chainId);
    let tokenSwapPaths = wrappedFromAddress && wrappedToAddress
        ? (0, swapRouting_1.getTokenSwapPathsForTokenPairPrebuilt)(chainId, wrappedFromAddress, wrappedToAddress)
        : [];
    if (maxSwapPathLength) {
        /**
         * As tokenSwapPath contains what tokens can we between input and output token,
         * restricting intermediate tokens to 0 would mean we filter out any non-direct market swaps,
         * length of 1 would mean all 2-step swaps
         */
        const nonDirectPathLength = maxSwapPathLength - 1;
        tokenSwapPaths = tokenSwapPaths.filter((path) => path.length <= nonDirectPathLength);
    }
    const finalDisabledMarkets = [...(disabledMarkets ?? [])];
    if (isExpressFeeSwap) {
        const expressSwapUnavailableMarkets = Object.values(marketsInfoData ?? {})
            .filter((market) => !(0, markets_2.getIsMarketAvailableForExpressSwaps)(market))
            .map((market) => market.marketTokenAddress);
        finalDisabledMarkets.push(...expressSwapUnavailableMarkets);
    }
    const isAtomicSwap = Boolean(isExpressFeeSwap);
    const marketAdjacencyGraph = buildMarketAdjacencyGraph(chainId, finalDisabledMarkets);
    const cache = {};
    if (!marketsInfoData) {
        return FALLBACK_FIND_SWAP_PATH;
    }
    const marketEdgeLiquidityGetter = (0, swapRouting_1.createMarketEdgeLiquidityGetter)(marketsInfoData);
    const naiveEstimator = (0, swapRouting_1.createNaiveSwapEstimator)(marketsInfoData, isAtomicSwap);
    const naiveNetworkEstimator = gasEstimationParams
        ? (0, swapRouting_1.createNaiveNetworkEstimator)({
            gasLimits: gasEstimationParams.gasLimits,
            tokensData: gasEstimationParams.tokensData,
            gasPrice: gasEstimationParams.gasPrice,
            chainId,
        })
        : undefined;
    const estimator = (0, swapRouting_1.createSwapEstimator)(marketsInfoData, isAtomicSwap);
    const findSwapPath = (usdIn, opts) => {
        if (tokenSwapPaths.length === 0 || !fromTokenAddress || !wrappedFromAddress || !wrappedToAddress) {
            return undefined;
        }
        const cacheKey = `${usdIn}-${opts?.order?.join("-") || "none"}`;
        if (cache[cacheKey]) {
            return cache[cacheKey];
        }
        let swapPath = undefined;
        if (manualPath !== undefined) {
            swapPath = manualPath;
        }
        else if (opts?.order || usdIn === 0n) {
            const primaryOrder = opts?.order?.at(0) === "length" ? "length" : "liquidity";
            if (!marketEdgeLiquidityGetter) {
                swapPath = undefined;
            }
            else {
                let applicableTokenSwapPaths = tokenSwapPaths;
                if (primaryOrder === "length") {
                    const shortestLength = Math.min(...tokenSwapPaths.map((path) => path.length));
                    applicableTokenSwapPaths = tokenSwapPaths.filter((path) => path.length === shortestLength);
                }
                const maxLiquidityPathInfo = (0, swapRouting_1.getMaxLiquidityMarketSwapPathFromTokenSwapPaths)({
                    graph: marketAdjacencyGraph,
                    tokenSwapPaths: applicableTokenSwapPaths,
                    tokenInAddress: wrappedFromAddress,
                    tokenOutAddress: wrappedToAddress,
                    getLiquidity: marketEdgeLiquidityGetter,
                });
                if (maxLiquidityPathInfo) {
                    swapPath = maxLiquidityPathInfo.path;
                }
            }
        }
        else {
            if (naiveEstimator) {
                const naiveSwapRoutes = (0, swapRouting_1.getNaiveBestMarketSwapPathsFromTokenSwapPaths)({
                    graph: marketAdjacencyGraph,
                    tokenSwapPaths,
                    usdIn,
                    tokenInAddress: wrappedFromAddress,
                    tokenOutAddress: wrappedToAddress,
                    estimator: naiveEstimator,
                    networkEstimator: naiveNetworkEstimator,
                });
                if (naiveSwapRoutes?.length) {
                    const edges = naiveSwapRoutes.map((path) => (0, swapRouting_1.marketRouteToMarketEdges)(path, wrappedFromAddress, marketsInfoData));
                    swapPath = (0, swapRouting_1.getBestSwapPath)({
                        routes: edges,
                        usdIn,
                        estimator,
                        networkEstimator: naiveNetworkEstimator,
                    })?.map((edge) => edge.marketAddress);
                }
            }
        }
        if (!swapPath) {
            cache[cacheKey] = undefined;
            return undefined;
        }
        let result = (0, swapStats_1.getSwapPathStats)({
            marketsInfoData,
            swapPath,
            initialCollateralAddress: fromTokenAddress,
            wrappedNativeTokenAddress: wrappedToken.address,
            shouldUnwrapNativeToken: toTokenAddress === tokens_1.NATIVE_TOKEN_ADDRESS,
            shouldApplyPriceImpact: true,
            usdIn,
            isAtomicSwap,
        });
        cache[cacheKey] = result;
        return result;
    };
    return findSwapPath;
};
exports.createFindSwapPath = createFindSwapPath;
