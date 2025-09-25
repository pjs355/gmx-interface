/**
 * Comprehensive Chart Data Testing Script
 * 
 * This script helps diagnose what SHOULD be displayed vs what IS displayed
 * in prediction market charts. It provides detailed logging and analysis.
 */

import { predictionMarketDataService } from '../lib/predictionMarketDataService';
import { predictionMarketCache } from '../lib/predictionMarketCache';

interface TestResult {
  questionId: string;
  marketName: string;
  expectedData: {
    hasHistoricalData: boolean;
    historicalCount: number;
    firstHistoricalPrice: number | null;
    lastHistoricalPrice: number | null;
    historicalTimeRange: string;
  };
  actualData: {
    cacheHit: boolean;
    historicalPrices: any[];
    processedCount: number;
    dataPoints: any[];
  };
  orderbook: {
    hasOrderbook: boolean;
    bestAsk: number | null;
    bestBid: number | null;
    asksCount: number;
    bidsCount: number;
  };
  issues: string[];
  recommendations: string[];
}

class ChartDataTester {
  private results: TestResult[] = [];

  /**
   * Test a specific market's data flow
   */
  async testMarket(questionId: string, marketName: string, orderbook?: any): Promise<TestResult> {
    console.log(`\n🔍 Testing Market: ${marketName} (${questionId})`);
    console.log('='.repeat(60));

    const result: TestResult = {
      questionId,
      marketName,
      expectedData: {
        hasHistoricalData: false,
        historicalCount: 0,
        firstHistoricalPrice: null,
        lastHistoricalPrice: null,
        historicalTimeRange: 'No data'
      },
      actualData: {
        cacheHit: false,
        historicalPrices: [],
        processedCount: 0,
        dataPoints: []
      },
      orderbook: {
        hasOrderbook: false,
        bestAsk: null,
        bestBid: null,
        asksCount: 0,
        bidsCount: 0
      },
      issues: [],
      recommendations: []
    };

    // Test 1: Check if market data exists in cache
    console.log('📦 Checking cache...');
    const cachedMarket = predictionMarketDataService.getCachedMarketData(questionId);
    result.actualData.cacheHit = !!cachedMarket;
    
    if (!cachedMarket) {
      result.issues.push('Market not found in cache');
      result.recommendations.push('Ensure market data is loaded via PredictionDataContext');
    } else {
      console.log(`✅ Market found in cache: ${cachedMarket.displayName || cachedMarket.question}`);
    }

    // Test 2: Check historical data
    console.log('📈 Checking historical data...');
    try {
      const historicalPrices = predictionMarketDataService.getHistoricalPrices(questionId);
      result.actualData.historicalPrices = historicalPrices || [];
      result.expectedData.hasHistoricalData = historicalPrices && historicalPrices.length > 0;
      result.expectedData.historicalCount = historicalPrices ? historicalPrices.length : 0;

      if (historicalPrices && historicalPrices.length > 0) {
        const sortedPrices = [...historicalPrices].sort((a, b) => a.timestamp - b.timestamp);
        result.expectedData.firstHistoricalPrice = sortedPrices[0].price;
        result.expectedData.lastHistoricalPrice = sortedPrices[sortedPrices.length - 1].price;
        
        const firstDate = new Date(sortedPrices[0].timestamp * 1000);
        const lastDate = new Date(sortedPrices[sortedPrices.length - 1].timestamp * 1000);
        result.expectedData.historicalTimeRange = `${firstDate.toISOString()} to ${lastDate.toISOString()}`;

        console.log(`✅ Historical data found: ${historicalPrices.length} points`);
        console.log(`   First price: ${result.expectedData.firstHistoricalPrice} at ${firstDate.toLocaleString()}`);
        console.log(`   Last price: ${result.expectedData.lastHistoricalPrice} at ${lastDate.toLocaleString()}`);
      } else {
        console.log('❌ No historical data found');
        result.issues.push('No historical data available');
        result.recommendations.push('Should show 50% fallback data');
      }
    } catch (error) {
      console.log(`❌ Error loading historical data: ${error}`);
      result.issues.push(`Historical data error: ${error}`);
    }

    // Test 3: Check orderbook data
    console.log('📋 Checking orderbook data...');
    if (orderbook) {
      result.orderbook.hasOrderbook = true;
      result.orderbook.asksCount = orderbook.asks?.length || 0;
      result.orderbook.bidsCount = orderbook.bids?.length || 0;

      if (orderbook.asks && orderbook.asks.length > 0) {
        result.orderbook.bestAsk = Math.min(...orderbook.asks.map((a: any) => a.price));
        console.log(`✅ Best Ask: ${result.orderbook.bestAsk}`);
      }

      if (orderbook.bids && orderbook.bids.length > 0) {
        result.orderbook.bestBid = Math.max(...orderbook.bids.map((b: any) => b.price));
        console.log(`✅ Best Bid: ${result.orderbook.bestBid}`);
      }

      console.log(`📊 Orderbook: ${result.orderbook.asksCount} asks, ${result.orderbook.bidsCount} bids`);
    } else {
      console.log('❌ No orderbook data provided');
      result.issues.push('No orderbook data available');
      result.recommendations.push('Ensure orderbook is loaded and passed to chart');
    }

    // Test 4: Simulate chart data processing
    console.log('🔄 Simulating chart data processing...');
    const mockChartData = this.simulateChartDataProcessing(result);
    result.actualData.dataPoints = mockChartData;
    result.actualData.processedCount = mockChartData.length;

    console.log(`📊 Would generate ${mockChartData.length} chart data points`);
    if (mockChartData.length > 0) {
      const firstPoint = mockChartData[0];
      const lastPoint = mockChartData[mockChartData.length - 1];
      console.log(`   First point: ${firstPoint.percentage}% at ${new Date(firstPoint.timestamp * 1000).toLocaleString()}`);
      console.log(`   Last point: ${lastPoint.percentage}% at ${new Date(lastPoint.timestamp * 1000).toLocaleString()}`);
    }

    // Test 5: Validate expected vs actual
    console.log('✅ Validation Summary:');
    this.validateResults(result);

    this.results.push(result);
    return result;
  }

