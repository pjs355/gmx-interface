"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.abis = void 0;
const viem_1 = require("viem");
const ArbitrumNodeInterface_json_1 = __importDefault(require("./ArbitrumNodeInterface.json"));
const CustomErrors_json_1 = __importDefault(require("./CustomErrors.json"));
const DataStore_json_1 = __importDefault(require("./DataStore.json"));
const ERC20PermitInterface_json_1 = __importDefault(require("./ERC20PermitInterface.json"));
const ERC721_json_1 = __importDefault(require("./ERC721.json"));
const EventEmitter_json_1 = __importDefault(require("./EventEmitter.json"));
const ExchangeRouter_json_1 = __importDefault(require("./ExchangeRouter.json"));
const GelatoRelayRouter_json_1 = __importDefault(require("./GelatoRelayRouter.json"));
const GlpManager_json_1 = __importDefault(require("./GlpManager.json"));
const GlvReader_json_1 = __importDefault(require("./GlvReader.json"));
const GlvRouter_json_1 = __importDefault(require("./GlvRouter.json"));
const GMT_json_1 = __importDefault(require("./GMT.json"));
const GmxMigrator_json_1 = __importDefault(require("./GmxMigrator.json"));
const GovToken_json_1 = __importDefault(require("./GovToken.json"));
const MintableBaseToken_json_1 = __importDefault(require("./MintableBaseToken.json"));
const Multicall_json_1 = __importDefault(require("./Multicall.json"));
const OrderBook_json_1 = __importDefault(require("./OrderBook.json"));
const OrderBookReader_json_1 = __importDefault(require("./OrderBookReader.json"));
const OrderExecutor_json_1 = __importDefault(require("./OrderExecutor.json"));
const PositionManager_json_1 = __importDefault(require("./PositionManager.json"));
const PositionRouter_json_1 = __importDefault(require("./PositionRouter.json"));
const Reader_json_1 = __importDefault(require("./Reader.json"));
const ReaderV2_json_1 = __importDefault(require("./ReaderV2.json"));
const ReferralStorage_json_1 = __importDefault(require("./ReferralStorage.json"));
const RewardReader_json_1 = __importDefault(require("./RewardReader.json"));
const RewardRouter_json_1 = __importDefault(require("./RewardRouter.json"));
const RewardTracker_json_1 = __importDefault(require("./RewardTracker.json"));
const Router_v2_json_1 = __importDefault(require("./Router-v2.json"));
const Router_json_1 = __importDefault(require("./Router.json"));
const SubaccountGelatoRelayRouter_json_1 = __importDefault(require("./SubaccountGelatoRelayRouter.json"));
const SubaccountRouter_json_1 = __importDefault(require("./SubaccountRouter.json"));
const SyntheticsReader_json_1 = __importDefault(require("./SyntheticsReader.json"));
const SyntheticsRouter_json_1 = __importDefault(require("./SyntheticsRouter.json"));
const Timelock_json_1 = __importDefault(require("./Timelock.json"));
const Token_json_1 = __importDefault(require("./Token.json"));
const Treasury_json_1 = __importDefault(require("./Treasury.json"));
const UniPool_json_1 = __importDefault(require("./UniPool.json"));
const UniswapV2_json_1 = __importDefault(require("./UniswapV2.json"));
const Vault_json_1 = __importDefault(require("./Vault.json"));
const VaultReader_json_1 = __importDefault(require("./VaultReader.json"));
const VaultV2_json_1 = __importDefault(require("./VaultV2.json"));
const VaultV2b_json_1 = __importDefault(require("./VaultV2b.json"));
const Vester_json_1 = __importDefault(require("./Vester.json"));
const WETH_json_1 = __importDefault(require("./WETH.json"));
const YieldFarm_json_1 = __importDefault(require("./YieldFarm.json"));
const YieldToken_json_1 = __importDefault(require("./YieldToken.json"));
exports.abis = {
    CustomErrors: CustomErrors_json_1.default.abi,
    DataStore: DataStore_json_1.default.abi,
    ERC721: ERC721_json_1.default.abi,
    ERC20: viem_1.erc20Abi,
    ERC20PermitInterface: ERC20PermitInterface_json_1.default.abi,
    EventEmitter: EventEmitter_json_1.default.abi,
    ExchangeRouter: ExchangeRouter_json_1.default.abi,
    GlpManager: GlpManager_json_1.default.abi,
    GlvReader: GlvReader_json_1.default.abi,
    GlvRouter: GlvRouter_json_1.default.abi,
    GMT: GMT_json_1.default.abi,
    GmxMigrator: GmxMigrator_json_1.default.abi,
    GovToken: GovToken_json_1.default.abi,
    MintableBaseToken: MintableBaseToken_json_1.default.abi,
    Multicall: Multicall_json_1.default.abi,
    OrderBook: OrderBook_json_1.default.abi,
    OrderBookReader: OrderBookReader_json_1.default.abi,
    OrderExecutor: OrderExecutor_json_1.default.abi,
    PositionManager: PositionManager_json_1.default.abi,
    PositionRouter: PositionRouter_json_1.default.abi,
    Reader: Reader_json_1.default.abi,
    ReaderV2: ReaderV2_json_1.default.abi,
    ReferralStorage: ReferralStorage_json_1.default.abi,
    RewardReader: RewardReader_json_1.default.abi,
    RewardRouter: RewardRouter_json_1.default.abi,
    RewardTracker: RewardTracker_json_1.default.abi,
    RouterV2: Router_v2_json_1.default.abi,
    Router: Router_json_1.default.abi,
    SubaccountRouter: SubaccountRouter_json_1.default.abi,
    SyntheticsReader: SyntheticsReader_json_1.default.abi,
    SyntheticsRouter: SyntheticsRouter_json_1.default.abi,
    Timelock: Timelock_json_1.default.abi,
    Token: Token_json_1.default.abi,
    Treasury: Treasury_json_1.default.abi,
    UniPool: UniPool_json_1.default.abi,
    UniswapV2: UniswapV2_json_1.default.abi,
    Vault: Vault_json_1.default.abi,
    VaultReader: VaultReader_json_1.default.abi,
    VaultV2: VaultV2_json_1.default.abi,
    VaultV2b: VaultV2b_json_1.default.abi,
    Vester: Vester_json_1.default.abi,
    WETH: WETH_json_1.default.abi,
    YieldFarm: YieldFarm_json_1.default.abi,
    YieldToken: YieldToken_json_1.default.abi,
    SubaccountGelatoRelayRouter: SubaccountGelatoRelayRouter_json_1.default.abi,
    GelatoRelayRouter: GelatoRelayRouter_json_1.default.abi,
    ArbitrumNodeInterface: ArbitrumNodeInterface_json_1.default.abi,
};
