import { predictionMarketCache } from './predictionMarketCache';

export interface PredictionMarket {
  _id: string;
  conditionId: string;
  marketId: string;
  question: string;
  questionId: string;
  yesTokenId: string;
  noTokenId: string;
  registered: boolean;
  createdAt: string;
  updatedAt: string;
  __v: number;
  displayName?: string;
  image?: string;
  historicalPrices?: Array<{
    timestamp: number | string;
    price: number;
    volume?: number;
    [key: string]: any;
  }>;
}

interface ApiResponse {
  success: boolean;
  data: PredictionMarket[];
}

class PredictionMarketDataService {
  private readonly API_BASE_URL = 'https://prediction-api-production.up.railway.app'; 
  // Track which markets we've already logged to avoid spammy console output
  private loggedHistoricalMarkets = new Set<string>();

  async fetchAllMarkets(): Promise<PredictionMarket[]> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/umbrellas`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
      }
      const apiResponse: ApiResponse = await response.json();
      if (!apiResponse.success || !Array.isArray(apiResponse.data)) {
        throw new Error('Invalid API response structure');
      }
      const markets = apiResponse.data;
      markets.forEach(market => {
        predictionMarketCache.setMarketData(market);
      });
      return markets;
    } catch (error) {
      throw error;
    }
  }

  async fetchMarketById(id: string): Promise<PredictionMarket | null> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/questions/${id}`);
      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`Market not found: ${id} (404)`);
          return null;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const apiResponse = await response.json();
      if (apiResponse.success && apiResponse.data) {
        const questionData = apiResponse.data;
        try {
          console.log('🧩 Question fetched:', questionData);
        } catch {}
        predictionMarketCache.setMarketData(questionData);
        return questionData;
      } else if (apiResponse._id) {
        try {
          console.log('🧩 Question fetched:', apiResponse);
        } catch {}
        predictionMarketCache.setMarketData(apiResponse);
        return apiResponse;
      } else {
        return null;
      }
    } catch (error) {
      console.warn(`Failed to fetch market ${id}:`, error);
      return null; // Return null instead of throwing to prevent breaking the UI
    }
  }

  getCachedMarketData(questionId: string): PredictionMarket | null {
    const cached = predictionMarketCache.getMarketData(questionId);
    return cached?.market || null;
  }

  getCachedMarkets(): PredictionMarket[] {
    return predictionMarketCache.getAllMarkets();
  }

  getHistoricalPrices(questionId: string): Array<{
    timestamp: number;
    price: number;
    volume?: number;
  }> {
    const prices = predictionMarketCache.getHistoricalPrices(questionId);

    // Log the full dataset once per market to help debug "pulling" issues
    if (!this.loggedHistoricalMarkets.has(questionId)) {
      this.loggedHistoricalMarkets.add(questionId);
      try {
        const market = predictionMarketCache.getMarketData(questionId)?.market;
        const name = market?.displayName || market?.question || questionId;
        // Single concise log with all data for this market
        console.log(
          '📈 Historical prices pulled for market:',
          { questionId, name, count: Array.isArray(prices) ? prices.length : 0, prices }
        );
      } catch {}
    }

    return prices;
  }

  storeHistoricalPrices(questionId: string, historicalPrices: Array<{
    timestamp?: number;
    ts?: number;
    price: number;
    volume?: number;
  }>): void {
    const transformedPrices = historicalPrices.map(price => {
      let timestamp = price.timestamp || price.ts || Date.now();
      if (timestamp > 1e12) {
        timestamp = Math.floor(timestamp / 1000);
      }
      const now = Math.floor(Date.now() / 1000);
      const oneYearAgo = now - (365 * 24 * 60 * 60);
      const oneYearFuture = now + (365 * 24 * 60 * 60);
      if (timestamp < oneYearAgo || timestamp > oneYearFuture) {
        timestamp = now;
      }
      return {
        timestamp,
        price: price.price,
        volume: price.volume
      };
    });
    predictionMarketCache.storeHistoricalPrices(questionId, transformedPrices);
  }

  getCacheStats() {
    return predictionMarketCache.getStats();
  }

  /**
   * Refresh historical data for a specific market
   */
  async refreshHistoricalData(questionId: string): Promise<boolean> {
    try {
      console.log('🔄 Refreshing historical data for:', questionId);
      const market = await this.fetchMarketById(questionId);
      
      if (market && market.historicalPrices && market.historicalPrices.length > 0) {
        this.storeHistoricalPrices(
          market._id || market.questionId,
          market.historicalPrices as unknown as Array<{ timestamp?: number; ts?: number; price: number; volume?: number }>
        );
        console.log('✅ Historical data refreshed for:', questionId);
        return true;
      }
      
      console.log('⚠️ No historical data available for:', questionId);
      return false;
    } catch (error) {
      console.error('❌ Error refreshing historical data for', questionId, ':', error);
      return false;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/health`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

export const predictionMarketDataService = new PredictionMarketDataService();
export default PredictionMarketDataService;
