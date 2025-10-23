# Prediction Market Trading Box - Automated Test Page

## Overview

This test page provides comprehensive automated testing for your prediction market trading box. It runs real trades through your actual trading box code to ensure everything works as expected.

## Features

✅ **Reuses Production Code** - Uses the exact same trading logic as your production trading box
✅ **Automated Execution** - Automatically runs through all test scenarios
✅ **Expected vs Actual** - Calculates expected outcomes based on orderbook and compares with actual results
✅ **Balance Tracking** - Monitors USDC and token balances before/after each trade
✅ **Detailed Logging** - Comprehensive logs for debugging
✅ **Multiple Test Modes** - Essential, Market-only, or All orders

## How to Access

1. Navigate to any prediction market (e.g., `/predictions/umbrella/{umbrellaId}`)
2. Add `/test/tradebox/{umbrellaId}` to the URL
   - Example: `http://localhost:3000/test/tradebox/your-umbrella-id`

## Test Page Layout

### Left Panel: Trading Box
- **Live Trading Box** - Copy of your production trading box
- **Market Info** - Current market details
- **Current Balances** - Real-time USDC, YES, and NO token balances

### Right Panel: Test Controls & Results
- **Test Controls** - Start/stop tests, select scenario sets
- **Test Summary** - Pass/fail statistics
- **Current Test** - Shows which test is currently running
- **Test Logs** - Real-time logging of all test activities
- **Test Results** - Detailed results for each test with expected vs actual comparisons

## Test Scenario Sets

### Essential (6 tests)
Quick smoke test covering basic functionality:
- Market Buy YES/NO
- Market Sell YES/NO  
- Limit Buy YES
- Limit Sell YES

### Market Orders Only (10 tests)
Comprehensive market order testing:
- Market Buy YES/NO at $5, $10, $25
- Market Sell YES/NO at 10, 25 shares

### All Orders (40+ tests)
Complete test suite including:
- Market Buy/Sell for YES/NO at multiple dollar amounts
- Limit Buy/Sell for YES/NO at various price levels
- Partial fills
- Full fills

## How Tests Work

1. **Snapshot Orderbook** - Captures current orderbook state
2. **Calculate Expected Outcome** - Uses orderbook to predict trade results
3. **Get Initial Balances** - Records USDC, YES, NO token balances
4. **Execute Trade** - Runs actual trade through production code
5. **Wait for Settlement** - 15 second delay for blockchain confirmation
6. **Get Final Balances** - Records balances after trade
7. **Compare Results** - Checks if actual matches expected (within 1% tolerance)
8. **Log Results** - Displays pass/fail with detailed comparison

## Test Result Details

Each test result shows:
- ✅/❌ Pass/Fail indicator
- Duration of test execution
- Expected vs Actual comparison:
  - Contracts received/sold
  - USD spent/received
  - Average price
- Balance changes (before/after)
- Error messages (if failed)
- Expandable details with full JSON data

## Prerequisites

⚠️ **IMPORTANT**: Before running tests:

1. **Connect Wallet** - Must be logged in via Privy
2. **Have Test Funds** - Ensure you have:
   - USDC for buy orders (recommended: $100+)
   - YES/NO tokens for sell orders (recommended: 50+ each)
3. **Active Market** - Market must have liquidity in the orderbook
4. **Stable Network** - Good internet connection for blockchain transactions

## Running Tests

1. Select test scenario set (Essential/Market/All)
2. Verify you have sufficient balances
3. Click "🚀 Start Test Run"
4. Wait for tests to complete (each test takes ~15-20 seconds)
5. Review results in the logs and results panel

## Understanding Results

### Success ✅
- Expected outcome matches actual (within 1% tolerance)
- Trade executed correctly
- Balances updated as expected

### Failure ❌
- Mismatch between expected and actual outcomes
- Trade execution error
- Balance discrepancies
- Check error messages and logs for details

## Debugging Failed Tests

If a test fails:

1. **Check Logs** - Review detailed logs for error messages
2. **Verify Balances** - Ensure sufficient USDC/tokens before test
3. **Check Orderbook** - Market may have changed between calculation and execution
4. **Review Expected vs Actual** - Compare values to identify discrepancy
5. **Expand Details** - View full JSON for both expected and actual results

## Common Issues

### "No wallet available"
- Ensure you're logged in via Privy
- Check that wallet is connected

### "Insufficient balance"
- Add USDC using the test USDC faucet
- Or reduce test amounts in scenarios

### "Market data not loaded"
- Refresh the page
- Verify the umbrella ID is correct

### "Trade execution failed"
- Check network connectivity
- Ensure market has sufficient liquidity
- Review error message in logs

## Code Architecture

### Key Files

- **`TradeBoxTest.tsx`** - Main test page component
- **`TradeBoxTestRunner.ts`** - Test orchestration and result comparison
- **`TradeBoxTestScenarios.ts`** - Test scenario generation
- **`ExpectedOutcomeCalculator.ts`** - Calculates expected trade outcomes
- **`AutomatedTradeExecutor.ts`** - Programmatic trade execution

### How It Reuses Production Code

The test page uses:
- `PredictionMarketTradeBox` - Actual production trading box (displayed on left)
- `MarketOrderHandler` - Same market order calculation logic
- `TradeExecutionService` - Same trade execution flow
- `predictionMarketService` - Same order creation and signing

This ensures that tests validate the **exact same code** that users interact with.

## Customizing Tests

You can modify test scenarios in `TradeBoxTestScenarios.ts`:

```typescript
// Example: Add custom dollar amounts for market buy tests
const dollarAmounts = [5, 10, 25, 50, 100]; // Edit these values

// Example: Add custom share amounts for market sell tests  
const shareAmounts = [10, 25, 50, 100]; // Edit these values
```

## Safety Notes

⚠️ **This runs REAL trades on the blockchain!**

- Tests use your actual wallet and funds
- All trades are executed on-chain
- Trades may incur gas fees
- Use on testnet or with small amounts
- Stop tests anytime if issues occur

## Best Practices

1. **Start with Essential** - Run small test set first
2. **Check One Test** - Manually verify one trade works before bulk testing
3. **Monitor Balances** - Watch balances throughout test run
4. **Review Logs** - Check logs for any warnings
5. **Test During Low Volatility** - Run when market is stable
6. **Keep Orderbook Stable** - Avoid running tests when others are trading heavily

## Troubleshooting

### Tests are slow
- Each test waits 15 seconds for blockchain settlement
- This is intentional to ensure accurate balance checks
- Can be adjusted in code if needed

### Tests pass locally but fail in production
- Check if orderbook has sufficient liquidity
- Verify network conditions are stable
- Ensure market parameters match

### Want to add new test scenarios
- Edit `TradeBoxTestScenarios.ts`
- Add new scenario configurations
- Regenerate scenarios in test page

## Future Enhancements

Possible improvements:
- [ ] Adjustable delay between tests
- [ ] Export test results to CSV
- [ ] Historical test result tracking
- [ ] Slack/email notifications on failure
- [ ] Integration with CI/CD pipeline
- [ ] Parallel test execution (with caution)
- [ ] Mock mode for testing without real trades

## Support

If you encounter issues:
1. Check console logs for detailed errors
2. Review this README for common issues
3. Verify your setup matches prerequisites
4. Test with single scenario first before bulk runs

---

**Happy Testing! 🚀**