  /**
   * Simulate what the chart component would do with the data
   */
  private simulateChartDataProcessing(result: TestResult): any[] {
    const now = Math.floor(Date.now() / 1000);
    const oneHourAgo = now - 3600;
    const dataPoints: any[] = [];

    // If we have historical data, use it
    if (result.actualData.historicalPrices.length > 0) {
      for (const price of result.actualData.historicalPrices) {
        dataPoints.push({
          timestamp: price.timestamp,
          price: price.price,
          percentage: price.price * 100,
          isHistorical: true
        });
      }
    } else {
      // No historical data - should fallback to 50%
      dataPoints.push({
        timestamp: oneHourAgo,
        price: 0.5,
        percentage: 50,
        isFallback: true
      });
    }

    // Add live price if available
    if (result.orderbook.bestAsk !== null) {
      dataPoints.push({
        timestamp: now,
        price: result.orderbook.bestAsk,
        percentage: result.orderbook.bestAsk * 100,
        isLive: true
      });
    } else if (dataPoints.length === 0) {
      // No historical AND no live data - pure fallback
      dataPoints.push({
        timestamp: now,
        price: 0.5,
        percentage: 50,
        isFallback: true
      });
    }

    return dataPoints.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Validate the results and identify issues
   */
  private validateResults(result: TestResult): void {
    // Check if chart would be empty
    if (result.actualData.processedCount === 0) {
      result.issues.push('Chart would be empty - no data points generated');
      result.recommendations.push('Implement proper fallback data generation');
    }

    // Check if only showing fallback data when live data should be available
    if (result.orderbook.hasOrderbook && result.orderbook.bestAsk !== null && 
        !result.expectedData.hasHistoricalData) {
      const wouldShowFallback = result.actualData.dataPoints.some(p => p.isFallback);
      if (wouldShowFallback) {
        result.recommendations.push('Should transition from 50% fallback to live price');
      }
    }

    // Check for slow loading issues
    if (!result.actualData.cacheHit) {
      result.issues.push('Market not in cache - will cause slow loading');
      result.recommendations.push('Ensure PredictionDataContext pre-loads all market data');
    }

    // Check for missing live prices
    if (result.orderbook.hasOrderbook && result.orderbook.bestAsk === null && result.orderbook.asksCount === 0) {
      result.issues.push('Orderbook exists but has no asks - no live price available');
      result.recommendations.push('Check orderbook data quality and API responses');
    }

    console.log(`🔍 Issues found: ${result.issues.length}`);
    result.issues.forEach(issue => console.log(`   ❌ ${issue}`));
    
    console.log(`💡 Recommendations: ${result.recommendations.length}`);
    result.recommendations.forEach(rec => console.log(`   💡 ${rec}`));
  }

  /**
   * Test multiple markets from context data
   */
  async testAllMarketsInUmbrella(umbrellaId: string, markets: any[], orderbooks: Record<string, any>): Promise<TestResult[]> {
    console.log(`\n🎯 Testing all markets in umbrella: ${umbrellaId}`);
    console.log('='.repeat(80));

    const results: TestResult[] = [];

    for (const market of markets) {
      const questionId = market._id || market.questionId || market.marketId;
      const marketName = market.displayName || market.question || 'Unknown Market';
      const orderbook = orderbooks[questionId];

      if (questionId) {
        const result = await this.testMarket(questionId, marketName, orderbook);
        results.push(result);
      }
    }

    // Generate summary report
    this.generateSummaryReport(results);
    return results;
  }

  /**
   * Generate a summary report of all test results
   */
  private generateSummaryReport(results: TestResult[]): void {
    console.log(`\n📊 SUMMARY REPORT`);
    console.log('='.repeat(80));

    const totalMarkets = results.length;
    const marketsWithHistoricalData = results.filter(r => r.expectedData.hasHistoricalData).length;
    const marketsWithOrderbooks = results.filter(r => r.orderbook.hasOrderbook).length;
    const marketsWithIssues = results.filter(r => r.issues.length > 0).length;
    const marketsInCache = results.filter(r => r.actualData.cacheHit).length;

    console.log(`📈 Markets tested: ${totalMarkets}`);
    console.log(`📦 Markets in cache: ${marketsInCache}/${totalMarkets} (${Math.round(marketsInCache/totalMarkets*100)}%)`);
    console.log(`📊 Markets with historical data: ${marketsWithHistoricalData}/${totalMarkets} (${Math.round(marketsWithHistoricalData/totalMarkets*100)}%)`);
    console.log(`📋 Markets with orderbooks: ${marketsWithOrderbooks}/${totalMarkets} (${Math.round(marketsWithOrderbooks/totalMarkets*100)}%)`);
    console.log(`❌ Markets with issues: ${marketsWithIssues}/${totalMarkets} (${Math.round(marketsWithIssues/totalMarkets*100)}%)`);

    // Top issues
    const allIssues = results.flatMap(r => r.issues);
    const issueCount = allIssues.reduce((acc, issue) => {
      acc[issue] = (acc[issue] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log(`\n🔥 Top Issues:`);
    Object.entries(issueCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .forEach(([issue, count]) => {
        console.log(`   ${count}x: ${issue}`);
      });

    // Performance insights
    console.log(`\n⚡ Performance Insights:`);
    const avgHistoricalCount = results
      .filter(r => r.expectedData.hasHistoricalData)
      .reduce((sum, r) => sum + r.expectedData.historicalCount, 0) / marketsWithHistoricalData || 0;
    
    console.log(`   Average historical data points per market: ${Math.round(avgHistoricalCount)}`);
    
    const marketsNeedingFallback = results.filter(r => 
      !r.expectedData.hasHistoricalData && !r.orderbook.bestAsk
    ).length;
    console.log(`   Markets needing pure fallback data: ${marketsNeedingFallback}`);

    // Recommendations
    console.log(`\n💡 Key Recommendations:`);
    if (marketsInCache < totalMarkets) {
      console.log(`   1. Improve cache loading - ${totalMarkets - marketsInCache} markets missing from cache`);
    }
    if (marketsWithHistoricalData < totalMarkets * 0.5) {
      console.log(`   2. Investigate historical data loading - only ${Math.round(marketsWithHistoricalData/totalMarkets*100)}% have data`);
    }
    if (marketsWithOrderbooks < totalMarkets) {
      console.log(`   3. Ensure all orderbooks are loaded - ${totalMarkets - marketsWithOrderbooks} missing orderbooks`);
    }
    if (marketsNeedingFallback > 0) {
      console.log(`   4. Implement robust 50% fallback for ${marketsNeedingFallback} markets with no data`);
    }
  }

  /**
   * Export results for further analysis
   */
  exportResults(): any {
    return {
      timestamp: new Date().toISOString(),
      summary: {
        totalMarkets: this.results.length,
        marketsWithData: this.results.filter(r => r.expectedData.hasHistoricalData).length,
        marketsWithIssues: this.results.filter(r => r.issues.length > 0).length
      },
      results: this.results
    };
  }

  /**
   * Clear previous results
   */
  clear(): void {
    this.results = [];
  }
}

// Export singleton instance
export const chartDataTester = new ChartDataTester();

// Helper function to run tests from browser console
(window as any).testChartData = chartDataTester;

export default ChartDataTester;
