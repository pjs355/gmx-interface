import { decodeErrorResult, encodeFunctionData, withRetry } from "viem";
import { abis } from "abis";
import { getContract } from "configs/contracts";
import { convertTokenAddress } from "configs/tokens";
import { extractTxnError } from "./errors";
import { convertToContractPrice, getTokenData } from "./tokens";
class SimulateExecuteOrderError extends Error {
    constructor(message, cause) {
        super(message);
        this.cause = cause;
    }
}
/**
 *
 * @deprecated use simulateExecution instead
 */
export async function simulateExecuteOrder(sdk, p) {
    const chainId = sdk.chainId;
    const client = sdk.publicClient;
    const account = sdk.config.account;
    if (!account) {
        throw new Error("Account is not defined");
    }
    const multicallAddress = getContract(chainId, "Multicall");
    const exchangeRouterAddress = getContract(chainId, "ExchangeRouter");
    const blockTimestamp = await client.readContract({
        address: multicallAddress,
        abi: abis.Multicall,
        functionName: "getCurrentBlockTimestamp",
        args: [],
    });
    const blockNumber = await client.getBlockNumber();
    const { primaryTokens, primaryPrices } = getSimulationPrices(chainId, p.tokensData, p.primaryPriceOverrides);
    const priceTimestamp = blockTimestamp + 10n;
    const simulationPriceParams = {
        primaryTokens: primaryTokens,
        primaryPrices: primaryPrices,
        minTimestamp: priceTimestamp,
        maxTimestamp: priceTimestamp,
    };
    let simulationPayloadData = [...p.createMulticallPayload];
    const routerAbi = abis.ExchangeRouter;
    const routerAddress = exchangeRouterAddress;
    let encodedFunctionData;
    encodedFunctionData = encodeFunctionData({
        abi: routerAbi,
        functionName: "simulateExecuteLatestOrder",
        args: [simulationPriceParams],
    });
    simulationPayloadData.push(encodedFunctionData);
    try {
        await withRetry(async () => {
            return await client.simulateContract({
                address: routerAddress,
                abi: routerAbi,
                functionName: "multicall",
                args: [simulationPayloadData],
                value: p.value,
                account: account,
                blockNumber,
            });
        }, {
            retryCount: 2,
            delay: 200,
            shouldRetry: (error) => {
                const [message] = extractTxnError(error);
                return message?.toLocaleLowerCase()?.includes("unsupported block number") ?? false;
            },
        });
    }
    catch (txnError) {
        let msg = undefined;
        try {
            const errorData = extractDataFromError(txnError?.info?.error?.message) ?? extractDataFromError(txnError?.message);
            const error = new SimulateExecuteOrderError("No data found in error.", txnError);
            if (!errorData)
                throw error;
            const decodedError = decodeErrorResult({
                abi: abis.CustomErrors,
                data: errorData,
            });
            const isSimulationPassed = decodedError.errorName === "EndOfOracleSimulation";
            if (isSimulationPassed) {
                return;
            }
            const parsedArgs = Object.keys(decodedError.args ?? {}).reduce((acc, k) => {
                const args = (decodedError.args ?? {});
                acc[k] = args[k]?.toString();
                return acc;
            }, {});
            msg = `${txnError?.info?.error?.message ?? decodedError.errorName ?? txnError?.message} ${JSON.stringify(parsedArgs, null, 2)}`;
        }
        catch (parsingError) {
            /* eslint-disable-next-line */
            console.error(parsingError);
            // msg = `Execute order simulation failed`;
            msg = `Transaction failed`;
            // throw new Error(msg);
        }
        // throw txnError;
    }
}
export function extractDataFromError(errorMessage) {
    if (typeof errorMessage !== "string")
        return null;
    const pattern = /Unable to decode signature "([^"]+)"/;
    const match = errorMessage.match(pattern);
    if (match && match[1]) {
        return match[1];
    }
    return null;
}
function getSimulationPrices(chainId, tokensData, primaryPricesMap) {
    const tokenAddresses = Object.keys(tokensData);
    const primaryTokens = [];
    const primaryPrices = [];
    for (const address of tokenAddresses) {
        const token = getTokenData(tokensData, address);
        const convertedAddress = convertTokenAddress(chainId, address, "wrapped");
        if (!token?.prices || primaryTokens.includes(convertedAddress)) {
            continue;
        }
        primaryTokens.push(convertedAddress);
        const currentPrice = {
            min: convertToContractPrice(token.prices.minPrice, token.decimals),
            max: convertToContractPrice(token.prices.maxPrice, token.decimals),
        };
        const primaryOverriddenPrice = primaryPricesMap[address];
        if (primaryOverriddenPrice) {
            primaryPrices.push({
                min: convertToContractPrice(primaryOverriddenPrice.minPrice, token.decimals),
                max: convertToContractPrice(primaryOverriddenPrice.maxPrice, token.decimals),
            });
        }
        else {
            primaryPrices.push(currentPrice);
        }
    }
    return {
        primaryTokens,
        primaryPrices,
    };
}
