import React, { useState } from "react";
import type { TradeResult } from "./TradeExecutor";

interface TradeResultsLogProps {
	results: TradeResult[];
}

export function TradeResultsLog({ results }: TradeResultsLogProps) {
	const [expandedId, setExpandedId] = useState<string | null>(null);

	if (results.length === 0) {
		return (
			<div className="trade-results-log">
				<p style={{ color: "#9ca3af" }}>No trades executed yet</p>
			</div>
		);
	}

	return (
		<div className="trade-results-log">
			<table className="results-table">
				<thead>
					<tr>
						<th>#</th>
						<th>Time</th>
						<th>Type</th>
						<th>Side</th>
						<th>Position</th>
						<th>Amount</th>
						<th>Price</th>
						<th>Exp. Fee</th>
						<th>Act. Fee</th>
						<th>Status</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{results.map((result, index) => (
						<React.Fragment key={result.id || index}>
							<tr className={result.success ? "success-row" : "error-row"}>
								<td>{index + 1}</td>
								<td className="timestamp">
									{result.timestamp?.toLocaleTimeString?.() || "N/A"}
								</td>
								<td>
									<span className={`badge ${result.tradeType || "unknown"}`}>
										{(result.tradeType || "unknown").toUpperCase()}
									</span>
								</td>
								<td>
									<span className={`badge ${result.side || "unknown"}`}>
										{(result.side || "unknown").toUpperCase()}
									</span>
								</td>
								<td>
									<span className={`badge position-${result.position || "unknown"}`}>
										{(result.position || "unknown").toUpperCase()}
									</span>
								</td>
								<td>${result.amount.toFixed(2)}</td>
								<td>${result.price.toFixed(2)}</td>
								<td>${result.expectedFee.toFixed(2)}</td>
								<td>
									{result.actualFee !== null
										? `$${result.actualFee.toFixed(2)}`
										: "—"}
								</td>
								<td>
									{result.success ? (
										<span className="status-success">✅</span>
									) : (
										<span className="status-error">❌</span>
									)}
								</td>
								<td>
									<button
										className="expand-btn"
										onClick={() =>
											setExpandedId(
												expandedId === result.id ? null : result.id
											)
										}
									>
										{expandedId === result.id ? "▼" : "▶"}
									</button>
								</td>
							</tr>
							{expandedId === result.id && (
								<tr className="expanded-row">
									<td colSpan={11}>
										<div className="expanded-content">
											<div className="detail-section">
												<h5>Expected Values</h5>
												<div className="detail-grid">
													<div>
														<span className="label">Cost:</span>
														<span className="value">
															${result.expectedCost.toFixed(4)}
														</span>
													</div>
													<div>
														<span className="label">Receive:</span>
														<span className="value">
															${result.expectedReceive.toFixed(4)}
														</span>
													</div>
													<div>
														<span className="label">Fee:</span>
														<span className="value">
															${result.expectedFee.toFixed(4)}
														</span>
													</div>
													<div>
														<span className="label">Contracts:</span>
														<span className="value">
															{result.expectedContracts.toFixed(4)}
														</span>
													</div>
												</div>
											</div>

											<div className="detail-section">
												<h5>Actual Values</h5>
												<div className="detail-grid">
													<div>
														<span className="label">Cost:</span>
														<span className="value">
															{result.actualCost !== null
																? `$${result.actualCost.toFixed(4)}`
																: "N/A"}
														</span>
													</div>
													<div>
														<span className="label">Receive:</span>
														<span className="value">
															{result.actualReceive !== null
																? `$${result.actualReceive.toFixed(4)}`
																: "N/A"}
														</span>
													</div>
													<div>
														<span className="label">Fee:</span>
														<span className="value">
															{result.actualFee !== null
																? `$${result.actualFee.toFixed(4)}`
																: "N/A"}
														</span>
													</div>
													<div>
														<span className="label">Contracts:</span>
														<span className="value">
															{result.actualContracts !== null
																? result.actualContracts.toFixed(4)
																: "N/A"}
														</span>
													</div>
												</div>
											</div>

											{result.error && (
												<div className="detail-section error-section">
													<h5>Error</h5>
													<div className="error-message">
														{result.error}
													</div>
												</div>
											)}

											{result.orderId && (
												<div className="detail-section">
													<h5>Order ID</h5>
													<div className="monospace">
														{result.orderId}
													</div>
												</div>
											)}

											{result.serverResponse && (
												<div className="detail-section">
													<h5>Server Response</h5>
													<pre className="json-response">
														{JSON.stringify(
															result.serverResponse,
															null,
															2
														)}
													</pre>
												</div>
											)}
										</div>
									</td>
								</tr>
							)}
						</React.Fragment>
					))}
				</tbody>
			</table>
		</div>
	);
}

