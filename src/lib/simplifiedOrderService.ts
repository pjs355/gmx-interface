

export interface RawOrder {
  orderId: string;
  questionId: string;
  tokenId: string;
  side: 'buy' | 'sell';
  position?: 'Yes' | 'No'; 
  price?: number;
  size?: number;
  filled: boolean;
  filledAt: string | null;
  createdAt: string;
  maker: string;
  makerAmount: string;
  takerAmount: string;
  usdcTotalMicro: number;
  tokenTotalMicro: number;
  committedMicro?: number;
}

export interface ProcessedOrder {
  orderId: string;
  questionId: string;
  tokenId: string;
  side: 'buy' | 'sell';
  position: 'Yes' | 'No';
  price: number;
  size: number;
  filled: boolean;
  filledAt: string | null;
  createdAt: string;
  usdcValue: number; // Total USDC value
  tokenValue: number; // Total token value
}

export interface OrderAggregates {
  Yes: {
    totalSize: number;
    totalValue: number;
    avgPrice: number | null;
    count: number;
  };
  No: {
    totalSize: number;
    totalValue: number;
    avgPrice: number | null;
    count: number;
  };
}

const API_BASE_URL = 'https://prediction-api-production.up.railway.app';

// Map tokenId to position based on known patterns or database lookup
// For now, we'll use a simple heuristic or require the API to provide this
const TOKEN_POSITION_MAP = new Map<string, 'Yes' | 'No'>();

