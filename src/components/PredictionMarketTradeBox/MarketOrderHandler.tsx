import { useCallback } from 'react';
import type { OrderbookSnapshot } from 'lib/orderbookService';
import type { MarketOrderCalculation } from './types';

export function useMarketOrderHandler(orderbook: OrderbookSnapshot | null) {
  // Calculate contracts for market orders using step-clearing approach
  const calculateContractsForMarketOrder = useCallback((usdAmount: number, position: 'yes' | 'no', side: 'buy' | 'sell'): MarketOrderCalculation => {
    if (!orderbook || !usdAmount || usdAmount <= 0) {
      return { contracts: 0, remainingUsd: usdAmount };
    }
    
    // For SELL orders, usdAmount represents shares, not USD
    if (side === 'sell') {
      const sharesToSell = usdAmount;
      let remainingShares = sharesToSell;
      let totalUsdReceived = 0;
      
      // For SELL "Yes": use bids (people buying YES tokens)
      // For SELL "No": use asks (people selling YES tokens, which gives us NO tokens)
      const relevantOrders = position === 'yes' ? orderbook.bids : orderbook.asks;
      const sortedOrders = position === 'yes' 
        ? relevantOrders.sort((a, b) => b.price - a.price) // Highest bid first for YES
        : relevantOrders.sort((a, b) => a.price - b.price); // Lowest ask first for NO
      
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
        
        // How many shares we can sell at this price level
        const sharesAtThisPrice = Math.min(availableSize, remainingShares);
        
        if (sharesAtThisPrice > 0) {
          const usdAtThisPrice = sharesAtThisPrice * orderPrice;
          totalUsdReceived += usdAtThisPrice;
          remainingShares -= sharesAtThisPrice;
        }
      }
      
      // For SELL orders, return shares as "contracts" and USD received as "remainingUsd"
      return { 
        contracts: sharesToSell - remainingShares, 
        remainingUsd: totalUsdReceived 
      };
    }
    
    // NEW STEP-CLEARING LOGIC FOR BUY ORDERS
    // Convert USD amount to cents for exact integer math
    const S_cents = Math.floor(usdAmount * 100);
    let filled_units = 0; // in hundredths of shares
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
    const sortedOrders = position === 'yes' 
      ? relevantOrders.sort((a, b) => a.price - b.price)
      : relevantOrders.sort((a, b) => b.price - a.price);
    
    let i = 0;
    while (i < sortedOrders.length && remaining_cents > 0) {
      const order = sortedOrders[i];
      const orderPrice = order.price;
      
      // For NO positions using bids, we need to invert the price
      const costPerContract = position === 'no' ? (1 - orderPrice) : orderPrice;
      const p_cents = Math.floor(costPerContract * 100); // Convert to cents
      
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
      
      // Convert available size to hundredths of shares
      const avail_units = Math.floor(totalAvailableSize * 100);
      
      // Calculate row total in cents (floor division)
      const row_total_cents = Math.floor((avail_units * p_cents) / 100);
      
      if (remaining_cents >= row_total_cents) {
        // Full clear this row
        filled_units += avail_units;
        remaining_cents -= row_total_cents;
        i++;
        continue;
      } else {
        // Partial fill at this price level
        // Maximum purchasable units at this price: floor(100 * S_cents / p_cents)
        const max_units_by_budget = Math.floor((100 * remaining_cents) / p_cents);
        const take_units = Math.min(avail_units, Math.max(0, max_units_by_budget));
        
        if (take_units > 0) {
          const cost_cents = Math.floor((take_units * p_cents) / 100);
          filled_units += take_units;
          remaining_cents -= cost_cents;
        }
        break;
      }
    }
    
    // Convert back to shares and USD
    const total_contracts = filled_units / 100.0;
    const remaining_usd = remaining_cents / 100.0;
    
    return { contracts: total_contracts, remainingUsd: remaining_usd };
  }, [orderbook]);

  // Get effective price for market orders
  const getEffectivePrice = useCallback((usdAmount: number, contracts: number, remainingUsd: number): number => {
    if (contracts === 0) return 0;
    return (usdAmount - remainingUsd) / contracts;
  }, []);

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
    hasSufficientLiquidity
  };
}
