import React, { useState, useCallback, useMemo } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { useUserData } from "@/context/UserDataContext";
import { usePredictionData } from "@/context/PredictionDataContext";
import "./ResolveNotification.scss";

interface ResolveNotificationProps {
	umbrellaId: string;
}

export function ResolveNotification({ umbrellaId }: ResolveNotificationProps) {
	const { authenticated, getAccessToken, login } = usePrivy();
	const { orders } = useUserData();
	const { getQuestionsForUmbrella } = usePredictionData();
	const [expanded, setExpanded] = useState(false);
	const [resolveComment, setResolveComment] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [submitted, setSubmitted] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	// Check if user has orders for this umbrella
	const hasOrders = useMemo(() => {
		if (!orders || orders.length === 0) {
			return false;
		}

		const questions = getQuestionsForUmbrella(umbrellaId);
		if (!questions || questions.length === 0) {
			return false;
		}

		// Get all question IDs for this umbrella
		const questionIds = new Set(
			questions
				.map((q: any) => q._id || q.questionId || q.marketId)
				.filter(Boolean)
		);

		// Check if any order matches any question in this umbrella
		return orders.some((order) => questionIds.has(order.questionId));
	}, [orders, umbrellaId, getQuestionsForUmbrella]);

	const canSubmit =
		authenticated &&
		resolveComment.trim().length > 0 &&
		!submitting &&
		!submitted;

	const handleSubmit = useCallback(async () => {
		if (!authenticated) {
			login();
			return;
		}

		if (typeof getAccessToken !== "function") {
			setErrorMessage("Authentication unavailable. Please try again.");
			return;
		}

		if (resolveComment.trim().length === 0) {
			setErrorMessage("Please enter a comment or link to proof.");
			return;
		}

		try {
			setSubmitting(true);
			setErrorMessage(null);

			const token = await getAccessToken();
			if (!token) {
				throw new Error("Authentication required");
			}

			const API_BASE = getPredictionApiBaseUrl();
			const response = await fetch(
				`${API_BASE}/umbrellas/settlement-notification`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({
						umbrellaId,
						resolveComment: resolveComment.trim(),
					}),
				}
			);

			if (!response.ok) {
				const errorText = await response.text();
				let errorMsg = "Failed to submit notification";

				if (response.status === 403) {
					errorMsg =
						"You must have at least one order for this market to submit a notification.";
				} else if (response.status === 409) {
					errorMsg =
						"You have already submitted a notification for this umbrella.";
				} else {
					try {
						const errorJson = JSON.parse(errorText);
						errorMsg = errorJson.error || errorMsg;
					} catch {
						errorMsg = errorText || errorMsg;
					}
				}

				throw new Error(errorMsg);
			}

			const result = await response.json();
			if (result.success) {
				setSubmitted(true);
				setResolveComment("");
			} else {
				throw new Error(
					result.error || "Failed to submit notification"
				);
			}
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to submit notification";
			setErrorMessage(message);
		} finally {
			setSubmitting(false);
		}
	}, [authenticated, getAccessToken, login, resolveComment, umbrellaId]);

	const handleTextareaChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			setResolveComment(e.target.value);
			if (errorMessage) {
				setErrorMessage(null);
			}
		},
		[errorMessage]
	);

	// Don't render if user doesn't have orders
	if (!hasOrders) {
		return null;
	}

	return (
		<div className="resolve-notification">
			<div
				className="resolve-notification-header"
				onClick={() => setExpanded(!expanded)}
				style={{ cursor: "pointer" }}
			>
				<h3>Settlement Notification</h3>
				<span
					className={`resolve-notification-arrow ${
						expanded ? "expanded" : ""
					}`}
				>
					▼
				</span>
			</div>

			{expanded && (
				<div className="resolve-notification-content">
					<p className="resolve-notification-description">
						Submit a comment or link to proof if you believe this
						market should be resolved.
					</p>

					{!authenticated ? (
						<div className="resolve-notification-auth-prompt">
							<p>
								Please log in to submit a settlement
								notification.
							</p>
							<button
								type="button"
								onClick={login}
								className="resolve-notification-login-btn"
							>
								Log In
							</button>
						</div>
					) : submitted ? (
						<div className="resolve-notification-success">
							<p>✓ Notification submitted successfully!</p>
							<p className="resolve-notification-success-note">
								You have already submitted a notification for
								this umbrella.
							</p>
						</div>
					) : (
						<div className="resolve-notification-form">
							<textarea
								value={resolveComment}
								onChange={handleTextareaChange}
								placeholder="Enter comment or link to proof..."
								rows={4}
								className="resolve-notification-textarea"
								disabled={submitting}
							/>
							{errorMessage && (
								<div className="resolve-notification-error">
									{errorMessage}
								</div>
							)}
							<button
								type="button"
								onClick={handleSubmit}
								disabled={!canSubmit}
								className="resolve-notification-submit-btn"
							>
								{submitting
									? "Submitting..."
									: "Submit Notification"}
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
