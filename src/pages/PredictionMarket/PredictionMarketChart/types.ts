export type TimeRange = '1h' | '1d' | '1w' | 'all';

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


