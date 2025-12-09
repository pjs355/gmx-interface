import React, { useState, useCallback, useMemo, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { useUserData } from "@/context/UserDataContext";
import { usePredictionData } from "@/context/PredictionDataContext";
import "./ResolveNotification.scss";

// Animated loading dots
function LoadingDots() {
	const [dots, setDots] = useState('');
	useEffect(() => {
		const interval = setInterval(() => {
			setDots(prev => prev.length >= 3 ? '' : prev + '.');
		}, 400);
		return () => clearInterval(interval);
	}, []);
	return <span>Loading{dots}</span>;
}

interface ResolveNotificationProps {
	umbrellaId: string;
}

export function ResolveNotification({ umbrellaId }: ResolveNotificationProps) {
	const { authenticated, getAccessToken, ready: privyReady } = usePrivy();
	const { orders, loading: userDataLoading } = useUserData();
	const { getQuestionsForUmbrella, loading: predictionLoading } = usePredictionData();
	const [expanded, setExpanded] = useState(false);
	const [resolveComment, setResolveComment] = useState("");
	const [submitting, setSubmitting] = useState(false);
	
	// Simple state: 'form' | 'thankyou' | 'already'
	const [viewState, setViewState] = useState<'form' | 'thankyou' | 'already'>('form');

	const isContextReady = privyReady && !userDataLoading && !predictionLoading;

	// Check if user has orders for this umbrella
	const hasOrders = useMemo(() => {
		if (!orders || orders.length === 0) return false;
		const questions = getQuestionsForUmbrella(umbrellaId);
		if (!questions || questions.length === 0) return false;
		const questionIds = new Set(
			questions.map((q: any) => q._id || q.questionId || q.marketId).filter(Boolean)
		);
		return orders.some((order) => questionIds.has(order.questionId));
	}, [orders, umbrellaId, getQuestionsForUmbrella]);

	// Timer: thank you for 15 seconds then switch to already
	useEffect(() => {
		if (viewState === 'thankyou') {
			const timer = setTimeout(() => setViewState('already'), 15000);
			return () => clearTimeout(timer);
		}
	}, [viewState]);

	const canSubmit = isContextReady && authenticated && resolveComment.trim().length > 0 && !submitting && viewState === 'form';

	const handleSubmit = useCallback(async () => {
		if (!canSubmit) return;

		setSubmitting(true);
		try {
			const token = await getAccessToken();
			if (!token) {
				setSubmitting(false);
				return;
			}

			const response = await fetch(
				`${getPredictionApiBaseUrl()}/umbrellas/settlement-notification`,
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

			// If response is NOT ok (any error), treat as already submitted
			if (!response.ok) {
				setResolveComment("");
				setViewState('already');
				setSubmitting(false);
				return;
			}

			// Success - show thank you
			setResolveComment("");
			setViewState('thankyou');
		} catch (error) {
			// Any error = already submitted
			setViewState('already');
		} finally {
			setSubmitting(false);
		}
	}, [canSubmit, getAccessToken, umbrellaId, resolveComment]);

	const renderContent = () => {
		// Loading
		if (!isContextReady) {
			return (
				<div className="resolve-notification-info">
					<p><LoadingDots /></p>
				</div>
			);
		}

		// No position - can't submit
		if (!hasOrders) {
			return (
				<div className="resolve-notification-info">
					<p>You need to have a position in this market in order to propose a resolution</p>
				</div>
			);
		}

		// Thank you (15 seconds)
		if (viewState === 'thankyou') {
			return (
				<div className="resolve-notification-success">
					<p>Thank you for your submission</p>
				</div>
			);
		}

		// Already submitted
		if (viewState === 'already') {
			return (
				<div className="resolve-notification-already-submitted">
					<p>We have already received your proposed resolution</p>
				</div>
			);
		}

		// Form
		return (
			<div className="resolve-notification-form">
				<textarea
					value={resolveComment}
					onChange={(e) => setResolveComment(e.target.value)}
					placeholder="Submit a comment or link to proof if you believe this market should be resolved."
					rows={4}
					className="resolve-notification-textarea"
					disabled={submitting}
				/>
				<button
					type="button"
					onClick={handleSubmit}
					disabled={!canSubmit}
					className="resolve-notification-submit-btn"
				>
					{submitting ? "Submitting..." : "Submit Resolution"}
				</button>
			</div>
		);
	};

	return (
		<div className="resolve-notification">
			<div
				className="resolve-notification-header"
				onClick={() => setExpanded(!expanded)}
				style={{ cursor: "pointer" }}
			>
				<h3>Propose Resolution</h3>
				<span className={`resolve-notification-arrow ${expanded ? "expanded" : ""}`}>
					▼
				</span>
			</div>

			{expanded && (
				<div className="resolve-notification-content">
					{renderContent()}
				</div>
			)}
		</div>
	);
}
