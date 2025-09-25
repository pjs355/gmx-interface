/**
 * Quick Chart Testing Functions
 * 
 * Add these to browser console for immediate debugging:
 * 
 * testCurrentChart() - Test the currently visible chart
 * testAllCharts() - Test all charts on the page
 * checkDataFlow() - Check the complete data flow
 */

import { predictionMarketDataService } from '../lib/predictionMarketDataService';
import { predictionMarketCache } from '../lib/predictionMarketCache';

// Make functions available globally for console access
(window as any).testCurrentChart = () => {
  console.log('🔍 Testing Current Chart Data Flow');
  console.log('='.repeat(50));
  
  // Try to get current chart data from DOM
  const chartElements = document.querySelectorAll('[data-testid="prediction-chart"], .prediction-market-chart');
  console.log(`Found ${chartElements.length} chart elements`);
  
  // Check if PredictionDataContext is available
  const contextData = (window as any).predictionData || {};
  console.log('Context data available:', Object.keys(contextData));
  
  // Check cache status
  const cacheStats = predictionMarketDataService.getCacheStats();
  console.log('Cache stats:', cacheStats);
  
  // Check all cached markets
  const cachedMarkets = predictionMarketDataService.getCachedMarkets();
  console.log(`Cached markets: ${cachedMarkets.length}`);
  
  cachedMarkets.forEach((market, index) => {
    const questionId = market._id || market.questionId;
    const historicalPrices = predictionMarketDataService.getHistoricalPrices(questionId);
    console.log(`Market ${index + 1}: ${market.displayName || market.question}`);
    console.log(`  ID: ${questionId}`);
    console.log(`  Historical points: ${historicalPrices?.length || 0}`);
    if (historicalPrices && historicalPrices.length > 0) {
      console.log(`  Price range: ${Math.min(...historicalPrices.map(p => p.price)).toFixed(3)} - ${Math.max(...historicalPrices.map(p => p.price)).toFixed(3)}`);
    }
  });
};

(window as any).testAllCharts = () => {
  console.log('🎯 Testing All Chart Data');
  console.log('='.repeat(50));
  
  // Get all markets from cache
  const markets = predictionMarketDataService.getCachedMarkets();
  
  if (markets.length === 0) {
    console.log('❌ No markets found in cache!');
    console.log('💡 This suggests PredictionDataContext hasn\'t loaded data yet.');
    return;
  }
  
  console.log(`Testing ${markets.length} markets...`);
  
  const results = {
    total: markets.length,
    withHistoricalData: 0,
    withoutHistoricalData: 0,
    issues: [] as string[]
  };
  
  markets.forEach((market, index) => {
    const questionId = market._id || market.questionId;
    const marketName = market.displayName || market.question || 'Unknown';
    
    console.log(`\n📊 Market ${index + 1}: ${marketName}`);
    console.log(`   ID: ${questionId}`);
    
    try {
      const historicalPrices = predictionMarketDataService.getHistoricalPrices(questionId);
      
      if (historicalPrices && historicalPrices.length > 0) {
        results.withHistoricalData++;
        const prices = historicalPrices.map(p => p.price);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const firstTimestamp = Math.min(...historicalPrices.map(p => p.timestamp));
        const lastTimestamp = Math.max(...historicalPrices.map(p => p.timestamp));
        
        console.log(`   ✅ Historical data: ${historicalPrices.length} points`);
        console.log(`   📈 Price range: ${minPrice.toFixed(3)} - ${maxPrice.toFixed(3)}`);
        console.log(`   📅 Time range: ${new Date(firstTimestamp * 1000).toLocaleDateString()} - ${new Date(lastTimestamp * 1000).toLocaleDateString()}`);
        
        // Check for data quality issues
        if (minPrice === maxPrice) {
          results.issues.push(`${marketName}: Flat price data (${minPrice.toFixed(3)})`);
        }
        if (historicalPrices.length < 5) {
          results.issues.push(`${marketName}: Very few data points (${historicalPrices.length})`);
        }
      } else {
        results.withoutHistoricalData++;
        console.log(`   ❌ No historical data - should show 50% fallback`);
        results.issues.push(`${marketName}: No historical data available`);
      }
    } catch (error) {
      console.log(`   💥 Error loading data: ${error}`);
      results.issues.push(`${marketName}: Error loading data - ${error}`);
    }
  });
  
  console.log('\n📊 SUMMARY');
  console.log('='.repeat(30));
  console.log(`Total markets: ${results.total}`);
  console.log(`With historical data: ${results.withHistoricalData} (${Math.round(results.withHistoricalData/results.total*100)}%)`);
  console.log(`Without historical data: ${results.withoutHistoricalData} (${Math.round(results.withoutHistoricalData/results.total*100)}%)`);
  console.log(`Issues found: ${results.issues.length}`);
  
  if (results.issues.length > 0) {
    console.log('\n❌ ISSUES:');
    results.issues.forEach((issue, index) => {
      console.log(`${index + 1}. ${issue}`);
    });
  }
  
  return results;
};

