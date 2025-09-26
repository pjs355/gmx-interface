import { Abi } from "viem";
export type AbiId = "CustomErrors" | "DataStore" | "ERC721" | "ERC20" | "EventEmitter" | "ExchangeRouter" | "GlpManager" | "GlvReader" | "GlvRouter" | "GMT" | "GmxMigrator" | "GovToken" | "MintableBaseToken" | "Multicall" | "OrderBook" | "OrderBookReader" | "OrderExecutor" | "PositionManager" | "PositionRouter" | "Reader" | "ReaderV2" | "ReferralStorage" | "RewardReader" | "RewardRouter" | "RewardTracker" | "Router-v2" | "Router" | "SubaccountRouter" | "SyntheticsReader" | "SyntheticsRouter" | "Timelock" | "Token" | "Treasury" | "UniPool" | "UniswapV2" | "Vault" | "VaultReader" | "VaultV2" | "VaultV2b" | "Vester" | "WETH" | "YieldFarm" | "YieldToken" | "SubaccountGelatoRelayRouter" | "ERC20PermitInterface" | "GelatoRelayRouter" | "ArbitrumNodeInterface";
/** Copied from ethers to enable compatibility with GMX UI */
interface JsonFragmentType {
    readonly name?: string;
    readonly indexed?: boolean;
    readonly type?: string;
    readonly internalType?: string;
    readonly components?: ReadonlyArray<JsonFragmentType>;
}
interface JsonFragment {
    readonly name?: string;
    readonly type?: string;
    readonly anonymous?: boolean;
    readonly payable?: boolean;
    readonly constant?: boolean;
    readonly stateMutability?: string;
    readonly inputs?: ReadonlyArray<JsonFragmentType>;
    readonly outputs?: ReadonlyArray<JsonFragmentType>;
    readonly gas?: string;
}
export declare const abis: Record<AbiId, readonly (Abi[number] & JsonFragment)[]>;
export {};
