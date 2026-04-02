import { useCallback } from 'react';
import type { OrderbookSnapshot } from '@/services/api/orderbookService';
import type { MarketOrderCalculation } from './types';

export function useMarketOrderHandler(orderbook: OrderbookSnapshot | null) {
  // Calculate contracts for market orders using step-clearing approach
  const calculateContractsForMarketOrder = useCallback((usdAmount: number, position: 'yes' | 'no', side: 'buy' | 'sell'): MarketOrderCalculation => {
    if (!orderbook || !usdAmount || usdAmount <= 0) {
      return { contracts: 0, remainingUsd: usdAmount };
    }
    
    // For SELL orders, usdAmount represents shares, not USD
    if (side === 'sell') {
      // Whole shares only
      const sharesToSell = Math.floor(usdAmount);
      let remainingShares = sharesToSell;
      let totalUsdReceived = 0;
      let maxPriceSeen = 0;
      let minPriceSeen = Infinity; // Track minimum price for signing
      
      // For SELL "Yes": use bids (people buying YES tokens)
      // For SELL "No": use asks (people selling YES tokens, which gives us NO tokens)
      const relevantOrders = position === 'yes' ? orderbook.bids : orderbook.asks;
      // IMPORTANT: never mutate the original orderbook arrays; copy before sorting
      const sortedOrders = (position === 'yes'
        ? [...relevantOrders].sort((a, b) => b.price - a.price) // Highest bid first for YES
        : [...relevantOrders].sort((a, b) => a.price - b.price) // Lowest ask first for NO
      );
      
      // Process SELL order using step-clearing
      for (const order of sortedOrders) {
        if (remainingShares <= 0) break;
        
        // For NO position, invert the ask price (same as orderbook display)
        const orderPrice = position === 'no' ? (1 - order.price) : order.price;
        let availableSize = 0;
        
        if (order.orders && Array.isArray(order.orders)) {
          availableSize = order.orders.reduce((sum, nestedOrder) => sum + (nestedOrder.size || 0), 0);
        } else {
          availableSize = order.size || 0;
        }
        // Only whole shares can be sold
        const availableWhole = Math.floor(availableSize);
        // How many shares we can sell at this price level
        const sharesAtThisPrice = Math.min(availableWhole, remainingShares);
        
        if (sharesAtThisPrice > 0) {
          const usdAtThisPrice = sharesAtThisPrice * orderPrice;
          totalUsdReceived += usdAtThisPrice;
          remainingShares -= sharesAtThisPrice;
          if (orderPrice > maxPriceSeen) maxPriceSeen = orderPrice;
          if (orderPrice < minPriceSeen) minPriceSeen = orderPrice; // Track minimum
        }
      }
      
      // For SELL orders, return shares as "contracts" and USD received as "remainingUsd"
      return { 
        contracts: sharesToSell - remainingShares, 
        remainingUsd: totalUsdReceived,
        maxPrice: maxPriceSeen,
        minPrice: minPriceSeen === Infinity ? 0 : minPriceSeen // Add minimum price
      };
    }
    
    // NEW STEP-CLEARING LOGIC FOR BUY ORDERS (whole shares only)
    // Convert USD amount to cents for exact integer math
    const S_cents = Math.floor(usdAmount * 100);
    let filled_shares = 0; // whole shares only
    let maxPriceSeen = 0;
    let remaining_cents = S_cents;
    
    // For BUY orders: 
    // - For YES positions: use asks (people selling YES tokens)
    // - For NO positions: use bids (people buying YES tokens, which gives us NO tokens)
    const relevantOrders = position === 'yes' ? orderbook.asks : orderbook.bids;
    
    // Check if relevantOrders exists and is an array
    if (!relevantOrders || !Array.isArray(relevantOrders)) {
      return { contracts: 0, remainingUsd: usdAmount };
    }
    
    // Sort orders by price
    // - For YES positions: ascending (lowest ask first) - process from bottom up
    // - For NO positions: descending (highest bid first)
    // IMPORTANT: never mutate the original orderbook arrays; copy before sorting
    const sortedOrders = (position === 'yes'
      ? [...relevantOrders].sort((a, b) => a.price - b.price)
      : [...relevantOrders].sort((a, b) => b.price - a.price)
    );
    
    let i = 0;
    while (i < sortedOrders.length && remaining_cents > 0) {
      const order = sortedOrders[i];
      const orderPrice = order.price;
      
      // For NO positions using bids, we need to invert the price
      const costPerContract = position === 'no' ? (1 - orderPrice) : orderPrice;
      // Round to nearest cent to avoid float underestimation (e.g., 0.4499999 -> 45¢)
      const p_cents = Math.round(costPerContract * 100);
      
      // Handle nested orders structure - sum up all available size at this price level
      let totalAvailableSize = 0;
      if (order.orders && Array.isArray(order.orders)) {
        totalAvailableSize = order.orders.reduce((sum, nestedOrder) => {
          const orderSize = nestedOrder.size || nestedOrder.makerQty || nestedOrder.origSize || 0;
          return sum + orderSize;
        }, 0);
      } else {
        totalAvailableSize = order.size || 0;
      }
      
      // Only whole shares at each price level
      const availableWhole = Math.floor(totalAvailableSize);
      if (availableWhole <= 0 || p_cents <= 0) { i++; continue; }

      const row_total_cents = availableWhole * p_cents;

      if (remaining_cents >= row_total_cents) {
        // Full clear this row with whole shares
        filled_shares += availableWhole;
        remaining_cents -= row_total_cents;
        if (costPerContract > maxPriceSeen) maxPriceSeen = costPerContract;
        i++;
        continue;
      } else {
        // Partial fill: take as many whole shares as budget allows
        const affordableShares = Math.floor(remaining_cents / p_cents);
        const takeShares = Math.min(availableWhole, Math.max(0, affordableShares));
        if (takeShares > 0) {
          const cost_cents = takeShares * p_cents;
          filled_shares += takeShares;
          remaining_cents -= cost_cents;
          if (costPerContract > maxPriceSeen) maxPriceSeen = costPerContract;
        }
        break;
      }
    }
    
    // Convert back to USD; contracts are whole shares already
    const total_contracts = filled_shares;
    const remaining_usd = remaining_cents / 100.0;
    
    return { contracts: total_contracts, remainingUsd: remaining_usd, maxPrice: maxPriceSeen };
  }, [orderbook]);

  // Get effective price for market orders
  const getEffectivePrice = useCallback((usdAmount: number, contracts: number, remainingUsd: number): number => {
    if (contracts === 0) return 0;
    return (usdAmount - remainingUsd) / contracts;
  }, []);

  // Get available liquidity info for a given position and side
  const getAvailableLiquidity = useCallback((position: 'yes' | 'no', side: 'buy' | 'sell'): { 
    maxSharesAvailable: number; 
    maxUsdValue: number; 
    hasAnyLiquidity: boolean;
  } => {
    if (!orderbook) {
      return { maxSharesAvailable: 0, maxUsdValue: 0, hasAnyLiquidity: false };
    }
    
    // For SELL orders, liquidity comes from bids (people willing to buy)
    // For BUY orders, liquidity comes from asks (people willing to sell)
    const relevantOrders = side === 'buy' 
      ? (position === 'yes' ? orderbook.asks : orderbook.bids)
      : (position === 'yes' ? orderbook.bids : orderbook.asks);
    
    if (!relevantOrders || !Array.isArray(relevantOrders)) {
      return { maxSharesAvailable: 0, maxUsdValue: 0, hasAnyLiquidity: false };
    }
    
    let maxSharesAvailable = 0;
    let maxUsdValue = 0;
    
    for (const order of relevantOrders) {
      const orderPrice = order.price;
      const costPerContract = position === 'no' ? (1 - orderPrice) : orderPrice;
      
      // Handle nested orders structure - sum up all available size at this price level
      let totalAvailableSize = 0;
      if (order.orders && Array.isArray(order.orders)) {
        totalAvailableSize = order.orders.reduce((sum, nestedOrder) => {
          const orderSize = nestedOrder.size || nestedOrder.makerQty || nestedOrder.origSize || 0;
          return sum + orderSize;
        }, 0);
      } else {
        totalAvailableSize = order.size || 0;
      }
      
      maxSharesAvailable += Math.floor(totalAvailableSize);
      maxUsdValue += totalAvailableSize * costPerContract;
    }
    
    return { 
      maxSharesAvailable, 
      maxUsdValue, 
      hasAnyLiquidity: maxSharesAvailable > 0 
    };
  }, [orderbook]);

  // Check if there's sufficient liquidity by calculating max possible buyout
  const hasSufficientLiquidity = useCallback((usdAmount: number, position: 'yes' | 'no', side: 'buy' | 'sell'): boolean => {
    if (!orderbook || !usdAmount || usdAmount <= 0) return false;
    
    // For SELL orders, check if we have enough shares to sell
    if (side === 'sell') {
      const sharesRequested = usdAmount;
      const result = calculateContractsForMarketOrder(usdAmount, position, side);
      const sharesSold = result.contracts;
      return Math.abs(sharesRequested - sharesSold) < 0.01; // Allow tiny rounding differences
    }
    
    // For BUY orders, calculate maximum possible buyout from entire orderbook
    const relevantOrders = position === 'yes' ? orderbook.asks : orderbook.bids;
    
    if (!relevantOrders || !Array.isArray(relevantOrders)) {
      return false;
    }
    
    // Calculate total dollar value available in the orderbook
    let maxBuyoutUsd = 0;
    
    for (const order of relevantOrders) {
      const orderPrice = order.price;
      const costPerContract = position === 'no' ? (1 - orderPrice) : orderPrice;
      
      // Handle nested orders structure - sum up all available size at this price level
      let totalAvailableSize = 0;
      if (order.orders && Array.isArray(order.orders)) {
        totalAvailableSize = order.orders.reduce((sum, nestedOrder) => {
          const orderSize = nestedOrder.size || nestedOrder.makerQty || nestedOrder.origSize || 0;
          return sum + orderSize;
        }, 0);
      } else {
        totalAvailableSize = order.size || 0;
      }
      
      // Add this row's total value to max buyout
      maxBuyoutUsd += totalAvailableSize * costPerContract;
    }
    
    // Input amount must be less than or equal to max possible buyout (allow small tolerance for rounding)
    return usdAmount <= maxBuyoutUsd + 0.01; // Allow up to 1 cent tolerance
  }, [orderbook]);

  return {
    calculateContractsForMarketOrder,
    getEffectivePrice,
    hasSufficientLiquidity,
    getAvailableLiquidity
  };
}
