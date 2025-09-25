import React, { useState, useEffect } from 'react';
import { chartDataTester } from '../../utils/chartDataTester';
import './ChartDataDebugger.scss';

interface ChartDataDebuggerProps {
  umbrellaId: string;
  markets: any[];
  orderbooks: Record<string, any>;
  isVisible?: boolean;
}

interface TestResults {
  summary: {
    totalMarkets: number;
    marketsWithData: number;
    marketsWithIssues: number;
  };
  results: any[];
}

export const ChartDataDebugger: React.FC<ChartDataDebuggerProps> = ({
  umbrellaId,
  markets,
  orderbooks,
  isVisible = false
}) => {
  const [results, setResults] = useState<TestResults | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState<string | null>(null);
  const [showDebugger, setShowDebugger] = useState(isVisible);

  const runTests = async () => {
    setIsRunning(true);
    setResults(null);
    
    try {
      console.log('🚀 Starting chart data diagnosis...');
      chartDataTester.clear();
      
      const testResults = await chartDataTester.testAllMarketsInUmbrella(
        umbrellaId, 
        markets, 
        orderbooks
      );
      
      const exportedResults = chartDataTester.exportResults();
      setResults(exportedResults);
      
      console.log('✅ Chart data diagnosis complete!');
      console.log('Results available in window.testChartData');
    } catch (error) {
      console.error('❌ Error running chart data tests:', error);
    } finally {
      setIsRunning(false);
    }
  };

  const getMarketDetails = (questionId: string) => {
    if (!results) return null;
    return results.results.find(r => r.questionId === questionId);
  };

  const getStatusColor = (result: any) => {
    if (result.issues.length === 0) return '#4ade80'; // green
    if (result.issues.length <= 2) return '#fbbf24'; // yellow
    return '#f87171'; // red
  };

  const getStatusText = (result: any) => {
    if (result.issues.length === 0) return 'Healthy';
    if (result.issues.length <= 2) return 'Issues';
    return 'Critical';
  };

  if (!showDebugger) {
    return (
      <div className="chart-debugger-toggle">
        <button 
          onClick={() => setShowDebugger(true)}
          className="debug-toggle-btn"
          title="Open Chart Data Debugger"
        >
          🔍 Debug Charts
        </button>
      </div>
    );
  }

  return (
    <div className="chart-data-debugger">
      <div className="debugger-header">
        <h3>📊 Chart Data Debugger</h3>
        <div className="header-actions">
          <button 
            onClick={runTests} 
            disabled={isRunning}
            className="run-tests-btn"
          >
            {isRunning ? '🔄 Running...' : '🚀 Run Tests'}
          </button>
          <button 
            onClick={() => setShowDebugger(false)}
            className="close-btn"
          >
            ✕
          </button>
        </div>
      </div>

      {isRunning && (
        <div className="loading-indicator">
          <div className="spinner"></div>
          <p>Analyzing chart data... Check console for detailed logs.</p>
        </div>
      )}

      {results && (
        <div className="test-results">
          <div className="summary-section">
            <h4>📈 Summary</h4>
            <div className="summary-stats">
              <div className="stat">
                <span className="stat-label">Total Markets:</span>
                <span className="stat-value">{results.summary.totalMarkets}</span>
              </div>
              <div className="stat">
                <span className="stat-label">With Data:</span>
                <span className="stat-value success">{results.summary.marketsWithData}</span>
              </div>
              <div className="stat">
                <span className="stat-label">With Issues:</span>
                <span className="stat-value error">{results.summary.marketsWithIssues}</span>
              </div>
            </div>
          </div>

          <div className="markets-section">
            <h4>🎯 Market Analysis</h4>
            <div className="markets-list">
              {results.results.map((result: any) => (
                <div 
                  key={result.questionId} 
                  className={`market-item ${selectedMarket === result.questionId ? 'selected' : ''}`}
                  onClick={() => setSelectedMarket(
                    selectedMarket === result.questionId ? null : result.questionId
                  )}
                >
                  <div className="market-header">
                    <div className="market-info">
                      <span className="market-name">{result.marketName}</span>
                      <span className="market-id">{result.questionId.substring(0, 8)}...</span>
                    </div>
                    <div 
                      className="status-badge" 
                      style={{ backgroundColor: getStatusColor(result) }}
                    >
                      {getStatusText(result)}
                    </div>
                  </div>

                  {selectedMarket === result.questionId && (
                    <div className="market-details">
                      <div className="data-section">
                        <h5>📊 Expected Data</h5>
                        <ul>
                          <li>Historical Data: {result.expectedData.hasHistoricalData ? '✅' : '❌'} 
                            ({result.expectedData.historicalCount} points)</li>
                          <li>Price Range: {result.expectedData.firstHistoricalPrice?.toFixed(2) || 'N/A'} - {result.expectedData.lastHistoricalPrice?.toFixed(2) || 'N/A'}</li>
                          <li>Time Range: {result.expectedData.historicalTimeRange}</li>
                        </ul>
                      </div>

                      <div className="data-section">
                        <h5>📋 Orderbook Data</h5>
                        <ul>
                          <li>Has Orderbook: {result.orderbook.hasOrderbook ? '✅' : '❌'}</li>
                          <li>Best Ask: {result.orderbook.bestAsk?.toFixed(3) || 'N/A'}</li>
                          <li>Best Bid: {result.orderbook.bestBid?.toFixed(3) || 'N/A'}</li>
                          <li>Orders: {result.orderbook.asksCount} asks, {result.orderbook.bidsCount} bids</li>
                        </ul>
                      </div>

                      <div className="data-section">
                        <h5>🔄 Processed Data</h5>
                        <ul>
                          <li>Cache Hit: {result.actualData.cacheHit ? '✅' : '❌'}</li>
                          <li>Chart Points: {result.actualData.processedCount}</li>
                          {result.actualData.dataPoints.length > 0 && (
                            <>
                              <li>First Point: {result.actualData.dataPoints[0]?.percentage?.toFixed(1)}%</li>
                              <li>Last Point: {result.actualData.dataPoints[result.actualData.dataPoints.length - 1]?.percentage?.toFixed(1)}%</li>
                            </>
                          )}
                        </ul>
                      </div>

                      {result.issues.length > 0 && (
                        <div className="issues-section">
                          <h5>❌ Issues</h5>
                          <ul>
                            {result.issues.map((issue: string, index: number) => (
                              <li key={index} className="issue">{issue}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {result.recommendations.length > 0 && (
                        <div className="recommendations-section">
                          <h5>💡 Recommendations</h5>
                          <ul>
                            {result.recommendations.map((rec: string, index: number) => (
                              <li key={index} className="recommendation">{rec}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="actions-section">
            <button 
              onClick={() => {
                const data = JSON.stringify(results, null, 2);
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `chart-data-analysis-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="export-btn"
            >
              📄 Export Results
            </button>
            <button 
              onClick={() => {
                console.log('📊 Detailed Results:', results);
                alert('Results logged to console! Check the browser developer tools.');
              }}
              className="console-btn"
            >
              🖥️ Log to Console
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
