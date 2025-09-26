"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Multicall = exports.MAX_TIMEOUT = void 0;
const abis_1 = require("abis");
const common_1 = require("./common");
exports.MAX_TIMEOUT = 20000;
class Multicall {
    static async getInstance(sdk) {
        const chainId = sdk.chainId;
        let instance = Multicall.instances[chainId];
        if (!instance || instance.chainId !== chainId) {
            instance = new Multicall(sdk);
            Multicall.instances[chainId] = instance;
        }
        return instance;
    }
    constructor(sdk) {
        this.sdk = sdk;
    }
    get chainId() {
        return this.sdk.chainId;
    }
    async call(request, maxTimeout) {
        const client = this.sdk.publicClient;
        if (!client) {
            throw new Error("Public client is not initialized");
        }
        const originalKeys = [];
        const abis = {};
        const encodedPayload = [];
        const contractKeys = Object.keys(request);
        contractKeys.forEach((contractKey) => {
            const contractCallConfig = request[contractKey];
            if (!contractCallConfig) {
                return;
            }
            Object.keys(contractCallConfig.calls).forEach((callKey) => {
                const call = contractCallConfig.calls[callKey];
                if (!call) {
                    return;
                }
                // Add Errors ABI to each contract ABI to correctly parse errors
                abis[contractCallConfig.contractAddress] = abis[contractCallConfig.contractAddress] || [
                    ...abis_1.abis[contractCallConfig.abiId],
                    ...abis_1.abis.CustomErrors,
                ];
                const abi = abis[contractCallConfig.contractAddress];
                originalKeys.push({
                    contractKey,
                    callKey,
                });
                encodedPayload.push({
                    address: contractCallConfig.contractAddress,
                    functionName: call.methodName,
                    args: call.params,
                    abi,
                });
            });
        });
        const processResponse = (response) => {
            const multicallResult = {
                success: true,
                errors: {},
                data: {},
            };
            response.forEach(({ result, status, error }, i) => {
                const { contractKey, callKey } = originalKeys[i];
                if (status === "success") {
                    let values;
                    if (Array.isArray(result) || typeof result === "object") {
                        values = result;
                    }
                    else {
                        values = [result];
                    }
                    multicallResult.data[contractKey] = multicallResult.data[contractKey] || {};
                    multicallResult.data[contractKey][callKey] = {
                        contractKey,
                        callKey,
                        returnValues: values,
                        success: true,
                    };
                }
                else {
                    multicallResult.success = false;
                    multicallResult.errors[contractKey] = multicallResult.errors[contractKey] || {};
                    multicallResult.errors[contractKey][callKey] = error;
                    multicallResult.data[contractKey] = multicallResult.data[contractKey] || {};
                    multicallResult.data[contractKey][callKey] = {
                        contractKey,
                        callKey,
                        returnValues: [],
                        success: false,
                        error: error,
                    };
                }
            });
            return multicallResult;
        };
        const timeoutController = new AbortController();
        const result = await Promise.race([
            client.multicall({ contracts: encodedPayload }),
            (0, common_1.sleep)(maxTimeout, timeoutController.signal).then(() => Promise.reject(new Error("multicall timeout"))),
        ])
            .then((response) => {
            timeoutController.abort();
            return processResponse(response);
        })
            .catch((_viemError) => {
            timeoutController.abort();
            const e = new Error(_viemError.message.slice(0, 150));
            /* eslint-disable-next-line */
            console.error(e);
            throw e;
        });
        if (result.success) {
            return result;
        }
        /* eslint-disable-next-line */
        console.error(result.errors);
        return result;
    }
}
exports.Multicall = Multicall;
Multicall.instances = {};
