"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashMarketValuesKeys = exports.hashMarketConfigKeys = void 0;
const dataStore_1 = require("configs/dataStore");
const hash_1 = require("utils/hash");
function hashMarketConfigKeys(market) {
    const marketAddress = market.marketTokenAddress;
    return (0, hash_1.hashDataMap)({
        isDisabled: [
            ["bytes32", "address"],
            [dataStore_1.IS_MARKET_DISABLED_KEY, marketAddress],
        ],
        maxLongPoolAmount: [
            ["bytes32", "address", "address"],
            [dataStore_1.MAX_POOL_AMOUNT_KEY, marketAddress, market.longTokenAddress],
        ],
        maxShortPoolAmount: [
            ["bytes32", "address", "address"],
            [dataStore_1.MAX_POOL_AMOUNT_KEY, marketAddress, market.shortTokenAddress],
        ],
        maxLongPoolUsdForDeposit: [
            ["bytes32", "address", "address"],
            [dataStore_1.MAX_POOL_USD_FOR_DEPOSIT_KEY, marketAddress, market.longTokenAddress],
        ],
        maxShortPoolUsdForDeposit: [
            ["bytes32", "address", "address"],
            [dataStore_1.MAX_POOL_USD_FOR_DEPOSIT_KEY, marketAddress, market.shortTokenAddress],
        ],
        longPoolAmountAdjustment: [
            ["bytes32", "address", "address"],
            [dataStore_1.POOL_AMOUNT_ADJUSTMENT_KEY, marketAddress, market.longTokenAddress],
        ],
        shortPoolAmountAdjustment: [
            ["bytes32", "address", "address"],
            [dataStore_1.POOL_AMOUNT_ADJUSTMENT_KEY, marketAddress, market.shortTokenAddress],
        ],
        reserveFactorLong: [
            ["bytes32", "address", "bool"],
            [dataStore_1.RESERVE_FACTOR_KEY, marketAddress, true],
        ],
        reserveFactorShort: [
            ["bytes32", "address", "bool"],
            [dataStore_1.RESERVE_FACTOR_KEY, marketAddress, false],
        ],
        openInterestReserveFactorLong: [
            ["bytes32", "address", "bool"],
            [dataStore_1.OPEN_INTEREST_RESERVE_FACTOR_KEY, marketAddress, true],
        ],
        openInterestReserveFactorShort: [
            ["bytes32", "address", "bool"],
            [dataStore_1.OPEN_INTEREST_RESERVE_FACTOR_KEY, marketAddress, false],
        ],
        maxOpenInterestLong: [
            ["bytes32", "address", "bool"],
            [dataStore_1.MAX_OPEN_INTEREST_KEY, marketAddress, true],
        ],
        maxOpenInterestShort: [
            ["bytes32", "address", "bool"],
            [dataStore_1.MAX_OPEN_INTEREST_KEY, marketAddress, false],
        ],
        minPositionImpactPoolAmount: [
            ["bytes32", "address"],
            [dataStore_1.MIN_POSITION_IMPACT_POOL_AMOUNT_KEY, marketAddress],
        ],
        positionImpactPoolDistributionRate: [
            ["bytes32", "address"],
            [dataStore_1.POSITION_IMPACT_POOL_DISTRIBUTION_RATE_KEY, marketAddress],
        ],
        borrowingFactorLong: [
            ["bytes32", "address", "bool"],
            [dataStore_1.BORROWING_FACTOR_KEY, marketAddress, true],
        ],
        borrowingFactorShort: [
            ["bytes32", "address", "bool"],
            [dataStore_1.BORROWING_FACTOR_KEY, marketAddress, false],
        ],
        borrowingExponentFactorLong: [
            ["bytes32", "address", "bool"],
            [dataStore_1.BORROWING_EXPONENT_FACTOR_KEY, marketAddress, true],
        ],
        borrowingExponentFactorShort: [
            ["bytes32", "address", "bool"],
            [dataStore_1.BORROWING_EXPONENT_FACTOR_KEY, marketAddress, false],
        ],
        fundingFactor: [
            ["bytes32", "address"],
            [dataStore_1.FUNDING_FACTOR_KEY, marketAddress],
        ],
        fundingExponentFactor: [
            ["bytes32", "address"],
            [dataStore_1.FUNDING_EXPONENT_FACTOR_KEY, marketAddress],
        ],
        fundingIncreaseFactorPerSecond: [
            ["bytes32", "address"],
            [dataStore_1.FUNDING_INCREASE_FACTOR_PER_SECOND, marketAddress],
        ],
        fundingDecreaseFactorPerSecond: [
            ["bytes32", "address"],
            [dataStore_1.FUNDING_DECREASE_FACTOR_PER_SECOND, marketAddress],
        ],
        thresholdForStableFunding: [
            ["bytes32", "address"],
            [dataStore_1.THRESHOLD_FOR_STABLE_FUNDING, marketAddress],
        ],
        thresholdForDecreaseFunding: [
            ["bytes32", "address"],
            [dataStore_1.THRESHOLD_FOR_DECREASE_FUNDING, marketAddress],
        ],
        minFundingFactorPerSecond: [
            ["bytes32", "address"],
            [dataStore_1.MIN_FUNDING_FACTOR_PER_SECOND, marketAddress],
        ],
        maxFundingFactorPerSecond: [
            ["bytes32", "address"],
            [dataStore_1.MAX_FUNDING_FACTOR_PER_SECOND, marketAddress],
        ],
        maxPnlFactorForTradersLong: [
            ["bytes32", "bytes32", "address", "bool"],
            [dataStore_1.MAX_PNL_FACTOR_KEY, dataStore_1.MAX_PNL_FACTOR_FOR_TRADERS_KEY, marketAddress, true],
        ],
        maxPnlFactorForTradersShort: [
            ["bytes32", "bytes32", "address", "bool"],
            [dataStore_1.MAX_PNL_FACTOR_KEY, dataStore_1.MAX_PNL_FACTOR_FOR_TRADERS_KEY, marketAddress, false],
        ],
        positionFeeFactorForPositiveImpact: [
            ["bytes32", "address", "bool"],
            [dataStore_1.POSITION_FEE_FACTOR_KEY, marketAddress, true],
        ],
        positionFeeFactorForNegativeImpact: [
            ["bytes32", "address", "bool"],
            [dataStore_1.POSITION_FEE_FACTOR_KEY, marketAddress, false],
        ],
        positionImpactFactorPositive: [
            ["bytes32", "address", "bool"],
            [dataStore_1.POSITION_IMPACT_FACTOR_KEY, marketAddress, true],
        ],
        positionImpactFactorNegative: [
            ["bytes32", "address", "bool"],
            [dataStore_1.POSITION_IMPACT_FACTOR_KEY, marketAddress, false],
        ],
        maxPositionImpactFactorPositive: [
            ["bytes32", "address", "bool"],
            [dataStore_1.MAX_POSITION_IMPACT_FACTOR_KEY, marketAddress, true],
        ],
        maxPositionImpactFactorNegative: [
            ["bytes32", "address", "bool"],
            [dataStore_1.MAX_POSITION_IMPACT_FACTOR_KEY, marketAddress, false],
        ],
        maxPositionImpactFactorForLiquidations: [
            ["bytes32", "address"],
            [dataStore_1.MAX_POSITION_IMPACT_FACTOR_FOR_LIQUIDATIONS_KEY, marketAddress],
        ],
        minCollateralFactor: [
            ["bytes32", "address"],
            [dataStore_1.MIN_COLLATERAL_FACTOR_KEY, marketAddress],
        ],
        minCollateralFactorForOpenInterestLong: [
            ["bytes32", "address", "bool"],
            [dataStore_1.MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER_KEY, marketAddress, true],
        ],
        minCollateralFactorForOpenInterestShort: [
            ["bytes32", "address", "bool"],
            [dataStore_1.MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER_KEY, marketAddress, false],
        ],
        positionImpactExponentFactor: [
            ["bytes32", "address"],
            [dataStore_1.POSITION_IMPACT_EXPONENT_FACTOR_KEY, marketAddress],
        ],
        swapFeeFactorForPositiveImpact: [
            ["bytes32", "address", "bool"],
            [dataStore_1.SWAP_FEE_FACTOR_KEY, marketAddress, true],
        ],
        swapFeeFactorForNegativeImpact: [
            ["bytes32", "address", "bool"],
            [dataStore_1.SWAP_FEE_FACTOR_KEY, marketAddress, false],
        ],
        atomicSwapFeeFactor: [
            ["bytes32", "address"],
            [dataStore_1.ATOMIC_SWAP_FEE_FACTOR_KEY, marketAddress],
        ],
        swapImpactFactorPositive: [
            ["bytes32", "address", "bool"],
            [dataStore_1.SWAP_IMPACT_FACTOR_KEY, marketAddress, true],
        ],
        swapImpactFactorNegative: [
            ["bytes32", "address", "bool"],
            [dataStore_1.SWAP_IMPACT_FACTOR_KEY, marketAddress, false],
        ],
        swapImpactExponentFactor: [
            ["bytes32", "address"],
            [dataStore_1.SWAP_IMPACT_EXPONENT_FACTOR_KEY, marketAddress],
        ],
        virtualMarketId: [
            ["bytes32", "address"],
            [dataStore_1.VIRTUAL_MARKET_ID_KEY, marketAddress],
        ],
        virtualLongTokenId: [
            ["bytes32", "address"],
            [dataStore_1.VIRTUAL_TOKEN_ID_KEY, market.longTokenAddress],
        ],
        virtualShortTokenId: [
            ["bytes32", "address"],
            [dataStore_1.VIRTUAL_TOKEN_ID_KEY, market.shortTokenAddress],
        ],
    });
}
exports.hashMarketConfigKeys = hashMarketConfigKeys;
function hashMarketValuesKeys(market) {
    const marketAddress = market.marketTokenAddress;
    const marketKeys = (0, hash_1.hashDataMap)({
        longPoolAmount: [
            ["bytes32", "address", "address"],
            [dataStore_1.POOL_AMOUNT_KEY, marketAddress, market.longTokenAddress],
        ],
        shortPoolAmount: [
            ["bytes32", "address", "address"],
            [dataStore_1.POOL_AMOUNT_KEY, marketAddress, market.shortTokenAddress],
        ],
        positionImpactPoolAmount: [
            ["bytes32", "address"],
            [dataStore_1.POSITION_IMPACT_POOL_AMOUNT_KEY, marketAddress],
        ],
        swapImpactPoolAmountLong: [
            ["bytes32", "address", "address"],
            [dataStore_1.SWAP_IMPACT_POOL_AMOUNT_KEY, marketAddress, market.longTokenAddress],
        ],
        swapImpactPoolAmountShort: [
            ["bytes32", "address", "address"],
            [dataStore_1.SWAP_IMPACT_POOL_AMOUNT_KEY, marketAddress, market.shortTokenAddress],
        ],
        longInterestUsingLongToken: [
            ["bytes32", "address", "address", "bool"],
            [dataStore_1.OPEN_INTEREST_KEY, marketAddress, market.longTokenAddress, true],
        ],
        longInterestUsingShortToken: [
            ["bytes32", "address", "address", "bool"],
            [dataStore_1.OPEN_INTEREST_KEY, marketAddress, market.shortTokenAddress, true],
        ],
        shortInterestUsingLongToken: [
            ["bytes32", "address", "address", "bool"],
            [dataStore_1.OPEN_INTEREST_KEY, marketAddress, market.longTokenAddress, false],
        ],
        shortInterestUsingShortToken: [
            ["bytes32", "address", "address", "bool"],
            [dataStore_1.OPEN_INTEREST_KEY, marketAddress, market.shortTokenAddress, false],
        ],
        longInterestInTokensUsingLongToken: [
            ["bytes32", "address", "address", "bool"],
            [dataStore_1.OPEN_INTEREST_IN_TOKENS_KEY, marketAddress, market.longTokenAddress, true],
        ],
        longInterestInTokensUsingShortToken: [
            ["bytes32", "address", "address", "bool"],
            [dataStore_1.OPEN_INTEREST_IN_TOKENS_KEY, marketAddress, market.shortTokenAddress, true],
        ],
        shortInterestInTokensUsingLongToken: [
            ["bytes32", "address", "address", "bool"],
            [dataStore_1.OPEN_INTEREST_IN_TOKENS_KEY, marketAddress, market.longTokenAddress, false],
        ],
        shortInterestInTokensUsingShortToken: [
            ["bytes32", "address", "address", "bool"],
            [dataStore_1.OPEN_INTEREST_IN_TOKENS_KEY, marketAddress, market.shortTokenAddress, false],
        ],
    });
    return marketKeys;
}
exports.hashMarketValuesKeys = hashMarketValuesKeys;
