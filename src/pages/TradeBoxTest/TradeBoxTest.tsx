import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usePrivy, useWallets as usePrivyWallets } from "@privy-io/react-auth";
import { useSignerContext } from "context/SignerContext";
import { useUserData } from "context/UserDataContext";
import { useBalances } from "context/BalanceContext";
import { usePredictionData } from "context/PredictionDataContext";
import { OrderbookService } from "@/services/api/orderbookService";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import PredictionMarketTradeBox, {
	type PredictionMarketTradeBoxHandle,
} from "@/pages/PredictionMarket/PredictionMarketTradeBox/PredictionMarketTradeBox";
import {
	TradeBoxTestRunner,
	type TestResult,
	type TestScenario,
} from "utils/TradeBoxTestRunner";
import { TradeBoxTestScenarios } from "utils/TradeBoxTestScenarios";
import { useTradeExecutionService } from "@/pages/PredictionMarket/PredictionMarketTradeBox/TradeExecutionService";
import { useMarketOrderHandler } from "@/pages/PredictionMarket/PredictionMarketTradeBox/MarketOrderHandler";
import { useYesNoBalances } from "@/pages/PredictionMarket/PredictionMarketTradeBox/checkBalances";
import type { TradeExecutionParams } from "@/pages/PredictionMarket/PredictionMarketTradeBox/types";
import "./TradeBoxTest.scss";

