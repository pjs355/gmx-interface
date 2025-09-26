import { ClientConfig, MulticallBatchOptions } from "viem";
export declare const BATCH_CONFIGS: Record<number, {
    http: MulticallBatchOptions;
    client: ClientConfig["batch"];
}>;