(window as any).checkDataFlow = () => {
  console.log('🔄 Checking Complete Data Flow');
  console.log('='.repeat(50));
  
  // 1. Check if context is loaded
  console.log('1️⃣ Checking PredictionDataContext...');
  const hasContext = !!(window as any).predictionContext;
  console.log(`   Context available: ${hasContext ? '✅' : '❌'}`);
  
  // 2. Check cache status
  console.log('2️⃣ Checking data cache...');
  const cacheStats = predictionMarketDataService.getCacheStats();
  console.log(`   Cache stats:`, cacheStats);
  
  // 3. Check API connectivity
  console.log('3️⃣ Checking API connectivity...');
  predictionMarketDataService.healthCheck().then(isHealthy => {
    console.log(`   API healthy: ${isHealthy ? '✅' : '❌'}`);
  });
  
  // 4. Check current page data
  console.log('4️⃣ Checking current page data...');
  const currentUrl = window.location.pathname;
  console.log(`   Current URL: ${currentUrl}`);
  
  if (currentUrl.includes('/predictions/')) {
    const umbrellaId = currentUrl.split('/predictions/')[1];
    console.log(`   Umbrella ID: ${umbrellaId}`);
    
    // Try to find markets for this umbrella
    const allMarkets = predictionMarketDataService.getCachedMarkets();
    console.log(`   Total cached markets: ${allMarkets.length}`);
    
    // Check chart elements
    const charts = document.querySelectorAll('.prediction-market-chart, [data-testid="prediction-chart"]');
    console.log(`   Chart elements found: ${charts.length}`);
    
    // Check if recharts is rendering
    const rechartElements = document.querySelectorAll('.recharts-wrapper');
    console.log(`   Recharts elements: ${rechartElements.length}`);
    
    if (rechartElements.length === 0) {
      console.log('   ⚠️ No Recharts elements found - charts may not be rendering');
    }
  }
  
  // 5. Performance check
  console.log('5️⃣ Performance check...');
  const start = performance.now();
  predictionMarketDataService.getCachedMarkets();
  const end = performance.now();
  console.log(`   Cache access time: ${(end - start).toFixed(2)}ms`);
  
  console.log('\n✅ Data flow check complete!');
};

// Also add a function to simulate chart data processing
(window as any).simulateChartProcessing = (questionId: string) => {
  console.log(`🔄 Simulating chart processing for: ${questionId}`);
  
  const historicalPrices = predictionMarketDataService.getHistoricalPrices(questionId);
  console.log(`Historical prices: ${historicalPrices?.length || 0} points`);
  
  if (!historicalPrices || historicalPrices.length === 0) {
    console.log('❌ No historical data - chart would show fallback');
    console.log('💡 Expected behavior: Show 50% line from 1 hour ago to now');
    
    const now = Math.floor(Date.now() / 1000);
    const oneHourAgo = now - 3600;
    const fallbackData = [
      { timestamp: oneHourAgo, price: 0.5, percentage: 50, isFallback: true },
      { timestamp: now, price: 0.5, percentage: 50, isFallback: true }
    ];
    
    console.log('Fallback data would be:', fallbackData);
    return fallbackData;
  } else {
    console.log('✅ Historical data available');
    const processedData = historicalPrices.map(p => ({
      timestamp: p.timestamp,
      price: p.price,
      percentage: p.price * 100,
      isHistorical: true
    }));
    
    console.log(`Processed data: ${processedData.length} points`);
    console.log('Sample data:', processedData.slice(0, 3));
    return processedData;
  }
};

// Add cache debugging function
(window as any).debugCache = () => {
  console.log('🔍 CACHE DEBUGGING');
  console.log('='.repeat(50));
  predictionMarketCache.debugCache();
  console.log('\n📊 Cache Stats:', predictionMarketCache.getStats());
};

console.log('🛠️ Chart testing functions loaded!');
console.log('Available functions:');
console.log('  - testCurrentChart()');
console.log('  - testAllCharts()');
console.log('  - checkDataFlow()');
console.log('  - simulateChartProcessing(questionId)');
console.log('  - debugCache() ← NEW: Debug cache contents');
