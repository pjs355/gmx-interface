import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { predictionMarketDataService } from 'lib/predictionMarketDataService';
import type { ChartDataPoint, TimeRange } from './types';

type UsePredictionChartDataArgs = {
  questionId: string;
  secondMarket?: any;
  questionOrderbooks?: { [questionId: string]: any };
  timeRange: TimeRange;
  isVsSingleMarket?: boolean;
};

export function usePredictionChartData({ questionId, secondMarket, questionOrderbooks, timeRange, isVsSingleMarket }: UsePredictionChartDataArgs) {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [timeWindowStart, setTimeWindowStart] = useState<number>(0);
  const [timeWindowEnd, setTimeWindowEnd] = useState<number>(0);

  // Live orderbook logic disabled: focus on historical only

  useEffect(() => {
    const now = Math.floor(Date.now() / 1000);
    const seconds = timeRange === '1h' ? 3600 : timeRange === '1d' ? 86400 : timeRange === '1w' ? 604800 : 2592000;
    setTimeWindowEnd(now);
    setTimeWindowStart(now - seconds);
  }, [timeRange]);

  // Memoize the data processing for instant loading
  const processedData = useMemo(() => {
    if (!questionId || timeWindowStart === 0 || timeWindowEnd === 0) {
      return [];
    }

    try {
      // Get historical data
      const primaryHistorical = predictionMarketDataService.getHistoricalPrices(questionId) || [];
      const secondId = secondMarket?._id || secondMarket?.questionId;
      const secondHistorical = (secondId && !isVsSingleMarket) 
        ? (predictionMarketDataService.getHistoricalPrices(secondId) || [])
        : [];

      // Create maps
      const primaryMap = new Map<number, { price: number; isLive?: boolean }>();
      const secondMap = new Map<number, { price: number; isLive?: boolean }>();
      
      // Sort and populate maps
      const primarySeries = [...primaryHistorical].sort((a, b) => a.timestamp - b.timestamp);
      const secondSeries = [...secondHistorical].sort((a, b) => a.timestamp - b.timestamp);
      
      primarySeries.forEach(p => primaryMap.set(p.timestamp, { price: p.price }));
      secondSeries.forEach(p => secondMap.set(p.timestamp, { price: p.price }));

      // Add creation time 50% backfill
      try {
        const primaryMarket = predictionMarketDataService.getCachedMarketData(questionId);
        const primaryCreated = primaryMarket?.createdAt ? Math.floor(new Date(primaryMarket.createdAt).getTime() / 1000) : null;
        if (primaryCreated && !primaryMap.has(primaryCreated)) {
          primaryMap.set(primaryCreated, { price: 0.5 });
        }

        if (secondId && !isVsSingleMarket) {
          const secondaryMarket = predictionMarketDataService.getCachedMarketData(secondId);
          const secondaryCreated = secondaryMarket?.createdAt ? Math.floor(new Date(secondaryMarket.createdAt).getTime() / 1000) : null;
          if (secondaryCreated && !secondMap.has(secondaryCreated)) {
            secondMap.set(secondaryCreated, { price: 0.5 });
          }
        }
      } catch {}

      // Derive NO side for VS single market
      if (isVsSingleMarket) {
        for (const [ts, val] of primaryMap.entries()) {
          const inv = 1 - (typeof val.price === 'number' ? val.price : 0.5);
          secondMap.set(ts, { price: inv });
        }
      }

      // Filter to time window
      let allTimestamps = Array.from(new Set([...primaryMap.keys(), ...secondMap.keys()]))
        .filter(t => t >= timeWindowStart && t <= timeWindowEnd)
        .sort((a, b) => a - b);

      // Get current live best ask prices for front-filling
      const getCurrentLivePrice = (questionId: string): number | null => {
        try {
          const orderbook = questionOrderbooks?.[questionId];
          if (!orderbook?.asks || !Array.isArray(orderbook.asks) || orderbook.asks.length === 0) {
            return null;
          }
          
          // Get the best ask (lowest price in asks array)
          const bestAsk = orderbook.asks.reduce((best, current) => {
            const currentPrice = parseFloat(current.price || current[0] || '0');
            const bestPrice = parseFloat(best.price || best[0] || '0');
            return currentPrice < bestPrice ? current : best;
          });
          
          const price = parseFloat(bestAsk.price || bestAsk[0] || '0');
          return isNaN(price) || price <= 0 ? null : price;
        } catch {
          return null;
        }
      };

      const currentLivePrice = getCurrentLivePrice(questionId);
      const currentSecondLivePrice = secondId ? getCurrentLivePrice(secondId) : null;

      // Debug logging for 1M time range
      if (timeRange === '1m' && process.env.NODE_ENV === 'development') {
        console.log('🔍 1M Debug:', {
          timeRange,
          timeWindowStart,
          timeWindowEnd,
          currentLivePrice,
          currentSecondLivePrice,
          allTimestampsLength: allTimestamps.length,
          hasOrderbook: !!questionOrderbooks?.[questionId]
        });
      }

      // Front-fill logic with live prices
      const findLastAtOrBefore = (map: Map<number, { price: number }>, cutoff: number) => {
        let bestTs = -Infinity;
        let bestPrice: number | null = null;
        for (const [ts, val] of map.entries()) {
          if (ts <= cutoff && ts > bestTs) {
            bestTs = ts;
            bestPrice = val.price;
          }
        }
        return bestPrice === null ? null : { ts: bestTs, price: bestPrice };
      };

      if (allTimestamps.length === 0) {
        // Use live price first, fallback to last historical
        const primaryPrice = currentLivePrice ?? findLastAtOrBefore(primaryMap, timeWindowEnd)?.price;
        const secondPrice = currentSecondLivePrice ?? findLastAtOrBefore(secondMap, timeWindowEnd)?.price;
        
        if (primaryPrice || secondPrice) {
          allTimestamps = [timeWindowStart, timeWindowEnd];
          if (primaryPrice) {
            primaryMap.set(timeWindowStart, { price: primaryPrice });
            primaryMap.set(timeWindowEnd, { price: primaryPrice });
          }
          if (secondPrice) {
            secondMap.set(timeWindowStart, { price: secondPrice });
            secondMap.set(timeWindowEnd, { price: secondPrice });
          }
        }
      } else {
        const now = Math.floor(Date.now() / 1000);
        if (timeWindowEnd >= now) {
          allTimestamps = [...allTimestamps, timeWindowEnd];
          // Use live price first, fallback to last historical
          const primaryPrice = currentLivePrice ?? findLastAtOrBefore(primaryMap, timeWindowEnd)?.price;
          const secondPrice = currentSecondLivePrice ?? findLastAtOrBefore(secondMap, timeWindowEnd)?.price;
          
          if (primaryPrice) primaryMap.set(timeWindowEnd, { price: primaryPrice });
          if (secondPrice) secondMap.set(timeWindowEnd, { price: secondPrice });
        }
        
        // Special handling for 1M to ensure live price is always used
        if (timeRange === '1m' && currentLivePrice !== null) {
          // Force update the end point with live price for 1M
          primaryMap.set(timeWindowEnd, { price: currentLivePrice });
          if (!allTimestamps.includes(timeWindowEnd)) {
            allTimestamps.push(timeWindowEnd);
          }
        }
        
        if (timeRange === '1m' && currentSecondLivePrice !== null) {
          // Force update the end point with live price for 1M
          secondMap.set(timeWindowEnd, { price: currentSecondLivePrice });
          if (!allTimestamps.includes(timeWindowEnd)) {
            allTimestamps.push(timeWindowEnd);
          }
        }
      }

      // Build chart data
      const out: ChartDataPoint[] = [];
      const primaryKeys = Array.from(primaryMap.keys()).sort((a, b) => a - b);
      const secondKeys = Array.from(secondMap.keys()).sort((a, b) => a - b);
      const lastPrimaryBeforeIdx = primaryKeys.findIndex(t => t > timeWindowStart) - 1;
      const lastSecondBeforeIdx = secondKeys.findIndex(t => t > timeWindowStart) - 1;
      let lastPrimary: { price: number; isLive?: boolean } | null = lastPrimaryBeforeIdx >= 0 ? (primaryMap.get(primaryKeys[lastPrimaryBeforeIdx]) || null) : null;
      let lastSecond: { price: number; isLive?: boolean } | null = lastSecondBeforeIdx >= 0 ? (secondMap.get(secondKeys[lastSecondBeforeIdx]) || null) : null;

      for (const ts of allTimestamps) {
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

      return out;
    } catch (e) {
      return [];
    }
  }, [questionId, timeRange, timeWindowStart, timeWindowEnd, secondMarket, isVsSingleMarket]);

  // Update data when processed data changes - instant loading
  useEffect(() => {
    setData(processedData);
  }, [processedData]);

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