export default function TradeBoxTest() {
	const navigate = useNavigate();
	const { umbrellaId } = useParams<{ umbrellaId: string }>();
	const { authenticated, user } = usePrivy();
	const { account, ready, signer, signerAddress } = useSignerContext(); // Get signer and account from context like production
	const { wallets: privyWallets, ready: walletsReady } = usePrivyWallets(); // Same as production line 32
	const userData = useUserData();
	const balanceContext = useBalances();
	const predictionData = usePredictionData();

	// Get the trade execution service - signer is stable after login!
	const tradeExecutionService = useTradeExecutionService();

	// Safely destructure with fallbacks
	const { usdcBalance, getTokenBalance } = userData || {};
	const { getBalance, refreshBalances } = balanceContext || {};
	const { getQuestionsForUmbrella, umbrellas } = predictionData || {};

	const [market, setMarket] = useState<PredictionMarket | null>(null);
	const [orderbook, setOrderbook] = useState<OrderbookSnapshot | null>(null);

	// Function to refresh orderbook - CRITICAL for testing after trades
	const refreshOrderbook = useCallback(async () => {
		if (!market) return null;

		try {
			console.log("🔄 Refreshing orderbook...");
			const orderbookService = new OrderbookService();
			const orderBookId =
				market._id || market.questionId || (market as any).marketId;
			const ob = await orderbookService.fetchOrderbook(orderBookId);
			setOrderbook(ob);
			console.log("✅ Orderbook refreshed successfully");
			return ob;
		} catch (error) {
			console.error("❌ Failed to refresh orderbook:", error);
			return null;
		}
	}, [market]);

	// Use the WORKING hook that updates reactively!
	const { yesBalance: liveYesBalance, noBalance: liveNoBalance } =
		useYesNoBalances(market!);

	// Store in a ref so getCurrentBalances can ALWAYS access latest values (no closure issues!)
	const balancesRef = useRef({ yes: 0, no: 0, usdc: 0 });

	// Update ref whenever values change
	useEffect(() => {
		balancesRef.current = {
			yes: liveYesBalance,
			no: liveNoBalance,
			usdc: parseFloat(usdcBalance || "0"),
		};
		console.log("🔄 Balance ref updated:", balancesRef.current);
	}, [liveYesBalance, liveNoBalance, usdcBalance]);

	// Ref to control the PredictionMarketTradeBox programmatically
	const tradeBoxRef = useRef<PredictionMarketTradeBoxHandle>(null);

	// Must declare orderbook before using it in hooks
	const marketOrderHandlerInstance = useMarketOrderHandler(orderbook);

	const [testRunner] = useState(
		() =>
			new TradeBoxTestRunner({
				onTestStart: (scenario) => {
					console.log("🚀 Test started:", scenario.name);
					setCurrentTest(scenario);
					setTestLogs((prev) => [
						...prev,
						{
							timestamp: Date.now(),
							type: "info",
							message: `Starting: ${scenario.name}`,
						},
					]);
				},
				onTestComplete: (result) => {
					console.log("✅ Test completed:", result.scenarioName);
					setTestResults((prev) => [...prev, result]);
					setTestLogs((prev) => [
						...prev,
						{
							timestamp: Date.now(),
							type: result.success ? "success" : "error",
							message: `Completed: ${result.scenarioName} - ${
								result.success ? "PASSED ✅" : "FAILED ❌"
							}`,
						},
					]);
				},
				onTestError: (scenarioId, error) => {
					console.error("❌ Test error:", scenarioId, error);
					setTestLogs((prev) => [
						...prev,
						{
							timestamp: Date.now(),
							type: "error",
							message: `Error in ${scenarioId}: ${error.message}`,
						},
					]);
				},
				onAllTestsComplete: (results) => {
					console.log("🏁 All tests completed:", results);
					setIsRunning(false);
					setCurrentTest(null);
					const passed = results.filter((r) => r.success).length;
					const total = results.length;
					setTestLogs((prev) => [
						...prev,
						{
							timestamp: Date.now(),
							type: "info",
							message: `All tests completed: ${passed}/${total} passed`,
						},
					]);
				},
			})
	);

	const [scenarios, setScenarios] = useState<TestScenario[]>([]);
	const [testResults, setTestResults] = useState<TestResult[]>([]);
	const [testLogs, setTestLogs] = useState<
		Array<{
			timestamp: number;
			type: "info" | "success" | "error";
			message: string;
		}>
	>([]);
	const [isRunning, setIsRunning] = useState(false);
	const [currentTest, setCurrentTest] = useState<TestScenario | null>(null);
	const [selectedPosition, setSelectedPosition] = useState<"yes" | "no">(
		"yes"
	);
	const [selectedScenarioType, setSelectedScenarioType] = useState<
		"essential" | "all" | "market-only"
	>("essential");

	// CRITICAL: Set up continuous 10-second orderbook refresh
	useEffect(() => {
		if (!market) return;

		console.log("📊 Starting 10-second orderbook refresh interval...");

		const intervalId = setInterval(async () => {
			try {
				console.log("🔄 [Auto-refresh] Refreshing orderbook...");
				const newOrderbook = await refreshOrderbook();
				if (newOrderbook) {
					// Update testRunner with new orderbook
					testRunner.setOrderbook(newOrderbook);
					console.log("✅ [Auto-refresh] Orderbook updated");
				}
			} catch (error) {
				console.warn(
					"⚠️ [Auto-refresh] Failed to refresh orderbook:",
					error
				);
			}
		}, 10000); // Every 10 seconds

		return () => {
			console.log("🛑 Stopping orderbook refresh interval");
			clearInterval(intervalId);
		};
	}, [market, refreshOrderbook, testRunner]);

	// Load market and orderbook
	useEffect(() => {
		if (!umbrellaId || !getQuestionsForUmbrella) return;

		const loadMarketData = async () => {
			try {
				const questions = getQuestionsForUmbrella(umbrellaId);
				if (questions && questions.length > 0) {
					const firstMarket = questions[0] as PredictionMarket;
					setMarket(firstMarket);

					// Load orderbook - use same field priority as other pages
					const orderbookService = new OrderbookService();
					const orderBookId =
						firstMarket._id ||
						firstMarket.questionId ||
						firstMarket.marketId;
					console.log(
						"🔍 Fetching orderbook with ID:",
						orderBookId,
						"from market:",
						firstMarket
					);
					const ob = await orderbookService.fetchOrderbook(
						orderBookId
					);
					setOrderbook(ob);
					console.log("✅ Orderbook loaded successfully");

					// Generate test scenarios
					if (ob) {
						let generatedScenarios: TestScenario[] = [];
						if (selectedScenarioType === "essential") {
							generatedScenarios =
								TradeBoxTestScenarios.generateEssentialScenarios(
									ob
								);
						} else if (selectedScenarioType === "all") {
							generatedScenarios =
								TradeBoxTestScenarios.generateAllScenarios(ob);
						} else {
							// Market only
							generatedScenarios =
								TradeBoxTestScenarios.generateCustomScenarios(
									{
										includeMarketBuy: true,
										includeMarketSell: true,
										positions: ["yes", "no"],
										dollarAmounts: [5, 10, 25],
										shareAmounts: [10, 25],
									},
									ob
								);
						}
						setScenarios(generatedScenarios);
						testRunner.setScenarios(generatedScenarios);
						testRunner.setMarket(firstMarket);
						testRunner.setOrderbook(ob);
					}
				}
			} catch (error) {
				console.error("Error loading market data:", error);
				setTestLogs((prev) => [
					...prev,
					{
						timestamp: Date.now(),
						type: "error",
						message: `Failed to load market: ${error}`,
					},
				]);
			}
		};

		loadMarketData();
	}, [umbrellaId, getQuestionsForUmbrella, selectedScenarioType, testRunner]);

	// Get current balances - read from ref (ALWAYS has latest values!)
	const getCurrentBalances = async () => {
		// Read from ref - this ALWAYS has the latest values, no closure issues!
		const { yes, no, usdc } = balancesRef.current;

		console.log("💰 LIVE balances from ref:", {
			usdc,
			yes,
			no,
			timestamp: Date.now(),
		});

		return { usdc, yes, no };
	};

	// Execute a single trade scenario - NOT useCallback so it uses latest tradeExecutionServiceRef!
	const executeTradeScenario = async (scenario: TestScenario) => {
		if (!tradeBoxRef.current) {
			throw new Error("Trade box ref not available");
		}

		console.log(
			"🎯 Executing trade scenario via TradeBox component:",
			scenario
		);

		try {
			// CRITICAL: Update parent state first so initialPosition prop syncs
			// The component has a useEffect that syncs state with initialPosition prop
			setSelectedPosition(scenario.position);
			console.log("✅ Updated parent position state:", scenario.position);

			// Set the position (yes/no) - this will now match the prop
			tradeBoxRef.current.setPosition(scenario.position);
			console.log("✅ Set position:", scenario.position);

			// Set the side (buy/sell)
			tradeBoxRef.current.setSide(scenario.side);
			console.log("✅ Set side:", scenario.side);

			// Set the order type (market/limit)
			tradeBoxRef.current.setOrderType(scenario.orderType);
			console.log("✅ Set order type:", scenario.orderType);

			// Set the amount
			tradeBoxRef.current.setAmount(scenario.amount.toString());
			console.log("✅ Set amount:", scenario.amount);

			// Set the price if it's a limit order
			if (scenario.orderType === "limit" && scenario.price) {
				tradeBoxRef.current.setPrice(scenario.price.toString());
				console.log("✅ Set price:", scenario.price);
			}

			// Wait for React to update state AND for component to be fully ready
			// This gives SignerContext time to propagate to the component's hooks
			await new Promise((resolve) => setTimeout(resolve, 1000));

			// CRITICAL: Verify the component state matches what we set
			let verifyAttempts = 0;
			let stateCorrect = false;
			while (verifyAttempts < 10 && !stateCorrect) {
				const currentState = tradeBoxRef.current.getState();
				console.log(
					`🔍 Verifying component state (attempt ${
						verifyAttempts + 1
					}):`,
					{
						expectedPosition: scenario.position,
						actualPosition: currentState.selectedPosition,
						positionMatch:
							currentState.selectedPosition === scenario.position,
						expectedSide: scenario.side,
						actualSide: currentState.side,
						sideMatch: currentState.side === scenario.side,
						expectedType: scenario.orderType,
						actualType: currentState.orderType,
						typeMatch:
							currentState.orderType === scenario.orderType,
						expectedAmount: scenario.amount.toString(),
						actualAmount: currentState.amount,
						amountMatch:
							currentState.amount === scenario.amount.toString(),
					}
				);

				if (
					currentState.selectedPosition === scenario.position &&
					currentState.side === scenario.side &&
					currentState.orderType === scenario.orderType &&
					currentState.amount === scenario.amount.toString()
				) {
					stateCorrect = true;
					console.log("✅ Component state verified!");
				} else {
					console.log(
						"⏳ Component state NOT matching. Differences:",
						{
							positionOff:
								currentState.selectedPosition !==
								scenario.position,
							sideOff: currentState.side !== scenario.side,
							typeOff:
								currentState.orderType !== scenario.orderType,
							amountOff:
								currentState.amount !==
								scenario.amount.toString(),
						}
					);
					await new Promise((resolve) => setTimeout(resolve, 500));
					verifyAttempts++;
				}
			}

			if (!stateCorrect) {
				const finalState = tradeBoxRef.current.getState();
				console.error("❌ FINAL STATE MISMATCH:", finalState);
				throw new Error(
					`Component state did not match after 5 seconds. Expected position=${scenario.position} but got ${finalState.selectedPosition}`
				);
			}

			// Log the final state before execution
			const currentState = tradeBoxRef.current.getState();
			console.log("📤 TradeBox state before execution:", currentState);

			// Execute the trade through the component
			await tradeBoxRef.current.executeTrade();
			console.log("✅ Trade executed successfully through component");
		} catch (error: any) {
			console.error("❌ Trade execution error:", error);
			throw new Error(error.message || "Trade execution failed");
		}
	};

	// Start test run
	const startTestRun = useCallback(async () => {
		// Match production button logic - only check authenticated and account
		if (!authenticated) {
			alert("Please log in with Privy first");
			return;
		}

		if (!account) {
			alert("Loading wallet... Please wait.");
			return;
		}

		// CRITICAL: Wait for signer to be available
		if (!signer || !signerAddress) {
			alert("Signer not ready yet. Please wait a moment and try again.");
			return;
		}

		if (!market || !orderbook || scenarios.length === 0) {
			alert("Market, orderbook, or scenarios not loaded");
			return;
		}

		// CRITICAL: Wait 3 seconds for balance data to load
		console.log("⏳ Waiting 3 seconds for all balance data to load...");
		await new Promise((resolve) => setTimeout(resolve, 3000));

		console.log("✅ Balances loaded:", balancesRef.current);
		console.log(
			"✅ Starting balance snapshot:",
			await getCurrentBalances()
		);
		console.log(
			"✅ All checks passed. Starting tests with signer:",
			signerAddress
		);

		setIsRunning(true);
		setTestResults([]);
		setTestLogs([
			{
				timestamp: Date.now(),
				type: "info",
				message: `Starting test run with ${scenarios.length} scenarios`,
			},
		]);

		// CRITICAL: Wait 2 seconds for the TradeBox component to fully initialize
		// This ensures useTradeExecutionService has captured the signer values
		console.log(
			"⏳ Waiting 2 seconds for component to fully initialize..."
		);
		await new Promise((resolve) => setTimeout(resolve, 2000));

		try {
			await testRunner.runAllTests(
				executeTradeScenario,
				getCurrentBalances,
				45000 // 45 second delay between tests for balance updates
			);
		} catch (error: any) {
			console.error("Test run failed:", error);
			setTestLogs((prev) => [
				...prev,
				{
					timestamp: Date.now(),
					type: "error",
					message: `Test run failed: ${error.message}`,
				},
			]);
			setIsRunning(false);
		}
	}, [
		authenticated,
		ready,
		signer,
		signerAddress,
		market,
		orderbook,
		scenarios,
		account,
		testRunner,
		executeTradeScenario,
		getCurrentBalances,
	]);

	// Calculate test summary
	const testSummary = useMemo(() => {
		const total = testResults.length;
		const passed = testResults.filter((r) => r.success).length;
		const failed = total - passed;
		const avgDuration =
			total > 0
				? testResults.reduce((sum, r) => sum + r.duration, 0) / total
				: 0;

		return { total, passed, failed, avgDuration };
	}, [testResults]);

	// Debug Privy state - only log on mount, not during test execution
	useEffect(() => {
		if (!isRunning) {
			console.log("🔍 TradeBoxTest - Privy Status:", {
				authenticated,
				ready,
				walletsReady,
				account,
				hasSigner: !!signer,
				signerAddress,
				walletsCount: privyWallets?.length || 0,
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [authenticated, ready, account]);

	// Simple validation like other pages do
	if (!umbrellaId) {
		return (
			<div className="trade-box-test">
				<div className="test-header">
					<h1>Trade Box Test Page</h1>
					<p className="error">No market ID provided.</p>
					<button onClick={() => navigate("/predictions")}>
						Go to Predictions
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="trade-box-test">
			<div className="test-header">
				<h1>Trade Box Test Runner</h1>
				<p className="subtitle">
					Automated testing for prediction market trading box
				</p>
				<button
					className="btn-back"
					onClick={() =>
						navigate(`/predictions/umbrella/${umbrellaId}`)
					}
				>
					← Back to Market
				</button>
			</div>

			<div className="test-content">
				{/* Left Panel: Trade Box */}
				<div className="test-panel trade-box-panel">
					<h2>Trading Box (Copy of Production)</h2>
					{market && (
						<div className="market-info">
							<h3>{market.question}</h3>
							<p className="market-id">
								Market ID: {market.marketId}
							</p>
						</div>
					)}

					{market && orderbook ? (
						<PredictionMarketTradeBox
							ref={tradeBoxRef}
							market={market}
							orderbook={orderbook}
							initialPosition={selectedPosition}
							onPositionChange={setSelectedPosition}
						/>
					) : (
						<div className="loading">Loading market...</div>
					)}

					{/* Current Balances */}
					<div className="current-balances">
						<h3>Current Balances</h3>
						<div className="balance-row">
							<span>USDC:</span>
							<span className="balance-value">
								${parseFloat(usdcBalance || "0").toFixed(2)}
							</span>
						</div>
						{market &&
							getTokenBalance &&
							(() => {
								// Use same method as production trade box - getTokenBalance with market ID
								const marketId =
									market._id ||
									market.questionId ||
									market.marketId;
								const tokenBalance = marketId
									? getTokenBalance(marketId)
									: null;
								const yesNum = tokenBalance
									? Number(tokenBalance.yesBalance)
									: 0;
								const noNum = tokenBalance
									? Number(tokenBalance.noBalance)
									: 0;

								return (
									<>
										<div className="balance-row">
											<span>YES Tokens:</span>
											<span className="balance-value">
												{yesNum.toFixed(2)}
											</span>
										</div>
										<div className="balance-row">
											<span>NO Tokens:</span>
											<span className="balance-value">
												{noNum.toFixed(2)}
											</span>
										</div>
									</>
								);
							})()}
					</div>
				</div>

				{/* Right Panel: Test Controls & Results */}
				<div className="test-panel results-panel">
					{/* Test Controls */}
					<div className="test-controls">
						<h2>Test Controls</h2>

						<div className="control-group">
							<label>Test Scenario Set:</label>
							<select
								value={selectedScenarioType}
								onChange={(e) =>
									setSelectedScenarioType(
										e.target.value as any
									)
								}
								disabled={isRunning}
							>
								<option value="essential">
									Essential (6 tests)
								</option>
								<option value="market-only">
									Market Orders Only (10 tests)
								</option>
								<option value="all">
									All Orders (40+ tests)
								</option>
							</select>
						</div>

						<div className="control-group">
							<p className="scenario-count">
								{scenarios.length} scenarios loaded
							</p>
						</div>

						<button
							className={`btn-start-tests ${
								isRunning ? "disabled" : ""
							}`}
							onClick={startTestRun}
							disabled={
								isRunning ||
								!authenticated ||
								!account ||
								!market ||
								!orderbook
							}
						>
							{isRunning
								? "🔄 Running Tests..."
								: "🚀 Start Test Run"}
						</button>

						{!authenticated && (
							<p className="warning">
								Please log in with Privy to run tests
							</p>
						)}
						{authenticated && !account && (
							<p className="warning">Loading wallet...</p>
						)}
					</div>

					{/* Test Summary */}
					{testResults.length > 0 && (
						<div className="test-summary">
							<h2>Test Summary</h2>
							<div className="summary-stats">
								<div className="stat">
									<span className="stat-label">Total:</span>
									<span className="stat-value">
										{testSummary.total}
									</span>
								</div>
								<div className="stat success">
									<span className="stat-label">Passed:</span>
									<span className="stat-value">
										{testSummary.passed}
									</span>
								</div>
								<div className="stat error">
									<span className="stat-label">Failed:</span>
									<span className="stat-value">
										{testSummary.failed}
									</span>
								</div>
								<div className="stat">
									<span className="stat-label">
										Avg Duration:
									</span>
									<span className="stat-value">
										{(
											testSummary.avgDuration / 1000
										).toFixed(1)}
										s
									</span>
								</div>
							</div>
						</div>
					)}

					{/* Current Test */}
					{currentTest && (
						<div className="current-test">
							<h3>Currently Running</h3>
							<p className="test-name">{currentTest.name}</p>
							<p className="test-description">
								{currentTest.description}
							</p>
							<div className="spinner"></div>
						</div>
					)}

					{/* Test Logs */}
					<div className="test-logs">
						<h3>Test Logs</h3>
						<div className="logs-container">
							{testLogs.map((log, index) => (
								<div
									key={index}
									className={`log-entry ${log.type}`}
								>
									<span className="log-time">
										{new Date(
											log.timestamp
										).toLocaleTimeString()}
									</span>
									<span className="log-message">
										{log.message}
									</span>
								</div>
							))}
						</div>
					</div>

					{/* Test Results */}
					{testResults.length > 0 && (
						<div className="test-results">
							<h3>Test Results</h3>
							<div className="results-container">
								{testResults.map((result, index) => (
									<div
										key={index}
										className={`result-card ${
											result.success ? "success" : "error"
										}`}
									>
										<div className="result-header">
											<span className="result-icon">
												{result.success ? "✅" : "❌"}
											</span>
											<span className="result-name">
												{result.scenarioName}
											</span>
											<span className="result-duration">
												{(
													result.duration / 1000
												).toFixed(1)}
												s
											</span>
										</div>

										{result.error && (
											<div className="result-error">
												<strong>Error:</strong>{" "}
												{result.error}
											</div>
										)}

										<div className="result-comparison">
											{result.comparison.details.map(
												(detail, i) => (
													<div
														key={i}
														className="comparison-detail"
													>
														{detail}
													</div>
												)
											)}
										</div>

										<details className="result-details">
											<summary>View Details</summary>
											<div className="details-content">
												<div className="detail-section">
													<h4>Expected</h4>
													<pre>
														{JSON.stringify(
															result.expected,
															null,
															2
														)}
													</pre>
												</div>
												<div className="detail-section">
													<h4>Actual</h4>
													<pre>
														{JSON.stringify(
															{
																contractsReceived:
																	result
																		.actual
																		.contractsReceived,
																usdSpent:
																	result
																		.actual
																		.usdSpent,
																usdReceived:
																	result
																		.actual
																		.usdReceived,
																avgPrice:
																	result
																		.actual
																		.avgPrice,
															},
															null,
															2
														)}
													</pre>
												</div>
												<div className="detail-section">
													<h4>Balances</h4>
													<p>
														Before:{" "}
														{JSON.stringify(
															result.actual
																.balanceBefore
														)}
													</p>
													<p>
														After:{" "}
														{JSON.stringify(
															result.actual
																.balanceAfter
														)}
													</p>
												</div>
											</div>
										</details>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
