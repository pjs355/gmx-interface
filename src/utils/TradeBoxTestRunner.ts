import type { PredictionMarket } from "lib/predictionMarketDataService";
import type { OrderbookSnapshot } from "lib/orderbookService";
import type { TradeBoxState } from "components/PredictionMarketTradeBox/types";

export interface TestScenario {
  id: string;
  name: string;
  description: string;
  orderType: 'market' | 'limit';
  side: 'buy' | 'sell';
  position: 'yes' | 'no';
  amount: number; // For market buy: USD amount, for others: shares
  price?: number; // For limit orders (in cents 0-100)
  expectedOutcome: {
    contractsReceived?: number;
    usdSpent?: number;
    usdReceived?: number;
    avgPrice?: number;
    remainingUsd?: number;
  };
}

export interface TestResult {
  scenarioId: string;
  scenarioName: string;
  success: boolean;
  error?: string;
  startTime: number;
  endTime: number;
  duration: number;
  expected: TestScenario['expectedOutcome'];
  actual: {
    contractsReceived?: number;
    usdSpent?: number;
    usdReceived?: number;
    avgPrice?: number;
    remainingUsd?: number;
    balanceBefore: {
      usdc: number;
      yes: number;
      no: number;
    };
    balanceAfter: {
      usdc: number;
      yes: number;
      no: number;
    };
    orderbook: OrderbookSnapshot | null;
  };
  comparison: {
    contractsMatch: boolean;
    usdMatch: boolean;
    priceMatch: boolean;
    details: string[];
  };
}

export interface TestRunnerCallbacks {
  onTestStart: (scenario: TestScenario) => void;
  onTestComplete: (result: TestResult) => void;
  onTestError: (scenarioId: string, error: Error) => void;
  onAllTestsComplete: (results: TestResult[]) => void;
}

export class TradeBoxTestRunner {
  private scenarios: TestScenario[] = [];
  private results: TestResult[] = [];
  private callbacks: TestRunnerCallbacks;
  private market: PredictionMarket | null = null;
  private orderbook: OrderbookSnapshot | null = null;
  private isRunning: boolean = false;

  constructor(callbacks: TestRunnerCallbacks) {
    this.callbacks = callbacks;
  }

  setMarket(market: PredictionMarket) {
    this.market = market;
  }

  setOrderbook(orderbook: OrderbookSnapshot | null) {
    this.orderbook = orderbook;
  }

  setScenarios(scenarios: TestScenario[]) {
    this.scenarios = scenarios;
  }

  getResults(): TestResult[] {
    return this.results;
  }

  isTestRunning(): boolean {
    return this.isRunning;
  }

