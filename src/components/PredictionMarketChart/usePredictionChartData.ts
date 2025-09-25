import { useEffect, useRef, useState } from 'react';
import { predictionMarketDataService } from 'lib/predictionMarketDataService';
import type { ChartDataPoint, TimeRange } from './types';

type UsePredictionChartDataArgs = {
  questionId: string;
  secondMarket?: any;
  questionOrderbooks?: { [questionId: string]: any };
  timeRange: TimeRange;
};

export function usePredictionChartData({ questionId, secondMarket, questionOrderbooks, timeRange }: UsePredictionChartDataArgs) {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [timeWindowStart, setTimeWindowStart] = useState<number>(0);
  const [timeWindowEnd, setTimeWindowEnd] = useState<number>(0);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Live orderbook logic disabled: focus on historical only

  useEffect(() => {
    const now = Math.floor(Date.now() / 1000);
    const seconds = timeRange === '1h' ? 3600 : timeRange === '1d' ? 86400 : timeRange === '1w' ? 604800 : 2592000;
    setTimeWindowEnd(now);
    setTimeWindowStart(now - seconds);
  }, [timeRange]);

  useEffect(() => {
    if (!questionId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        let primaryHistorical: Array<{ timestamp: number; price: number; volume?: number }>
          = predictionMarketDataService.getHistoricalPrices(questionId) || [];

        let secondHistorical: Array<{ timestamp: number; price: number; volume?: number }> = [];
        const secondId = secondMarket?._id || secondMarket?.questionId;
        if (secondId) {
          secondHistorical = predictionMarketDataService.getHistoricalPrices(secondId) || [];
        }

        // No backfill for primary: keep as-is

        // No backfill for secondary: keep as-is

        // Use raw historical series only (no synthetic points)
        const primarySeries = [...primaryHistorical].sort((a, b) => a.timestamp - b.timestamp);
        const secondSeries = [...secondHistorical].sort((a, b) => a.timestamp - b.timestamp);

        const primaryMap = new Map<number, { price: number; isLive?: boolean }>();
        const secondMap = new Map<number, { price: number; isLive?: boolean }>();
        primarySeries.forEach(p => primaryMap.set(p.timestamp, { price: p.price }));
        secondSeries.forEach(p => secondMap.set(p.timestamp, { price: p.price }));

        // Live price disabled

        // Show ALL historical points regardless of time window
        const timestamps = new Set<number>();
        for (const [t] of primaryMap.entries()) timestamps.add(t);
        for (const [t] of secondMap.entries()) timestamps.add(t);

        const sorted = Array.from(timestamps).sort((a, b) => a - b);
        const out: ChartDataPoint[] = [];

        // Carry-forward last known primary/second price to link segments smoothly
        let lastPrimary: { price: number; isLive?: boolean } | null = null;
        let lastSecond: { price: number; isLive?: boolean } | null = null;

        for (const ts of sorted) {
          const date = new Date(ts * 1000);
          const p = primaryMap.get(ts) ?? lastPrimary;
          const s = secondMap.get(ts) ?? lastSecond;
          const primaryPct = p ? p.price * 100 : null;
          const secondPct = s ? s.price * 100 : null;
          out.push({
            timestamp: ts,
            price: p ? p.price : null,
            secondPrice: s ? s.price : null,
            date: date.toISOString(),
            displayTime: formatDisplayTime(date, timeRange),
            percentage: primaryPct,
            secondPercentage: secondPct,
            isLive: p ? Boolean(p.isLive) : false,
            secondIsLive: s ? Boolean(s.isLive) : false,
          });
          if (primaryMap.has(ts)) lastPrimary = primaryMap.get(ts) || lastPrimary;
          if (secondMap.has(ts)) lastSecond = secondMap.get(ts) || lastSecond;
        }

        setData(out);
      } catch (e) {
        setData([]);
      }
    }, 100);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [questionId, timeRange]);

  return {
    data,
    timeWindowStart,
    timeWindowEnd,
    setTimeWindowEnd,
  } as const;
}

function formatDisplayTime(date: Date, range: TimeRange): string {
  switch (range) {
    case '1h':
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    case '1d':
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    case '1w':
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
    case '1m':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    default:
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
}