export async function fetchUserOrders(account: string, marketData?: Map<string, { yesTokenId: string; noTokenId: string }>): Promise<ProcessedOrder[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/${account}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch orders: ${response.status}`);
    }

    const responseData = await response.json();
    // Log the raw API response exactly as returned
    try { console.log('🧾 Orders API raw response:', responseData); } catch {}
    
    // Handle different response formats
    let rawOrders: RawOrder[];
    if (Array.isArray(responseData)) {
      rawOrders = responseData;
    } else if (responseData && Array.isArray(responseData.orders)) {
      rawOrders = responseData.orders;
    } else if (responseData && Array.isArray(responseData.data)) {
      rawOrders = responseData.data;
    } else {
      console.warn('Unexpected API response format:', responseData);
      return [];
    }
    
    // Process and clean the raw orders
    const processedOrders: ProcessedOrder[] = rawOrders
      .map(order => {
        try {
          // Validate required fields
          if (!order || typeof order !== 'object') {
            console.warn('Invalid order object:', order);
            return null;
          }

          const isLegacy = (o: any) => {
            const uOk = typeof (o as any)?.usdcTotalMicro === 'number' && !isNaN((o as any)?.usdcTotalMicro);
            const tOk = typeof (o as any)?.tokenTotalMicro === 'number' && !isNaN((o as any)?.tokenTotalMicro);
            return !uOk || !tOk;
          };

          // Determine position from tokenId using market data
          let position: 'Yes' | 'No';
          if (order.position) {
            position = order.position;
          } else if (marketData) {
            // Use market data to determine position
            const market = marketData.get(order.questionId);
            if (!market) {
              // Treat as legacy if market metadata isn't available
              if (isLegacy(order)) {
                return null;
              }
              throw new Error(`No market data found for questionId: ${order.questionId}`);
            }
            if (order.tokenId === market.yesTokenId) {
              position = 'Yes';
            } else if (order.tokenId === market.noTokenId) {
              position = 'No';
            } else {
              throw new Error(`TokenId ${order.tokenId} does not match any known token for questionId ${order.questionId}. Expected yesTokenId: ${market.yesTokenId}, noTokenId: ${market.noTokenId}`);
            }
          } else {
            // Try to get from our map as fallback
            const mappedPosition = TOKEN_POSITION_MAP.get(order.tokenId);
            if (!mappedPosition) {
              throw new Error(`Cannot determine position for tokenId: ${order.tokenId}. Market data not provided and token not mapped.`);
            }
            position = mappedPosition;
          }

          // Calculate price from available data if not provided
          let price: number;
          if (typeof order.price === 'number' && !isNaN(order.price)) {
            price = order.price;
          } else if (order.usdcTotalMicro && order.tokenTotalMicro && order.usdcTotalMicro > 0 && order.tokenTotalMicro > 0) {
            // Calculate price as USDC per token (convert from micro units)
            price = (order.usdcTotalMicro / 1_000_000) / (order.tokenTotalMicro / 1_000_000);
          } else if (order.makerAmount && order.takerAmount && parseFloat(order.makerAmount) > 0 && parseFloat(order.takerAmount) > 0) {
            // Calculate price from maker/taker amounts
            price = parseFloat(order.makerAmount) / parseFloat(order.takerAmount);
          } else {
            throw new Error('Cannot calculate price - missing required fields');
          }

          // Calculate size from available data if not provided
          let size: number;
          if (typeof order.size === 'number' && !isNaN(order.size)) {
            size = order.size;
          } else if (order.tokenTotalMicro && order.tokenTotalMicro > 0) {
            // Use token amount as size
            size = order.tokenTotalMicro / 1_000_000;
          } else if (order.committedMicro && order.committedMicro > 0) {
            // Use committed amount as size
            size = order.committedMicro / 1_000_000;
          } else if (order.takerAmount && parseFloat(order.takerAmount) > 0) {
            // Use taker amount as size
            size = parseFloat(order.takerAmount);
          } else if (order.makerAmount && parseFloat(order.makerAmount) > 0) {
            // Use maker amount as size
            size = parseFloat(order.makerAmount);
          } else {
            // For orders with zero amounts, set size to 0 but don't throw error
            console.warn('Order with zero amounts, setting size to 0:', {
              orderId: order.orderId,
              tokenTotalMicro: order.tokenTotalMicro,
              committedMicro: order.committedMicro,
              takerAmount: order.takerAmount,
              makerAmount: order.makerAmount
            });
            size = 0;
          }

          // Validate required fields - NO FALLBACKS for financial data
          if (!order.orderId) throw new Error('Missing orderId');
          if (!order.questionId) throw new Error('Missing questionId');
          if (!order.tokenId) throw new Error('Missing tokenId');
          if (!order.side || (order.side !== 'buy' && order.side !== 'sell')) throw new Error('Invalid side');
          if (typeof price !== 'number' || isNaN(price) || price <= 0) throw new Error('Invalid calculated price');
          if (typeof size !== 'number' || isNaN(size) || size < 0) throw new Error('Invalid calculated size');
          if (typeof order.usdcTotalMicro !== 'number' || isNaN(order.usdcTotalMicro)) {
            if (isLegacy(order)) {
              return null;
            }
            throw new Error('Invalid usdcTotalMicro');
          }
          if (typeof order.tokenTotalMicro !== 'number' || isNaN(order.tokenTotalMicro)) {
            if (isLegacy(order)) {
              return null;
            }
            throw new Error('Invalid tokenTotalMicro');
          }

          return {
            orderId: order.orderId,
            questionId: order.questionId,
            tokenId: order.tokenId,
            side: order.side,
            position,
            price: price,
            size: size,
            filled: Boolean(order.filled),
            filledAt: order.filledAt,
            createdAt: order.createdAt,
            usdcValue: order.usdcTotalMicro / 1_000_000, // Convert from micro to regular units
            tokenValue: order.tokenTotalMicro / 1_000_000,
          };
        } catch (error) {
          console.warn('Error processing order:', {
            orderId: order?.orderId,
            questionId: order?.questionId,
            error: error instanceof Error ? error.message : String(error),
            orderData: {
              hasPrice: 'price' in order,
              hasSize: 'size' in order,
              hasTokenTotalMicro: 'tokenTotalMicro' in order,
              hasCommittedMicro: 'committedMicro' in order,
              hasTakerAmount: 'takerAmount' in order,
              hasMakerAmount: 'makerAmount' in order,
              tokenTotalMicro: order?.tokenTotalMicro,
              committedMicro: order?.committedMicro,
              takerAmount: order?.takerAmount,
              makerAmount: order?.makerAmount
            }
          });
          return null;
        }
      })
      .filter((order): order is ProcessedOrder => order !== null && Boolean(order.questionId) && Boolean(order.tokenId)); // Filter out invalid orders

    return processedOrders;
  } catch (error) {
    console.error('Error fetching user orders:', error);
    return [];
  }
}

export async function fetchOrdersForMarket(account: string, questionId: string): Promise<ProcessedOrder[]> {
  const allOrders = await fetchUserOrders(account);
  return allOrders.filter(order => order.questionId === questionId);
}

// Cancel a specific order by ID via backend route
export async function cancelOrder(orderId: string): Promise<{ success: boolean; error?: string }> {
  if (!orderId) return { success: false, error: 'Missing orderId' };
  try {
    const res = await fetch(`${API_BASE_URL}/orders/cancel/${encodeURIComponent(orderId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.success === false) {
      return { success: false, error: json?.error || `HTTP ${res.status}` };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Network error' };
  }
}

// Helper to get order aggregates by position for a specific market
export function getOrderAggregates(orders: ProcessedOrder[], questionId: string): OrderAggregates {
  const marketOrders = orders
    .filter(order => order.questionId === questionId)
    .filter(order => order.filled); // exclude pending/unfilled orders from calculations
  
  const yesOrders = marketOrders.filter(order => order.position === 'Yes');
  const noOrders = marketOrders.filter(order => order.position === 'No');

  return {
    Yes: {
      totalSize: yesOrders.reduce((sum, order) => sum + order.size, 0),
      totalValue: yesOrders.reduce((sum, order) => sum + order.usdcValue, 0),
      avgPrice: yesOrders.length > 0 ? yesOrders.reduce((sum, order) => sum + order.price, 0) / yesOrders.length : null,
      count: yesOrders.length,
    },
    No: {
      totalSize: noOrders.reduce((sum, order) => sum + order.size, 0),
      totalValue: noOrders.reduce((sum, order) => sum + order.usdcValue, 0),
      avgPrice: noOrders.length > 0 ? noOrders.reduce((sum, order) => sum + order.price, 0) / noOrders.length : null,
      count: noOrders.length,
    },
  };
}

// Helper to get filled orders (completed trades)
export function getFilledOrders(orders: ProcessedOrder[]): ProcessedOrder[] {
  return orders.filter(order => order.filled && order.filledAt);
}

// Helper to get open orders (pending)
export function getOpenOrders(orders: ProcessedOrder[]): ProcessedOrder[] {
  return orders.filter(order => !order.filled);
}

// Compute realized PnL ("trading returns") for a market using filled orders only.
// This ignores leftover unmatched shares and only accounts for buys matched with sells (FIFO per leg Yes/No).
export function getTradingReturns(orders: ProcessedOrder[], questionId: string): { yesPnL: number; noPnL: number } {
  const marketOrders = orders
    .filter((o) => o.questionId === questionId && o.filled)
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  

  function realizedForLeg(leg: 'Yes' | 'No'): number {
    // Work in micro-dollars to avoid FP rounding errors
    type Lot = { sharesMicro: number; priceMicro: number };
    const buyLots: Lot[] = [];
    let realizedMicro = 0; // micro-dollars

    for (const o of marketOrders) {
      if (o.position !== leg) continue;
      // NO FALLBACKS: require valid tokenValue (shares), usdcValue (total USD), and price
      if (typeof o.tokenValue !== 'number' || !isFinite(o.tokenValue) || o.tokenValue <= 0) continue;
      if (typeof o.usdcValue !== 'number' || !isFinite(o.usdcValue) || o.usdcValue <= 0) continue;
      if (typeof o.price !== 'number' || !isFinite(o.price) || o.price <= 0) continue;

      const qtyMicro = Math.round(o.tokenValue * 1_000_000); // shares in micro-shares
      const priceMicro = Math.round(o.price * 1_000_000);    // dollars per share in micro-dollars

      if (o.side === 'buy') {
        // Add to inventory
        buyLots.push({ sharesMicro: qtyMicro, priceMicro });
        
      } else if (o.side === 'sell') {
        // Close existing inventory FIFO
        let remainingMicro = qtyMicro;
        for (let i = 0; i < buyLots.length && remainingMicro > 0; i++) {
          const lot = buyLots[i];
          const closeMicro = Math.min(lot.sharesMicro, remainingMicro);
          if (closeMicro > 0) {
            const deltaPriceMicro = priceMicro - lot.priceMicro; // micro-dollars/share
            // micro-dollars = round((micro$/share * micro-shares) / 1e6)
            const pnlMicro = Math.round((deltaPriceMicro * closeMicro) / 1_000_000);
            realizedMicro += pnlMicro;
            
            lot.sharesMicro -= closeMicro;
            remainingMicro -= closeMicro;
          }
        }
        // Remove depleted lots
        for (let i = buyLots.length - 1; i >= 0; i--) {
          if (buyLots[i].sharesMicro <= 0) buyLots.splice(i, 1);
        }
        // If remaining > 0, extra sell ignored (no short PnL assumptions)
      }
    }
    // Convert micro-dollars to dollars rounded to 2 decimals
    const realizedDollars = Math.round((realizedMicro / 1_000_000) * 100) / 100;
    return realizedDollars;
  }

  const yesPnL = realizedForLeg('Yes');
  const noPnL = realizedForLeg('No');
  
  return { yesPnL, noPnL };
}

// Calculate final leftover shares and their cost using FIFO
export function getFinalAmount(orders: ProcessedOrder[], questionId: string): { yesShares: number; noShares: number; yesCost: number; noCost: number } {
  const marketOrders = orders
    .filter((o) => o.questionId === questionId && o.filled)
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  function calculateFinalForLeg(leg: 'Yes' | 'No'): { shares: number; cost: number } {
    // Work in micro-shares and micro-dollars to avoid FP rounding errors
    type Lot = { sharesMicro: number; priceMicro: number };
    const buyLots: Lot[] = [];
    let remainingSharesMicro = 0; // Track leftover shares

    for (const o of marketOrders) {
      if (o.position !== leg) continue;
      // NO FALLBACKS: require valid tokenValue (shares), usdcValue (total USD), and price
      if (typeof o.tokenValue !== 'number' || !isFinite(o.tokenValue) || o.tokenValue <= 0) continue;
      if (typeof o.usdcValue !== 'number' || !isFinite(o.usdcValue) || o.usdcValue <= 0) continue;
      if (typeof o.price !== 'number' || !isFinite(o.price) || o.price <= 0) continue;

      const qtyMicro = Math.round(o.tokenValue * 1_000_000); // shares in micro-shares
      const priceMicro = Math.round(o.price * 1_000_000);    // dollars per share in micro-dollars

      if (o.side === 'buy') {
        // Add to inventory
        buyLots.push({ sharesMicro: qtyMicro, priceMicro });
        remainingSharesMicro += qtyMicro;
      } else if (o.side === 'sell') {
        // Remove from inventory FIFO
        let remainingMicro = qtyMicro;
        for (let i = 0; i < buyLots.length && remainingMicro > 0; i++) {
          const lot = buyLots[i];
          const closeMicro = Math.min(lot.sharesMicro, remainingMicro);
          if (closeMicro > 0) {
            lot.sharesMicro -= closeMicro;
            remainingMicro -= closeMicro;
            remainingSharesMicro -= closeMicro;
          }
        }
        // Remove depleted lots
        for (let i = buyLots.length - 1; i >= 0; i--) {
          if (buyLots[i].sharesMicro <= 0) buyLots.splice(i, 1);
        }
      }
    }

    // Calculate cost of remaining shares using FIFO (most recent buys first)
    let remainingCostMicro = 0;
    let sharesToAccountFor = remainingSharesMicro;
    
    // Go through buy lots in reverse order (most recent first)
    for (let i = buyLots.length - 1; i >= 0 && sharesToAccountFor > 0; i--) {
      const lot = buyLots[i];
      const sharesFromThisLot = Math.min(lot.sharesMicro, sharesToAccountFor);
      // priceMicro is micro-dollars per share, sharesFromThisLot is micro-shares
      // So we need to divide by 1M to get the cost in micro-dollars
      remainingCostMicro += Math.round((sharesFromThisLot * lot.priceMicro) / 1_000_000);
      sharesToAccountFor -= sharesFromThisLot;
    }

    // Convert back to regular units
    const shares = Math.round(remainingSharesMicro / 1_000_000 * 100) / 100;
    const cost = Math.round(remainingCostMicro / 1_000_000 * 100) / 100;
    
    return { shares, cost };
  }

  const yesResult = calculateFinalForLeg('Yes');
  const noResult = calculateFinalForLeg('No');

  return {
    yesShares: yesResult.shares,
    noShares: noResult.shares,
    yesCost: yesResult.cost,
    noCost: noResult.cost,
  };
}
