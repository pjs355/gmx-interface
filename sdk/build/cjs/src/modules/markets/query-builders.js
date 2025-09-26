"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMarketsConfigsRequest = exports.buildMarketsValuesRequest = exports.buildClaimableFundingDataRequest = void 0;
const contracts_1 = require("configs/contracts");
const dataStore_1 = require("configs/dataStore");
const hash_1 = require("utils/hash");
const marketKeysAndConfigs_1 = require("utils/marketKeysAndConfigs");
const markets_1 = require("utils/markets");
const objects_1 = require("utils/objects");
const prebuilt_1 = require("../../prebuilt");
function buildClaimableFundingDataRequest({ marketsAddresses, marketsData, chainId, account, }) {
    if (!marketsAddresses) {
        return {};
    }
    return marketsAddresses.reduce((request, marketAddress) => {
        const market = (0, objects_1.getByKey)(marketsData, marketAddress);
        if (!market) {
            return request;
        }
        const keys = (0, hash_1.hashDataMap)({
            claimableFundingAmountLong: [
                ["bytes32", "address", "address", "address"],
                [dataStore_1.CLAIMABLE_FUNDING_AMOUNT, marketAddress, market.longTokenAddress, account],
            ],
            claimableFundingAmountShort: [
                ["bytes32", "address", "address", "address"],
                [dataStore_1.CLAIMABLE_FUNDING_AMOUNT, marketAddress, market.shortTokenAddress, account],
            ],
        });
        request[marketAddress] = {
            contractAddress: (0, contracts_1.getContract)(chainId, "DataStore"),
            abiId: "DataStore",
            calls: {
                claimableFundingAmountLong: {
                    methodName: "getUint",
                    params: [keys.claimableFundingAmountLong],
                },
                claimableFundingAmountShort: {
                    methodName: "getUint",
                    params: [keys.claimableFundingAmountShort],
                },
            },
        };
        return request;
    }, {});
}
exports.buildClaimableFundingDataRequest = buildClaimableFundingDataRequest;
async function buildMarketsValuesRequest(chainId, { marketsAddresses, marketsData, tokensData, dataStoreAddress, syntheticsReaderAddress, }) {
    const request = {};
    for (const marketAddress of marketsAddresses || []) {
        const market = (0, objects_1.getByKey)(marketsData, marketAddress);
        if (!market) {
            // eslint-disable-next-line no-console
            console.warn(`No market data found for ${marketAddress}, skipping market values request`);
            continue;
        }
        const marketPrices = (0, markets_1.getContractMarketPrices)(tokensData, market);
        if (!marketPrices) {
            // eslint-disable-next-line no-console
            console.warn(`No market prices for ${marketAddress}, skipping market values request`);
            continue;
        }
        const marketProps = {
            marketToken: market.marketTokenAddress,
            indexToken: market.indexTokenAddress,
            longToken: market.longTokenAddress,
            shortToken: market.shortTokenAddress,
        };
        request[`${marketAddress}-reader`] = {
            contractAddress: syntheticsReaderAddress,
            abiId: "SyntheticsReader",
            calls: {
                marketInfo: {
                    methodName: "getMarketInfo",
                    params: [dataStoreAddress, marketPrices, marketAddress],
                },
                marketTokenPriceMax: {
                    methodName: "getMarketTokenPrice",
                    params: [
                        dataStoreAddress,
                        marketProps,
                        marketPrices.indexTokenPrice,
                        marketPrices.longTokenPrice,
                        marketPrices.shortTokenPrice,
                        dataStore_1.MAX_PNL_FACTOR_FOR_TRADERS_KEY,
                        true,
                    ],
                },
                marketTokenPriceMin: {
                    methodName: "getMarketTokenPrice",
                    params: [
                        dataStoreAddress,
                        marketProps,
                        marketPrices.indexTokenPrice,
                        marketPrices.longTokenPrice,
                        marketPrices.shortTokenPrice,
                        dataStore_1.MAX_PNL_FACTOR_FOR_TRADERS_KEY,
                        false,
                    ],
                },
            },
        };
        let prebuiltHashedKeys = prebuilt_1.HASHED_MARKET_VALUES_KEYS[chainId]?.[marketAddress];
        if (!prebuiltHashedKeys) {
            // eslint-disable-next-line no-console
            console.warn(`No pre-built hashed market keys found for the market ${marketAddress}. Run \`yarn prebuild\` to generate them.`);
            if (!marketsData?.[marketAddress]) {
                throw new Error(`No market data found for the market ${marketAddress}`);
            }
            prebuiltHashedKeys = (0, marketKeysAndConfigs_1.hashMarketValuesKeys)(marketsData[marketAddress]);
        }
        const keys = {
            ...prebuiltHashedKeys,
        };
        request[`${marketAddress}-dataStore`] = {
            contractAddress: dataStoreAddress,
            abiId: "DataStore",
            calls: {
                longPoolAmount: {
                    methodName: "getUint",
                    params: [keys.longPoolAmount],
                },
                shortPoolAmount: {
                    methodName: "getUint",
                    params: [keys.shortPoolAmount],
                },
                positionImpactPoolAmount: {
                    methodName: "getUint",
                    params: [keys.positionImpactPoolAmount],
                },
                swapImpactPoolAmountLong: {
                    methodName: "getUint",
                    params: [keys.swapImpactPoolAmountLong],
                },
                swapImpactPoolAmountShort: {
                    methodName: "getUint",
                    params: [keys.swapImpactPoolAmountShort],
                },
                longInterestUsingLongToken: {
                    methodName: "getUint",
                    params: [keys.longInterestUsingLongToken],
                },
                longInterestUsingShortToken: {
                    methodName: "getUint",
                    params: [keys.longInterestUsingShortToken],
                },
                shortInterestUsingLongToken: {
                    methodName: "getUint",
                    params: [keys.shortInterestUsingLongToken],
                },
                shortInterestUsingShortToken: {
                    methodName: "getUint",
                    params: [keys.shortInterestUsingShortToken],
                },
                longInterestInTokensUsingLongToken: {
                    methodName: "getUint",
                    params: [keys.longInterestInTokensUsingLongToken],
                },
                longInterestInTokensUsingShortToken: {
                    methodName: "getUint",
                    params: [keys.longInterestInTokensUsingShortToken],
                },
                shortInterestInTokensUsingLongToken: {
                    methodName: "getUint",
                    params: [keys.shortInterestInTokensUsingLongToken],
                },
                shortInterestInTokensUsingShortToken: {
                    methodName: "getUint",
                    params: [keys.shortInterestInTokensUsingShortToken],
                },
            },
        };
    }
    return request;
}
exports.buildMarketsValuesRequest = buildMarketsValuesRequest;
async function buildMarketsConfigsRequest(chainId, { marketsData, marketsAddresses, dataStoreAddress, }) {
    const request = {};
    for (const marketAddress of marketsAddresses || []) {
        let prebuiltHashedKeys = prebuilt_1.HASHED_MARKET_CONFIG_KEYS[chainId]?.[marketAddress];
        if (!prebuiltHashedKeys) {
            // eslint-disable-next-line no-console
            console.warn(`No pre-built hashed config keys found for the market ${marketAddress}. Run \`yarn prebuild\` to generate them.`);
            if (!marketsData?.[marketAddress]) {
                throw new Error(`No market data found for the market ${marketAddress}`);
            }
            prebuiltHashedKeys = (0, marketKeysAndConfigs_1.hashMarketConfigKeys)(marketsData[marketAddress]);
        }
        request[`${marketAddress}-dataStore`] = {
            contractAddress: dataStoreAddress,
            abiId: "DataStore",
            calls: {
                isDisabled: {
                    methodName: "getBool",
                    params: [prebuiltHashedKeys.isDisabled],
                },
                maxLongPoolAmount: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.maxLongPoolAmount],
                },
                maxShortPoolAmount: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.maxShortPoolAmount],
                },
                maxLongPoolUsdForDeposit: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.maxLongPoolUsdForDeposit],
                },
                maxShortPoolUsdForDeposit: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.maxShortPoolUsdForDeposit],
                },
                longPoolAmountAdjustment: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.longPoolAmountAdjustment],
                },
                shortPoolAmountAdjustment: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.shortPoolAmountAdjustment],
                },
                reserveFactorLong: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.reserveFactorLong],
                },
                reserveFactorShort: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.reserveFactorShort],
                },
                openInterestReserveFactorLong: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.openInterestReserveFactorLong],
                },
                openInterestReserveFactorShort: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.openInterestReserveFactorShort],
                },
                maxOpenInterestLong: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.maxOpenInterestLong],
                },
                maxOpenInterestShort: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.maxOpenInterestShort],
                },
                minPositionImpactPoolAmount: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.minPositionImpactPoolAmount],
                },
                positionImpactPoolDistributionRate: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.positionImpactPoolDistributionRate],
                },
                borrowingFactorLong: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.borrowingFactorLong],
                },
                borrowingFactorShort: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.borrowingFactorShort],
                },
                borrowingExponentFactorLong: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.borrowingExponentFactorLong],
                },
                borrowingExponentFactorShort: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.borrowingExponentFactorShort],
                },
                fundingFactor: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.fundingFactor],
                },
                fundingExponentFactor: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.fundingExponentFactor],
                },
                fundingIncreaseFactorPerSecond: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.fundingIncreaseFactorPerSecond],
                },
                fundingDecreaseFactorPerSecond: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.fundingDecreaseFactorPerSecond],
                },
                thresholdForStableFunding: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.thresholdForStableFunding],
                },
                thresholdForDecreaseFunding: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.thresholdForDecreaseFunding],
                },
                minFundingFactorPerSecond: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.minFundingFactorPerSecond],
                },
                maxFundingFactorPerSecond: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.maxFundingFactorPerSecond],
                },
                maxPnlFactorForTradersLong: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.maxPnlFactorForTradersLong],
                },
                maxPnlFactorForTradersShort: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.maxPnlFactorForTradersShort],
                },
                positionFeeFactorForPositiveImpact: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.positionFeeFactorForPositiveImpact],
                },
                positionFeeFactorForNegativeImpact: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.positionFeeFactorForNegativeImpact],
                },
                positionImpactFactorPositive: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.positionImpactFactorPositive],
                },
                positionImpactFactorNegative: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.positionImpactFactorNegative],
                },
                maxPositionImpactFactorPositive: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.maxPositionImpactFactorPositive],
                },
                maxPositionImpactFactorNegative: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.maxPositionImpactFactorNegative],
                },
                maxPositionImpactFactorForLiquidations: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.maxPositionImpactFactorForLiquidations],
                },
                minCollateralFactor: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.minCollateralFactor],
                },
                minCollateralFactorForOpenInterestLong: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.minCollateralFactorForOpenInterestLong],
                },
                minCollateralFactorForOpenInterestShort: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.minCollateralFactorForOpenInterestShort],
                },
                positionImpactExponentFactor: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.positionImpactExponentFactor],
                },
                swapFeeFactorForPositiveImpact: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.swapFeeFactorForPositiveImpact],
                },
                swapFeeFactorForNegativeImpact: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.swapFeeFactorForNegativeImpact],
                },
                atomicSwapFeeFactor: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.atomicSwapFeeFactor],
                },
                swapImpactFactorPositive: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.swapImpactFactorPositive],
                },
                swapImpactFactorNegative: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.swapImpactFactorNegative],
                },
                swapImpactExponentFactor: {
                    methodName: "getUint",
                    params: [prebuiltHashedKeys.swapImpactExponentFactor],
                },
                virtualMarketId: {
                    methodName: "getBytes32",
                    params: [prebuiltHashedKeys.virtualMarketId],
                },
                virtualShortTokenId: {
                    methodName: "getBytes32",
                    params: [prebuiltHashedKeys.virtualShortTokenId],
                },
                virtualLongTokenId: {
                    methodName: "getBytes32",
                    params: [prebuiltHashedKeys.virtualLongTokenId],
                },
            },
        };
    }
    return request;
}
exports.buildMarketsConfigsRequest = buildMarketsConfigsRequest;
