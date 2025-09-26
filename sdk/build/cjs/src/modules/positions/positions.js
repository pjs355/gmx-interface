"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Positions = void 0;
const viem_1 = require("viem");
const chains_1 = require("configs/chains");
const contracts_1 = require("configs/contracts");
const dataStore_1 = require("configs/dataStore");
const fees_1 = require("utils/fees");
const markets_1 = require("utils/markets");
const numbers_1 = require("utils/numbers");
const objects_1 = require("utils/objects");
const positions_1 = require("utils/positions");
const positions_2 = require("utils/positions");
const prices_1 = require("utils/prices");
const referrals_1 = require("utils/referrals");
const tokens_1 = require("utils/tokens");
const base_1 = require("../base");
class Positions extends base_1.Module {
    constructor() {
        super(...arguments);
        this._positionsConstants = undefined;
    }
    getKeysAndPricesParams(p) {
        const { marketsData, tokensData } = p;
        const account = this.account;
        const values = {
            allPositionsKeys: [],
            marketsPrices: [],
            marketsKeys: [],
        };
        if (!account || !marketsData || !tokensData) {
            return values;
        }
        const markets = Object.values(marketsData);
        for (const market of markets) {
            const marketPrices = (0, markets_1.getContractMarketPrices)(tokensData, market);
            if (!marketPrices || market.isSpotOnly) {
                continue;
            }
            values.marketsKeys.push(market.marketTokenAddress);
            values.marketsPrices.push(marketPrices);
            const collaterals = market.isSameCollaterals
                ? [market.longTokenAddress]
                : [market.longTokenAddress, market.shortTokenAddress];
            for (const collateralAddress of collaterals) {
                for (const isLong of [true, false]) {
                    const positionKey = (0, positions_1.getPositionKey)(account, market.marketTokenAddress, collateralAddress, isLong);
                    values.allPositionsKeys.push(positionKey);
                }
            }
        }
        return values;
    }
    getPositionsData(p) {
        const { positionsData, allPositionsKeys } = p;
        if (!allPositionsKeys) {
            return undefined;
        }
        return allPositionsKeys.reduce((acc, key) => {
            let position;
            if ((0, objects_1.getByKey)(positionsData, key)) {
                position = { ...(0, objects_1.getByKey)(positionsData, key) };
            }
            else {
                return acc;
            }
            if (position.sizeInUsd > 0) {
                acc[key] = position;
            }
            return acc;
        }, {});
    }
    async getPositions(p) {
        const chainId = this.chainId;
        const account = this.sdk.config.account;
        const keysAndPrices = this.getKeysAndPricesParams(p);
        const request = {
            reader: {
                contractAddress: (0, contracts_1.getContract)(chainId, "SyntheticsReader"),
                abiId: "SyntheticsReader",
                calls: {
                    positions: {
                        methodName: "getAccountPositionInfoList",
                        params: [
                            (0, contracts_1.getContract)(chainId, "DataStore"),
                            (0, contracts_1.getContract)(chainId, "ReferralStorage"),
                            account,
                            keysAndPrices.marketsKeys,
                            keysAndPrices.marketsPrices,
                            viem_1.zeroAddress,
                            p.start ?? 0,
                            p.end ?? 1000,
                        ],
                    },
                },
            },
        };
        const positions = await this.sdk.executeMulticall(request).then((res) => {
            const positions = res.data.reader.positions.returnValues;
            return positions.reduce((positionsMap, positionInfo) => {
                const { position, fees, basePnlUsd } = positionInfo;
                const { addresses, numbers, flags, data } = position;
                const { account, market: marketAddress, collateralToken: collateralTokenAddress } = addresses;
                // Empty position
                if (numbers.increasedAtTime == 0n) {
                    return positionsMap;
                }
                const positionKey = (0, positions_1.getPositionKey)(account, marketAddress, collateralTokenAddress, flags.isLong);
                const contractPositionKey = (0, dataStore_1.hashedPositionKey)(account, marketAddress, collateralTokenAddress, flags.isLong);
                positionsMap[positionKey] = {
                    key: positionKey,
                    contractKey: contractPositionKey,
                    account,
                    marketAddress,
                    collateralTokenAddress,
                    sizeInUsd: numbers.sizeInUsd,
                    sizeInTokens: numbers.sizeInTokens,
                    collateralAmount: numbers.collateralAmount,
                    increasedAtTime: numbers.increasedAtTime,
                    decreasedAtTime: numbers.decreasedAtTime,
                    isLong: flags.isLong,
                    pendingBorrowingFeesUsd: fees.borrowing.borrowingFeeUsd,
                    fundingFeeAmount: fees.funding.fundingFeeAmount,
                    claimableLongTokenAmount: fees.funding.claimableLongTokenAmount,
                    claimableShortTokenAmount: fees.funding.claimableShortTokenAmount,
                    pnl: basePnlUsd,
                    positionFeeAmount: fees.positionFeeAmount,
                    traderDiscountAmount: fees.referral.traderDiscountAmount,
                    uiFeeAmount: fees.ui.uiFeeAmount,
                    data,
                };
                return positionsMap;
            }, {});
        });
        const positionsData = this.getPositionsData({
            positionsData: positions,
            allPositionsKeys: keysAndPrices?.allPositionsKeys,
        });
        return {
            positionsData,
        };
    }
    getUiFeeFactorRequest() {
        if (!this.account) {
            return Promise.resolve(0n);
        }
        return this.sdk
            .executeMulticall({
            dataStore: {
                contractAddress: (0, contracts_1.getContract)(this.chainId, "DataStore"),
                abiId: "DataStore",
                calls: {
                    keys: {
                        methodName: "getUint",
                        params: [(0, dataStore_1.uiFeeFactorKey)(this.account)],
                    },
                },
            },
        })
            .then((res) => {
            return BigInt(res.data.dataStore.keys.returnValues[0] ?? 0n);
        });
    }
    async getPositionsConstants() {
        if (this._positionsConstants) {
            return this._positionsConstants;
        }
        const constants = await this.sdk
            .executeMulticall({
            dataStore: {
                contractAddress: (0, contracts_1.getContract)(this.chainId, "DataStore"),
                abiId: "DataStore",
                calls: {
                    minCollateralUsd: {
                        methodName: "getUint",
                        params: [dataStore_1.MIN_COLLATERAL_USD_KEY],
                    },
                    minPositionSizeUsd: {
                        methodName: "getUint",
                        params: [dataStore_1.MIN_POSITION_SIZE_USD_KEY],
                    },
                    maxAutoCancelOrders: {
                        methodName: "getUint",
                        params: [dataStore_1.MAX_AUTO_CANCEL_ORDERS_KEY],
                    },
                },
            },
        })
            .then((res) => {
            return {
                minCollateralUsd: res.data.dataStore.minCollateralUsd.returnValues[0],
                minPositionSizeUsd: res.data.dataStore.minPositionSizeUsd.returnValues[0],
                maxAutoCancelOrders: res.data.dataStore.maxAutoCancelOrders.returnValues[0],
            };
        });
        this._positionsConstants = constants;
        return constants;
    }
    async getMaxAutoCancelOrders({ draftOrdersCount = 0, positionOrders = [], }) {
        const constants = await this.getPositionsConstants();
        const maxAutoCancelOrders = constants.maxAutoCancelOrders;
        const existingAutoCancelOrders = positionOrders.filter((order) => order.autoCancel);
        let warning = false;
        let autoCancelOrdersLimit = 0;
        if (maxAutoCancelOrders === undefined) {
            return {
                warning,
                autoCancelOrdersLimit,
            };
        }
        const allowedAutoCancelOrders = Number(maxAutoCancelOrders) - 1;
        autoCancelOrdersLimit = allowedAutoCancelOrders - existingAutoCancelOrders.length;
        const canAddAutoCancelOrder = autoCancelOrdersLimit - draftOrdersCount > 0;
        if (!canAddAutoCancelOrder) {
            warning = true;
        }
        return {
            warning,
            autoCancelOrdersLimit,
        };
    }
    async getCodeOwner(code) {
        if (!code) {
            return undefined;
        }
        const referralStorageAddress = (0, contracts_1.getContract)(this.chainId, "ReferralStorage");
        return this.sdk
            .executeMulticall({
            referralStorage: {
                contractAddress: referralStorageAddress,
                abiId: "ReferralStorage",
                calls: {
                    codeOwner: {
                        methodName: "codeOwners",
                        params: [code],
                    },
                },
            },
        })
            .then((res) => {
            return res.data.referralStorage.codeOwner.returnValues[0];
        });
    }
    async getUserRefferalCode() {
        if (this.chainId === chains_1.BOTANIX) {
            return {
                attachedOnChain: false,
                userReferralCode: undefined,
                userReferralCodeString: undefined,
                referralCodeForTxn: viem_1.zeroHash,
            };
        }
        const referralStorageAddress = (0, contracts_1.getContract)(this.chainId, "ReferralStorage");
        const onChainCode = await this.sdk.executeMulticall({
            referralStorage: {
                contractAddress: referralStorageAddress,
                abiId: "ReferralStorage",
                calls: {
                    traderReferralCodes: {
                        methodName: "traderReferralCodes",
                        params: [this.account],
                    },
                },
            },
        });
        let attachedOnChain = false;
        let userReferralCode = undefined;
        let userReferralCodeString = undefined;
        let referralCodeForTxn = viem_1.zeroHash;
        if (onChainCode && onChainCode === viem_1.zeroHash) {
            attachedOnChain = true;
            userReferralCode = onChainCode;
            userReferralCodeString = (0, referrals_1.decodeReferralCode)(onChainCode);
        }
        return {
            attachedOnChain,
            userReferralCode,
            userReferralCodeString,
            referralCodeForTxn,
        };
    }
    getAffiliateTier() {
        const referralStorageAddress = (0, contracts_1.getContract)(this.chainId, "ReferralStorage");
        return this.sdk
            .executeMulticall({
            referralStorage: {
                contractAddress: referralStorageAddress,
                abiId: "ReferralStorage",
                calls: {
                    referrerTiers: {
                        methodName: "referrerTiers",
                        params: [this.account],
                    },
                },
            },
        })
            .then((res) => {
            return res.data.referralStorage.referrerTiers.returnValues[0];
        });
    }
    getTiers(tierLevel) {
        if (tierLevel === undefined) {
            return {
                totalRebate: 0n,
                discountShare: 0n,
            };
        }
        const referralStorageAddress = (0, contracts_1.getContract)(this.chainId, "ReferralStorage");
        return this.sdk
            .executeMulticall({
            referralStorage: {
                contractAddress: referralStorageAddress,
                abiId: "ReferralStorage",
                calls: {
                    tiers: {
                        methodName: "tiers",
                        params: [tierLevel],
                    },
                },
            },
        })
            .then((res) => {
            const [totalRebate, discountShare] = res.data.referralStorage.tiers.returnValues ?? [];
            return {
                totalRebate,
                discountShare,
            };
        });
    }
    async getReferrerDiscountShare(owner) {
        if (!owner) {
            return undefined;
        }
        return this.sdk
            .executeMulticall({
            referralStorage: {
                contractAddress: (0, contracts_1.getContract)(this.chainId, "ReferralStorage"),
                abiId: "ReferralStorage",
                calls: {
                    referrerDiscountShares: {
                        methodName: "referrerDiscountShares",
                        params: [owner],
                    },
                },
            },
        })
            .then((res) => {
            return res.data.referralStorage.referrerDiscountShares.returnValues[0];
        });
    }
    async getUserReferralInfo() {
        const { userReferralCode, userReferralCodeString, attachedOnChain, referralCodeForTxn } = await this.getUserRefferalCode();
        const codeOwner = await this.getCodeOwner(userReferralCodeString);
        const tierId = await this.getAffiliateTier();
        const { totalRebate, discountShare } = await this.getTiers(tierId);
        const customDiscountShare = await this.getReferrerDiscountShare(codeOwner);
        const finalDiscountShare = (customDiscountShare ?? 0n) > 0 ? customDiscountShare : discountShare;
        if (!userReferralCode ||
            !userReferralCodeString ||
            !codeOwner ||
            tierId === undefined ||
            totalRebate === undefined ||
            finalDiscountShare === undefined ||
            !referralCodeForTxn) {
            return undefined;
        }
        return {
            userReferralCode,
            userReferralCodeString,
            referralCodeForTxn,
            attachedOnChain,
            affiliate: codeOwner,
            tierId,
            totalRebate,
            totalRebateFactor: (0, numbers_1.basisPointsToFloat)(totalRebate),
            discountShare: finalDiscountShare,
            discountFactor: (0, numbers_1.basisPointsToFloat)(finalDiscountShare),
        };
    }
    async getPositionsInfo(p) {
        const { showPnlInLeverage, marketsInfoData, tokensData } = p;
        const { positionsData } = await this.getPositions({
            marketsData: marketsInfoData,
            tokensData,
        });
        const { minCollateralUsd } = await this.getPositionsConstants();
        const uiFeeFactor = await this.getUiFeeFactorRequest();
        const userReferralInfo = await this.getUserReferralInfo();
        if (!positionsData || minCollateralUsd === undefined) {
            return {};
        }
        const positionsInfoData = Object.keys(positionsData).reduce((acc, positionKey) => {
            const position = (0, objects_1.getByKey)(positionsData, positionKey);
            const marketInfo = (0, objects_1.getByKey)(marketsInfoData, position.marketAddress);
            const indexToken = marketInfo?.indexToken;
            const longToken = (0, objects_1.getByKey)(tokensData, marketInfo?.longTokenAddress);
            const shortToken = (0, objects_1.getByKey)(tokensData, marketInfo?.shortTokenAddress);
            const pnlToken = position.isLong ? marketInfo?.longToken : marketInfo?.shortToken;
            const collateralToken = (0, objects_1.getByKey)(tokensData, position.collateralTokenAddress);
            if (!marketInfo || !indexToken || !pnlToken || !collateralToken || !longToken || !shortToken) {
                return acc;
            }
            const markPrice = (0, prices_1.getMarkPrice)({ prices: indexToken.prices, isLong: position.isLong, isIncrease: false });
            const collateralMinPrice = collateralToken.prices.minPrice;
            const entryPrice = (0, positions_1.getEntryPrice)({
                sizeInTokens: position.sizeInTokens,
                sizeInUsd: position.sizeInUsd,
                indexToken,
            });
            const pendingFundingFeesUsd = (0, tokens_1.convertToUsd)(position.fundingFeeAmount, collateralToken.decimals, collateralToken.prices.minPrice);
            const pendingClaimableFundingFeesLongUsd = (0, tokens_1.convertToUsd)(position.claimableLongTokenAmount, marketInfo.longToken.decimals, marketInfo.longToken.prices.minPrice);
            const pendingClaimableFundingFeesShortUsd = (0, tokens_1.convertToUsd)(position.claimableShortTokenAmount, marketInfo.shortToken.decimals, marketInfo.shortToken.prices.minPrice);
            const pendingClaimableFundingFeesUsd = pendingClaimableFundingFeesLongUsd + pendingClaimableFundingFeesShortUsd;
            const totalPendingFeesUsd = (0, positions_2.getPositionPendingFeesUsd)({
                pendingBorrowingFeesUsd: position.pendingBorrowingFeesUsd,
                pendingFundingFeesUsd,
            });
            const closingPriceImpactDeltaUsd = (0, fees_1.getPriceImpactForPosition)(marketInfo, position.sizeInUsd * -1n, position.isLong, { fallbackToZero: true });
            const positionFeeInfo = (0, fees_1.getPositionFee)(marketInfo, position.sizeInUsd, closingPriceImpactDeltaUsd > 0, userReferralInfo, uiFeeFactor);
            const closingFeeUsd = positionFeeInfo.positionFeeUsd;
            const uiFeeUsd = positionFeeInfo.uiFeeUsd ?? 0n;
            const collateralUsd = (0, tokens_1.convertToUsd)(position.collateralAmount, collateralToken.decimals, collateralMinPrice);
            const remainingCollateralUsd = collateralUsd - totalPendingFeesUsd;
            const remainingCollateralAmount = (0, tokens_1.convertToTokenAmount)(remainingCollateralUsd, collateralToken.decimals, collateralMinPrice);
            const pnl = (0, positions_1.getPositionPnlUsd)({
                marketInfo: marketInfo,
                sizeInUsd: position.sizeInUsd,
                sizeInTokens: position.sizeInTokens,
                markPrice,
                isLong: position.isLong,
            });
            const pnlPercentage = collateralUsd !== undefined && collateralUsd != 0n ? (0, numbers_1.getBasisPoints)(pnl, collateralUsd) : 0n;
            const netValue = (0, positions_1.getPositionNetValue)({
                collateralUsd: collateralUsd,
                pnl,
                pendingBorrowingFeesUsd: position.pendingBorrowingFeesUsd,
                pendingFundingFeesUsd: pendingFundingFeesUsd,
                closingFeeUsd,
                uiFeeUsd,
            });
            const pnlAfterFees = pnl - totalPendingFeesUsd - closingFeeUsd - uiFeeUsd;
            const pnlAfterFeesPercentage = collateralUsd != 0n ? (0, numbers_1.getBasisPoints)(pnlAfterFees, collateralUsd + closingFeeUsd) : 0n;
            const leverage = (0, positions_1.getLeverage)({
                sizeInUsd: position.sizeInUsd,
                collateralUsd: collateralUsd,
                pnl: showPnlInLeverage ? pnl : undefined,
                pendingBorrowingFeesUsd: position.pendingBorrowingFeesUsd,
                pendingFundingFeesUsd: pendingFundingFeesUsd,
            });
            const leverageWithPnl = (0, positions_1.getLeverage)({
                sizeInUsd: position.sizeInUsd,
                collateralUsd: collateralUsd,
                pnl,
                pendingBorrowingFeesUsd: position.pendingBorrowingFeesUsd,
                pendingFundingFeesUsd: pendingFundingFeesUsd,
            });
            const maxAllowedLeverage = (0, markets_1.getMaxAllowedLeverageByMinCollateralFactor)(marketInfo.minCollateralFactor);
            const hasLowCollateral = (leverage !== undefined && leverage > maxAllowedLeverage) || false;
            const liquidationPrice = (0, positions_1.getLiquidationPrice)({
                marketInfo,
                collateralToken,
                sizeInUsd: position.sizeInUsd,
                sizeInTokens: position.sizeInTokens,
                collateralUsd,
                collateralAmount: position.collateralAmount,
                userReferralInfo,
                minCollateralUsd,
                pendingBorrowingFeesUsd: position.pendingBorrowingFeesUsd,
                pendingFundingFeesUsd,
                isLong: position.isLong,
            });
            const indexName = (0, markets_1.getMarketIndexName)({ indexToken, isSpotOnly: false });
            const poolName = (0, markets_1.getMarketPoolName)({ longToken, shortToken });
            acc[positionKey] = {
                ...position,
                market: marketInfo,
                marketInfo,
                indexName,
                poolName,
                indexToken,
                collateralToken,
                pnlToken,
                longToken,
                shortToken,
                markPrice,
                entryPrice,
                liquidationPrice,
                collateralUsd,
                remainingCollateralUsd,
                remainingCollateralAmount,
                hasLowCollateral,
                leverage,
                leverageWithPnl,
                pnl,
                pnlPercentage,
                pnlAfterFees,
                pnlAfterFeesPercentage,
                netValue,
                closingFeeUsd,
                uiFeeUsd,
                pendingFundingFeesUsd,
                pendingClaimableFundingFeesUsd,
            };
            return acc;
        }, {});
        return positionsInfoData;
    }
}
exports.Positions = Positions;
Positions.MAX_PENDING_UPDATE_AGE = 600 * 1000; // 10 minutes
