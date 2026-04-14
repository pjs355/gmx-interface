export type TimeRange = '1h' | '1d' | 'all';

export interface ChartDataPoint {
  timestamp: number;
  price: number | null;
  secondPrice: number | null;
  volume?: number;
  date: string;
  displayTime: string;
  percentage: number | null;
  secondPercentage: number | null;
  isLive?: boolean;
  secondIsLive?: boolean;
}

export interface MergedExchangePoint {
  timestamp: number;
  // Team A
  levelUp?: number;
  polymarket?: number;
  kalshi?: number;
  predictFun?: number;
  limitless?: number;
  bestOdds?: number;
  // Team B (vs markets only, computed as 100 - TeamA)
  levelUpB?: number;
  polymarketB?: number;
  kalshiB?: number;
  predictFunB?: number;
  limitlessB?: number;
  bestOddsB?: number;
}
