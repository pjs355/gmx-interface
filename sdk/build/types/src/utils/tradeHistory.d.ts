import type { MarketsInfoData } from "types/markets";
import type { TradeAction as SubsquidTradeAction } from "types/subsquid";
import { Token, TokensData } from "types/tokens";
import type { PositionTradeAction } from "types/tradeHistory";
import type { SwapTradeAction } from "types/tradeHistory";
export declare function createRawTradeActionTransformer(marketsInfoData: MarketsInfoData, wrappedToken: Token, tokensData: TokensData): (value: SubsquidTradeAction, index: number, array: SubsquidTradeAction[]) => SwapTradeAction | PositionTradeAction | undefined;
export declare function bigNumberify(n?: bigint | string | null | undefined): bigint | undefined;