  async runAllTests(
    executeTrade: (scenario: TestScenario) => Promise<void>,
    getBalances: () => Promise<{ usdc: number; yes: number; no: number }>,
    delayBetweenTests: number = 45000 // Increased to 45 seconds for balance updates
  ) {
    if (this.isRunning) {
      throw new Error('Tests are already running');
    }

    if (!this.market || !this.orderbook) {
      throw new Error('Market and orderbook must be set before running tests');
    }

    this.isRunning = true;
    this.results = [];

    console.log(`🚀 Starting test run with ${this.scenarios.length} scenarios`);

    for (const scenario of this.scenarios) {
      try {
        console.log(`\n📋 Running test: ${scenario.name}`);
        this.callbacks.onTestStart(scenario);

        const startTime = Date.now();

        // Get balances before trade
        const balanceBefore = await getBalances();
        console.log('💰 Balances before:', balanceBefore);

        // Check if user has sufficient balance for sell orders
        if (scenario.side === 'sell') {
          const requiredShares = scenario.amount;
          const availableShares = scenario.position === 'yes' ? balanceBefore.yes : balanceBefore.no;
          
          if (availableShares < requiredShares) {
            console.warn(`⚠️ Insufficient ${scenario.position.toUpperCase()} tokens: need ${requiredShares}, have ${availableShares}`);
            throw new Error(`Insufficient ${scenario.position.toUpperCase()} tokens: need ${requiredShares}, have ${availableShares}. Skipping test.`);
          }
          console.log(`✅ Sufficient balance: ${availableShares} ${scenario.position.toUpperCase()} tokens available`);
        }

        // Execute the trade
        await executeTrade(scenario);

        // Poll for balance changes (check every 3 seconds, max 60 seconds)
        console.log(`⏳ Polling for balance changes (max 60 seconds, will stop early if test passes)...`);
        let balanceAfter = balanceBefore;
        let attempts = 0;
        const maxAttempts = 20; // 20 attempts * 3 seconds = 60 seconds
        let testPassed = false;
        
        while (attempts < maxAttempts && !testPassed) {
          await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
          attempts++;
          
          const currentBalance = await getBalances();
          console.log(`🔍 Balance check ${attempts}/${maxAttempts}:`, currentBalance);
          
          // Check if BOTH balances changed (test passed!)
          if (scenario.side === 'buy') {
            // For buy orders, check if we got tokens AND spent USDC
            const tokensReceived = scenario.position === 'yes' 
              ? currentBalance.yes - balanceBefore.yes 
              : currentBalance.no - balanceBefore.no;
            const usdcSpent = balanceBefore.usdc - currentBalance.usdc;
            
            // Test passes when BOTH conditions are met
            if (tokensReceived > 0 && usdcSpent > 0) {
              testPassed = true;
              balanceAfter = currentBalance;
              console.log(`✅ Test passed! Both balances updated after ${attempts * 3} seconds!`);
              console.log(`   Tokens received: ${tokensReceived}, USDC spent: ${usdcSpent}`);
            } else if (tokensReceived > 0 || usdcSpent > 0) {
              // Partial update detected, keep polling
              console.log(`⏳ Partial update: tokens=${tokensReceived}, usdc spent=${usdcSpent}. Continuing...`);
            }
          } else {
            // For sell orders, check if we sold tokens AND received USDC
            const tokensSold = scenario.position === 'yes'
              ? balanceBefore.yes - currentBalance.yes
              : balanceBefore.no - currentBalance.no;
            const usdcReceived = currentBalance.usdc - balanceBefore.usdc;
            
            // Test passes when BOTH conditions are met
            if (tokensSold > 0 && usdcReceived > 0) {
              testPassed = true;
              balanceAfter = currentBalance;
              console.log(`✅ Test passed! Both balances updated after ${attempts * 3} seconds!`);
              console.log(`   Tokens sold: ${tokensSold}, USDC received: ${usdcReceived}`);
            } else if (tokensSold > 0 || usdcReceived > 0) {
              // Partial update detected, keep polling
              console.log(`⏳ Partial update: tokens sold=${tokensSold}, usdc received=${usdcReceived}. Continuing...`);
            }
          }
        }
        
        if (!testPassed) {
          console.warn(`⚠️ Test did not fully pass after ${maxAttempts * 3} seconds`);
          balanceAfter = await getBalances(); // Get final balance anyway
        }
        
        console.log('💰 Balances after:', balanceAfter);

        const endTime = Date.now();

        // Calculate actual results
        const actual = this.calculateActualResults(
          scenario,
          balanceBefore,
          balanceAfter,
          this.orderbook
        );

        // Compare expected vs actual
        const comparison = this.compareResults(scenario.expectedOutcome, actual);

        const result: TestResult = {
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          success: comparison.contractsMatch && comparison.usdMatch,
          startTime,
          endTime,
          duration: endTime - startTime,
          expected: scenario.expectedOutcome,
          actual,
          comparison,
        };

        this.results.push(result);
        this.callbacks.onTestComplete(result);

        console.log(`✅ Test completed: ${scenario.name}`);
        console.log('📊 Result:', result);

      } catch (error: any) {
        console.error(`❌ Test failed: ${scenario.name}`, error);
        this.callbacks.onTestError(scenario.id, error);
        
        const result: TestResult = {
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          success: false,
          error: error.message,
          startTime: Date.now(),
          endTime: Date.now(),
          duration: 0,
          expected: scenario.expectedOutcome,
          actual: {
            balanceBefore: { usdc: 0, yes: 0, no: 0 },
            balanceAfter: { usdc: 0, yes: 0, no: 0 },
            orderbook: this.orderbook,
          },
          comparison: {
            contractsMatch: false,
            usdMatch: false,
            priceMatch: false,
            details: [error.message],
          },
        };
        
        this.results.push(result);
      }
    }

    this.isRunning = false;
    this.callbacks.onAllTestsComplete(this.results);
    console.log('🏁 All tests completed');
    console.log('📊 Final results:', this.results);
  }

