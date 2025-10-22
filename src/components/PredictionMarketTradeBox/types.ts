import type { PredictionMarket } from "lib/predictionMarketDataService";
import type { OrderbookSnapshot } from "lib/orderbookService";
import type { OrderExecutionResult } from "lib/predictionMarketService";

export interface TradeBoxState {
  selectedPosition: 'yes' | 'no' | null;
  amount: string;
  price: string;
  orderType: 'market' | 'limit';
  side: 'buy' | 'sell';
  isLoading: boolean;
  orderResult: OrderExecutionResult | null;
  calculatedContracts: number | null;
  remainingUsd: number | null;
}

export interface TradeBoxProps {
  market: PredictionMarket;
  orderbook?: OrderbookSnapshot | null;
  initialPosition?: 'yes' | 'no';
  onPositionChange?: (position: 'yes' | 'no') => void;
  onSideChange?: (side: 'buy' | 'sell') => void;
}

export interface MarketOrderCalculation {
  contracts: number;
  remainingUsd: number;
  maxPrice?: number;
  minPrice?: number;
}

export interface TradeExecutionParams {
  marketId: string;
  position: 'yes' | 'no';
  amount: number;
  price: number;
  orderType: 'market' | 'limit';
  side: 'buy' | 'sell';
  userAddress: string;
  market: PredictionMarket;
}

export interface WalletState {
  account: string | undefined;
  privyWallet: any;
  isConnected: boolean;
}

export interface ApprovalState {
  isApproved: boolean;
  isChecking: boolean;
  isApproving: boolean;
}
