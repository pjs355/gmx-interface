export interface OrderbookEntry {
  id?: string;
  side?: 'buy' | 'sell';
  size?: number;
  price: number;
  timeInForce?: string;
  // Handle nested orders structure from actual API response
  orders?: Array<{
    id: string;
    side: 'buy' | 'sell';
    size: number;
    makerQty: number;
    origSize: number;
    takerQty: number;
    time: number;
    timeInForce: string;
    type: string;
  }>;
  originalClobOrder?: {
    tokenId: string;
    maker: string;
    signer: string;
    signature: string;
  };
}

export interface OrderbookSnapshot {
  asks: OrderbookEntry[];
  bids: OrderbookEntry[];
  stopBook: {
    asks: OrderbookEntry[];
    bids: OrderbookEntry[];
  };
  ts: number;
  lastOp: number;
  questionId?: string;
}

export interface OrderbookResponse {
  success: boolean;
  data: OrderbookSnapshot;
}

export class OrderbookService {
  private API_BASE_URL = 'https://prediction-api-production.up.railway.app'; 

  async fetchOrderbook(questionId: string): Promise<OrderbookSnapshot | null> {
    try {
      
      const response = await fetch(`${this.API_BASE_URL}/orderbook/${questionId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result: OrderbookResponse = await response.json();
      
      if (!result.success) {
        throw new Error('API returned success: false');
      }
      
      
      return result.data;
    } catch (error) {
      console.error('❌ Error fetching orderbook:', error);
      return null;
    }
  }

  // Helper method to format price for display
  formatPrice(price: number): string {
    return `$${price.toFixed(2)}`;
  }

  // Helper method to format size for display
  formatSize(size: number): string {
    return Math.round(size).toString();
  }

  // Helper method to get total volume at a price level
  getTotalVolumeAtPrice(orders: OrderbookEntry[], price: number): number {
    return orders
      .filter(order => order.price === price)
      .reduce((total, order) => total + (order.size || 0), 0);
  }

  // Helper method to get best bid and ask
  getBestPrices(orderbook: OrderbookSnapshot): { bestBid: number | null; bestAsk: number | null } {
    const bestBid = orderbook.bids.length > 0 
      ? Math.max(...orderbook.bids.map(bid => bid.price))
      : null;
    
    const bestAsk = orderbook.asks.length > 0 
      ? Math.min(...orderbook.asks.map(ask => ask.price))
      : null;
    
    return { bestBid, bestAsk };
  }

  // Helper method to calculate spread
  getSpread(orderbook: OrderbookSnapshot): number | null {
    const { bestBid, bestAsk } = this.getBestPrices(orderbook);
    
    if (bestBid === null || bestAsk === null) {
      return null;
    }
    
    return bestAsk - bestBid;
  }

  // Helper method to calculate spread percentage
  getSpreadPercentage(orderbook: OrderbookSnapshot): number | null {
    const spread = this.getSpread(orderbook);
    const { bestBid, bestAsk } = this.getBestPrices(orderbook);
    
    if (spread === null || bestBid === null || bestAsk === null) {
      return null;
    }
    
    return (spread / bestBid) * 100;
  }
}
