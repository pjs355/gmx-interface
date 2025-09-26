"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRelayerFeeToken = exports.getDefaultGasPaymentToken = exports.getGasPaymentTokens = exports.MIN_RELAYER_FEE_USD = exports.MIN_GELATO_USD_BALANCE_FOR_SPONSORED_CALL = exports.DEFAULT_EXPRESS_ORDER_DEADLINE_DURATION = exports.DEFAULT_PERMIT_DEADLINE_DURATION = exports.DEFAULT_SUBACCOUNT_MAX_ALLOWED_COUNT = exports.DEFAULT_SUBACCOUNT_EXPIRY_DURATION = exports.SUBACCOUNT_DOCS_URL = exports.SUBACCOUNT_MESSAGE = void 0;
const numbers_1 = require("utils/numbers");
const time_1 = require("utils/time");
const chains_1 = require("./chains");
const tokens_1 = require("./tokens");
exports.SUBACCOUNT_MESSAGE = "Generate a GMX 1CT (One-Click Trading) session. Only sign this message on a trusted website.";
exports.SUBACCOUNT_DOCS_URL = "https://docs.gmx.io/docs/trading/v2/#one-click-trading";
exports.DEFAULT_SUBACCOUNT_EXPIRY_DURATION = (0, time_1.periodToSeconds)(7, "1d"); // 1 week
exports.DEFAULT_SUBACCOUNT_MAX_ALLOWED_COUNT = 90;
exports.DEFAULT_PERMIT_DEADLINE_DURATION = (0, time_1.periodToSeconds)(1, "1h");
exports.DEFAULT_EXPRESS_ORDER_DEADLINE_DURATION = (0, time_1.periodToSeconds)(1, "1h");
exports.MIN_GELATO_USD_BALANCE_FOR_SPONSORED_CALL = (0, numbers_1.expandDecimals)(100, numbers_1.USD_DECIMALS); // 100$
exports.MIN_RELAYER_FEE_USD = 5n ** BigInt(numbers_1.USD_DECIMALS - 1); // 0.5$
const GAS_PAYMENT_TOKENS = {
    [chains_1.BASE]: [(0, tokens_1.getTokenBySymbol)(chains_1.BASE, "ETH").address],
    [chains_1.ARBITRUM]: [(0, tokens_1.getTokenBySymbol)(chains_1.ARBITRUM, "USDC").address, (0, tokens_1.getTokenBySymbol)(chains_1.ARBITRUM, "WETH").address],
    [chains_1.AVALANCHE]: [(0, tokens_1.getTokenBySymbol)(chains_1.AVALANCHE, "USDC").address, (0, tokens_1.getTokenBySymbol)(chains_1.AVALANCHE, "WAVAX").address],
    [chains_1.AVALANCHE_FUJI]: [
        (0, tokens_1.getTokenBySymbol)(chains_1.AVALANCHE_FUJI, "USDC").address,
        (0, tokens_1.getTokenBySymbol)(chains_1.AVALANCHE_FUJI, "WAVAX").address,
    ],
    [chains_1.BOTANIX]: [(0, tokens_1.getTokenBySymbol)(chains_1.BOTANIX, "pBTC").address],
};
function getGasPaymentTokens(chainId) {
    return GAS_PAYMENT_TOKENS[chainId];
}
exports.getGasPaymentTokens = getGasPaymentTokens;
function getDefaultGasPaymentToken(chainId) {
    return GAS_PAYMENT_TOKENS[chainId][0];
}
exports.getDefaultGasPaymentToken = getDefaultGasPaymentToken;
function getRelayerFeeToken(chainId) {
    return (0, tokens_1.getWrappedToken)(chainId);
}
exports.getRelayerFeeToken = getRelayerFeeToken;
