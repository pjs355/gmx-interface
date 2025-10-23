import type { OrderbookSnapshot } from "lib/orderbookService";
import type { TestScenario } from "./TradeBoxTestRunner";

/**
 * Calculator for expected trade outcomes based on orderbook state
 * This matches the logic in MarketOrderHandler.tsx
 */
export class ExpectedOutcomeCalculator {
  
  /**
   * Calculate expected outcome for a market buy order
   */
  static calculateMarketBuy(
    usdAmount: number,
    position: 'yes' | 'no',
    orderbook: OrderbookSnapshot
  ): TestScenario['expectedOutcome'] {
    // Use same logic as MarketOrderHandler
    const S_cents = Math.floor(usdAmount * 100);
    let filled_shares = 0;
    let remaining_cents = S_cents;
    let maxPriceSeen = 0;
    
    // For YES: use asks, For NO: use bids
    const relevantOrders = position === 'yes' ? orderbook.asks : orderbook.bids;
    
    if (!relevantOrders || !Array.isArray(relevantOrders)) {
      return { contractsReceived: 0, usdSpent: 0, remainingUsd: usdAmount, avgPrice: 0 };
    }
    
    // Sort orders by price
    const sortedOrders = position === 'yes'
      ? [...relevantOrders].sort((a, b) => a.price - b.price)
      : [...relevantOrders].sort((a, b) => b.price - a.price);
    
    let i = 0;
    while (i < sortedOrders.length && remaining_cents > 0) {
      const order = sortedOrders[i];
      const orderPrice = order.price;
      
      // For NO positions using bids, invert the price
      const costPerContract = position === 'no' ? (1 - orderPrice) : orderPrice;
      const p_cents = Math.round(costPerContract * 100);
      
      // Handle nested orders structure
      let totalAvailableSize = 0;
      if (order.orders && Array.isArray(order.orders)) {
        totalAvailableSize = order.orders.reduce((sum, nestedOrder) => {
          const orderSize = nestedOrder.size || nestedOrder.makerQty || nestedOrder.origSize || 0;
          return sum + orderSize;
        }, 0);
      } else {
        totalAvailableSize = order.size || 0;
      }
      
      const availableWhole = Math.floor(totalAvailableSize);
      if (availableWhole <= 0 || p_cents <= 0) { 
        i++; 
        continue; 
      }

      const row_total_cents = availableWhole * p_cents;

      if (remaining_cents >= row_total_cents) {
        // Full clear this row
        filled_shares += availableWhole;
        remaining_cents -= row_total_cents;
        if (costPerContract > maxPriceSeen) maxPriceSeen = costPerContract;
        i++;
      } else {
        // Partial fill
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
    
    const contractsReceived = filled_shares;
    const remaining_usd = remaining_cents / 100.0;
    const usdSpent = usdAmount - remaining_usd;
    const avgPrice = contractsReceived > 0 ? usdSpent / contractsReceived : 0;
    
    return {
      contractsReceived,
      usdSpent,
      remainingUsd: remaining_usd,
      avgPrice,
    };
  }

  /**
   * Calculate expected outcome for a market sell order
   */
  static calculateMarketSell(
    sharesAmount: number,
    position: 'yes' | 'no',
    orderbook: OrderbookSnapshot
  ): TestScenario['expectedOutcome'] {
    const sharesToSell = Math.floor(sharesAmount);
    let remainingShares = sharesToSell;
    let totalUsdReceived = 0;
    let maxPriceSeen = 0;
    let minPriceSeen = Infinity;
    
    // For SELL YES: use bids, For SELL NO: use asks
    const relevantOrders = position === 'yes' ? orderbook.bids : orderbook.asks;
    
    const sortedOrders = position === 'yes'
      ? [...relevantOrders].sort((a, b) => b.price - a.price) // Highest bid first
      : [...relevantOrders].sort((a, b) => a.price - b.price); // Lowest ask first
    
    for (const order of sortedOrders) {
      if (remainingShares <= 0) break;
      
      // For NO position, invert the ask price
      const orderPrice = position === 'no' ? (1 - order.price) : order.price;
      let availableSize = 0;
      
      if (order.orders && Array.isArray(order.orders)) {
        availableSize = order.orders.reduce((sum, nestedOrder) => sum + (nestedOrder.size || 0), 0);
      } else {
        availableSize = order.size || 0;
      }
      
      const availableWhole = Math.floor(availableSize);
      const sharesAtThisPrice = Math.min(availableWhole, remainingShares);
      
      if (sharesAtThisPrice > 0) {
        const usdAtThisPrice = sharesAtThisPrice * orderPrice;
        totalUsdReceived += usdAtThisPrice;
        remainingShares -= sharesAtThisPrice;
        if (orderPrice > maxPriceSeen) maxPriceSeen = orderPrice;
        if (orderPrice < minPriceSeen) minPriceSeen = orderPrice;
      }
    }
    
    const sharesSold = sharesToSell - remainingShares;
    const avgPrice = sharesSold > 0 ? totalUsdReceived / sharesSold : 0;
    
    return {
      contractsReceived: sharesSold, // Contracts sold
      usdReceived: totalUsdReceived,
      avgPrice,
    };
  }

  /**
   * Calculate expected outcome for a limit buy order
   */
  static calculateLimitBuy(
    sharesAmount: number,
    priceInCents: number,
    position: 'yes' | 'no',
    orderbook: OrderbookSnapshot
  ): TestScenario['expectedOutcome'] {
    const price = priceInCents / 100; // Convert cents to dollars
    const shares = Math.floor(sharesAmount);
    
    // For limit orders, we need to check if they would be immediately filled
    // based on the orderbook
    const relevantOrders = position === 'yes' ? orderbook.asks : orderbook.bids;
    
    let filledShares = 0;
    let totalUsdSpent = 0;
    
    for (const order of relevantOrders) {
      if (filledShares >= shares) break;
      
      const orderPrice = position === 'no' ? (1 - order.price) : order.price;
      
      // Only fill if our limit price is >= orderbook price
      if (price >= orderPrice) {
        let availableSize = 0;
        if (order.orders && Array.isArray(order.orders)) {
          availableSize = order.orders.reduce((sum, nestedOrder) => sum + (nestedOrder.size || 0), 0);
        } else {
          availableSize = order.size || 0;
        }
        
        const availableWhole = Math.floor(availableSize);
        const sharesToFill = Math.min(availableWhole, shares - filledShares);
        
        if (sharesToFill > 0) {
          filledShares += sharesToFill;
          totalUsdSpent += sharesToFill * orderPrice;
        }
      } else {
        // Price not good enough, order would sit in the book
        break;
      }
    }
    
    const avgPrice = filledShares > 0 ? totalUsdSpent / filledShares : price;
    
    return {
      contractsReceived: filledShares,
      usdSpent: totalUsdSpent,
      avgPrice,
    };
  }

  /**
   * Calculate expected outcome for a limit sell order
   */
  static calculateLimitSell(
    sharesAmount: number,
    priceInCents: number,
    position: 'yes' | 'no',
    orderbook: OrderbookSnapshot
  ): TestScenario['expectedOutcome'] {
    const price = priceInCents / 100; // Convert cents to dollars
    const shares = Math.floor(sharesAmount);
    
    // For limit sell, check against bids (for yes) or asks (for no)
    const relevantOrders = position === 'yes' ? orderbook.bids : orderbook.asks;
    
    let filledShares = 0;
    let totalUsdReceived = 0;
    
    // Sort to get best prices first
    const sortedOrders = position === 'yes'
      ? [...relevantOrders].sort((a, b) => b.price - a.price)
      : [...relevantOrders].sort((a, b) => a.price - b.price);
    
    for (const order of sortedOrders) {
      if (filledShares >= shares) break;
      
      const orderPrice = position === 'no' ? (1 - order.price) : order.price;
      
      // Only fill if orderbook price is >= our limit price
      if (orderPrice >= price) {
        let availableSize = 0;
        if (order.orders && Array.isArray(order.orders)) {
          availableSize = order.orders.reduce((sum, nestedOrder) => sum + (nestedOrder.size || 0), 0);
        } else {
          availableSize = order.size || 0;
        }
        
        const availableWhole = Math.floor(availableSize);
        const sharesToFill = Math.min(availableWhole, shares - filledShares);
        
        if (sharesToFill > 0) {
          filledShares += sharesToFill;
          totalUsdReceived += sharesToFill * orderPrice;
        }
      } else {
        // Price not good enough, order would sit in the book
        break;
      }
    }
    
    const avgPrice = filledShares > 0 ? totalUsdReceived / filledShares : price;
    
    return {
      contractsReceived: filledShares,
      usdReceived: totalUsdReceived,
      avgPrice,
    };
  }

  /**
   * Calculate expected outcome for any test scenario
   */
  static calculateExpectedOutcome(
    scenario: Omit<TestScenario, 'expectedOutcome'>,
    orderbook: OrderbookSnapshot
  ): TestScenario['expectedOutcome'] {
    if (scenario.orderType === 'market') {
      if (scenario.side === 'buy') {
        return this.calculateMarketBuy(scenario.amount, scenario.position, orderbook);
      } else {
        return this.calculateMarketSell(scenario.amount, scenario.position, orderbook);
      }
    } else {
      // Limit order
      if (!scenario.price) {
        throw new Error('Price is required for limit orders');
      }
      
      if (scenario.side === 'buy') {
        return this.calculateLimitBuy(scenario.amount, scenario.price, scenario.position, orderbook);
      } else {
        return this.calculateLimitSell(scenario.amount, scenario.price, scenario.position, orderbook);
      }
    }
  }
}

