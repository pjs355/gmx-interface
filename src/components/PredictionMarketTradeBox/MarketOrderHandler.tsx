import { useCallback } from 'react';
import type { OrderbookSnapshot } from 'lib/orderbookService';
import type { MarketOrderCalculation } from './types';

export function useMarketOrderHandler(orderbook: OrderbookSnapshot | null) {
  // Calculate contracts for market orders based on USD amount or shares
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
      
      // Process SELL order
      
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
    
    // Original logic for BUY orders
    let remainingUsd = usdAmount;
    let totalContracts = 0;
    
    // For BUY orders: 
    // - For YES positions: use asks (people selling YES tokens)
    // - For NO positions: use bids (people buying YES tokens, which gives us NO tokens)
    const relevantOrders = position === 'yes' ? orderbook.asks : orderbook.bids;
    
    // Check if relevantOrders exists and is an array
    if (!relevantOrders || !Array.isArray(relevantOrders)) {
      return { contracts: 0, remainingUsd: usdAmount };
    }
    
    // Sort orders by price
    // - For YES positions: ascending (lowest ask first)
    // - For NO positions: descending (highest bid first)
    const sortedOrders = position === 'yes' 
      ? relevantOrders.sort((a, b) => a.price - b.price)
      : relevantOrders.sort((a, b) => b.price - a.price);
    
    
    for (const order of sortedOrders) {
      if (remainingUsd <= 0) break;
      
      const orderPrice = order.price;
      
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
      
      // For BUY orders, use the price directly (what we pay)
      // For NO positions using bids, we need to invert the price
      const costPerContract = position === 'no' ? (1 - orderPrice) : orderPrice;
      
      // How many contracts we can buy at this price level
      const contractsAtThisPrice = Math.min(
        totalAvailableSize, // Available contracts at this price
        remainingUsd / costPerContract // How many we can afford
      );
      
      if (contractsAtThisPrice > 0) {
        totalContracts += contractsAtThisPrice;
        remainingUsd -= contractsAtThisPrice * costPerContract;
        
      }
    }
    
    
    return { contracts: totalContracts, remainingUsd };
  }, [orderbook]);

  // Get effective price for market orders
  const getEffectivePrice = useCallback((usdAmount: number, contracts: number, remainingUsd: number): number => {
    if (contracts === 0) return 0;
    return (usdAmount - remainingUsd) / contracts;
  }, []);

  // Check if there's sufficient liquidity
  const hasSufficientLiquidity = useCallback((usdAmount: number, position: 'yes' | 'no', side: 'buy' | 'sell'): boolean => {
    if (!orderbook || !usdAmount || usdAmount <= 0) return false;
    
    const result = calculateContractsForMarketOrder(usdAmount, position, side);
    
    // For buy orders, check if we can fully fill the order (remainingUsd should be 0 or very close)
    if (side === 'buy') {
      return result.remainingUsd < 0.01; // Allow for small rounding errors
    }
    
    // For sell orders, check if we can sell all shares (contracts should equal the requested amount)
    if (side === 'sell') {
      const sharesRequested = usdAmount;
      const sharesSold = result.contracts;
      return Math.abs(sharesRequested - sharesSold) < 0.01; // Allow for small rounding errors
    }
    
    return result.contracts > 0;
  }, [orderbook, calculateContractsForMarketOrder]);

  return {
    calculateContractsForMarketOrder,
    getEffectivePrice,
    hasSufficientLiquidity
  };
}