  private calculateActualResults(
    scenario: TestScenario,
    balanceBefore: { usdc: number; yes: number; no: number },
    balanceAfter: { usdc: number; yes: number; no: number },
    orderbook: OrderbookSnapshot | null
  ) {
    const actual: TestResult['actual'] = {
      balanceBefore,
      balanceAfter,
      orderbook,
    };

    if (scenario.side === 'buy') {
      // Calculate contracts received
      const contractsReceived = scenario.position === 'yes'
        ? balanceAfter.yes - balanceBefore.yes
        : balanceAfter.no - balanceBefore.no;
      
      // Calculate USD spent
      const usdSpent = balanceBefore.usdc - balanceAfter.usdc;

      // Calculate average price
      const avgPrice = contractsReceived > 0 ? usdSpent / contractsReceived : 0;

      actual.contractsReceived = contractsReceived;
      actual.usdSpent = usdSpent;
      actual.avgPrice = avgPrice;

      if (scenario.orderType === 'market') {
        actual.remainingUsd = 0; // Should be 0 for completed trades
      }
    } else {
      // SELL orders
      const contractsSold = scenario.position === 'yes'
        ? balanceBefore.yes - balanceAfter.yes
        : balanceBefore.no - balanceAfter.no;
      
      // Calculate USD received
      const usdReceived = balanceAfter.usdc - balanceBefore.usdc;

      // Calculate average price
      const avgPrice = contractsSold > 0 ? usdReceived / contractsSold : 0;

      actual.contractsReceived = contractsSold; // Use same field for sold contracts
      actual.usdReceived = usdReceived;
      actual.avgPrice = avgPrice;
    }

    return actual;
  }

  private compareResults(
    expected: TestScenario['expectedOutcome'],
    actual: TestResult['actual']
  ): TestResult['comparison'] {
    const details: string[] = [];
    const tolerance = 0.01; // 1% tolerance for floating point comparison

    // Compare contracts
    let contractsMatch = true;
    if (expected.contractsReceived !== undefined && actual.contractsReceived !== undefined) {
      const diff = Math.abs(expected.contractsReceived - actual.contractsReceived);
      const pctDiff = expected.contractsReceived > 0 ? diff / expected.contractsReceived : 0;
      contractsMatch = pctDiff <= tolerance;
      
      details.push(
        `Contracts: Expected ${expected.contractsReceived}, Got ${actual.contractsReceived} (${contractsMatch ? '✅' : '❌'})`
      );
    }

    // Compare USD (spent or received)
    let usdMatch = true;
    if (expected.usdSpent !== undefined && actual.usdSpent !== undefined) {
      const diff = Math.abs(expected.usdSpent - actual.usdSpent);
      const pctDiff = expected.usdSpent > 0 ? diff / expected.usdSpent : 0;
      usdMatch = pctDiff <= tolerance;
      
      details.push(
        `USD Spent: Expected ${expected.usdSpent.toFixed(2)}, Got ${actual.usdSpent.toFixed(2)} (${usdMatch ? '✅' : '❌'})`
      );
    }

    if (expected.usdReceived !== undefined && actual.usdReceived !== undefined) {
      const diff = Math.abs(expected.usdReceived - actual.usdReceived);
      const pctDiff = expected.usdReceived > 0 ? diff / expected.usdReceived : 0;
      usdMatch = pctDiff <= tolerance;
      
      details.push(
        `USD Received: Expected ${expected.usdReceived.toFixed(2)}, Got ${actual.usdReceived.toFixed(2)} (${usdMatch ? '✅' : '❌'})`
      );
    }

    // Compare average price
    let priceMatch = true;
    if (expected.avgPrice !== undefined && actual.avgPrice !== undefined) {
      const diff = Math.abs(expected.avgPrice - actual.avgPrice);
      const pctDiff = expected.avgPrice > 0 ? diff / expected.avgPrice : 0;
      priceMatch = pctDiff <= tolerance;
      
      details.push(
        `Avg Price: Expected ${expected.avgPrice.toFixed(4)}, Got ${actual.avgPrice.toFixed(4)} (${priceMatch ? '✅' : '❌'})`
      );
    }

    return {
      contractsMatch,
      usdMatch,
      priceMatch,
      details,
    };
  }

  stopTests() {
    this.isRunning = false;
  }

  reset() {
    this.scenarios = [];
    this.results = [];
    this.isRunning = false;
  }
}

