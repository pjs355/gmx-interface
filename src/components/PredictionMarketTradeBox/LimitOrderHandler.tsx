import { useCallback } from 'react';
import type { OrderbookSnapshot } from 'lib/orderbookService';

export function useLimitOrderHandler(orderbook: OrderbookSnapshot | null) {
  // Validate limit order parameters
  const validateLimitOrder = useCallback((amount: string, price: string, position: 'yes' | 'no'): {
    isValid: boolean;
    errors: string[];
  } => {
    const errors: string[] = [];
    
    // Check if amount is valid
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      errors.push('Amount must be a positive number');
    }
    
    // Check if price is valid (convert cents to dollars for validation)
    const numPrice = parseFloat(price) / 100;
    if (isNaN(numPrice) || numPrice <= 0 || numPrice >= 1) {
      errors.push('Price must be between 0 and 1');
    }
    
    // Check if orderbook has data for price validation
    if (orderbook && orderbook.asks && orderbook.bids) {
      const bestAsk = Math.min(...orderbook.asks.map(ask => ask.price));
      const bestBid = Math.max(...orderbook.bids.map(bid => bid.price));
      
      if (position === 'yes' && numPrice >= bestAsk) {
        errors.push('Price too high - would execute as market order');
      }
      
      if (position === 'no' && numPrice >= (1 - bestBid)) {
        errors.push('Price too high - would execute as market order');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }, [orderbook]);

  // Calculate the cost for limit orders
  const calculateLimitOrderCost = useCallback((amount: string, price: string): number => {
    const numAmount = parseFloat(amount);
    const numPrice = parseFloat(price) / 100; // Convert cents to dollars
    
    if (isNaN(numAmount) || isNaN(numPrice) || numAmount <= 0 || numPrice <= 0) {
      return 0;
    }
    
    return numAmount * numPrice;
  }, []);

  // Check if limit order would be immediately executable
  const isImmediatelyExecutable = useCallback((price: string, position: 'yes' | 'no'): boolean => {
    if (!orderbook || !price) return false;
    
    const numPrice = parseFloat(price) / 100; // Convert cents to dollars
    if (isNaN(numPrice)) return false;
    
    if (position === 'yes') {
      // For YES position, check if price is at or above best ask
      const bestAsk = orderbook.asks?.length > 0 ? Math.min(...orderbook.asks.map(ask => ask.price)) : 1;
      return numPrice >= bestAsk;
    } else {
      // For NO position, check if price is at or above best ask (inverted)
      const bestAsk = orderbook.asks?.length > 0 ? Math.min(...orderbook.asks.map(ask => 1 - ask.price)) : 1;
      return numPrice >= bestAsk;
    }
  }, [orderbook]);

  return {
    validateLimitOrder,
    calculateLimitOrderCost,
    isImmediatelyExecutable
  };
}
