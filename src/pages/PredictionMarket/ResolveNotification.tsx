import { useState, useCallback, useMemo, useEffect } from "react";
import { usePrivy, useIdentityToken } from "@privy-io/react-auth";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { useVenueAddressChainMap } from "@/context/AccountDataContext";
import { useLevelUpOrders } from "@/features/trading/venues/levelup/portfolio/useLevelUpOrders";
import { usePredictionData } from "@/context/PredictionDataContext";
import { useRPG } from "@/context/RPGContext";
import "./scss/ResolveNotification.scss";

interface ResolveNotificationProps {
	umbrellaId: string;
}

interface ResolveComment {
	submittedBy: string;
	resolveComment: string;
	[key: string]: unknown;
}

interface UmbrellaWithResolveComments {
	_id: string;
	resolveComments?: ResolveComment[];
	[key: string]: unknown;
}

export function ResolveNotification({ umbrellaId }: ResolveNotificationProps) {
	const { authenticated, getAccessToken, login } = usePrivy();
	const { identityToken } = useIdentityToken();
	const venueAddressChainMap = useVenueAddressChainMap();
	const levelUpWallet = venueAddressChainMap?.levelup.walletAddress ?? null;
	const { orders } = useLevelUpOrders(levelUpWallet, Boolean(authenticated && levelUpWallet));
	const { getQuestionsForUmbrella, getUmbrellaById, umbrellas } = usePredictionData();
	const { profile } = useRPG();
	const [expanded, setExpanded] = useState(false);
	const [resolveComment, setResolveComment] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [submitted, setSubmitted] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [hasAlreadySubmitted, setHasAlreadySubmitted] = useState(false);
	const [viewState, setViewState] = useState<"form" | "thankyou" | "already">("form");

	// Context is ready when we have the necessary data
	const isContextReady = authenticated && identityToken;

	// Get user profile ID from RPG context (MongoDB _id)
	const userProfileId = useMemo(() => {
		if (profile && typeof profile._id === "string" && profile._id.length > 0) {
			return profile._id;
		}
		return null;
	}, [profile]);

	// Get umbrella data - depend on umbrellas array to ensure we get updates
	const umbrella = useMemo(() => {
		return getUmbrellaById(umbrellaId) as UmbrellaWithResolveComments | undefined;
	}, [umbrellaId, getUmbrellaById, umbrellas]);

	// Check if user has already submitted a resolution request
	useEffect(() => {
		if (!userProfileId) {
			setHasAlreadySubmitted(false);
			return;
		}

		if (!umbrella) {
			setHasAlreadySubmitted(false);
			return;
		}

		const resolveComments = umbrella.resolveComments;

		if (!Array.isArray(resolveComments) || resolveComments.length === 0) {
			setHasAlreadySubmitted(false);
			return;
		}

		const userHasSubmitted = resolveComments.some((comment: ResolveComment) => {
			return comment.submittedBy === userProfileId;
		});

		setHasAlreadySubmitted(userHasSubmitted);
		if (userHasSubmitted) {
			setViewState("already");
		}
	}, [userProfileId, umbrellaId, umbrella]);

	// Check if user has orders for this umbrella
	const hasOrders = useMemo(() => {
		if (!orders || orders.length === 0) return false;
		const questions = getQuestionsForUmbrella(umbrellaId);
		if (!questions || questions.length === 0) return false;
		const questionIds = new Set(
			questions
				.map((q) => {
					if (typeof q === "object" && q !== null) {
						return (
							(
								q as {
									_id?: string;
									questionId?: string;
									marketId?: string;
								}
							)._id ||
							(
								q as {
									_id?: string;
									questionId?: string;
									marketId?: string;
								}
							).questionId ||
							(
								q as {
									_id?: string;
									questionId?: string;
									marketId?: string;
								}
							).marketId
						);
					}
					return null;
				})
				.filter((id): id is string => typeof id === "string" && id.length > 0),
		);
		return orders.some((order) => questionIds.has(order.questionId));
	}, [orders, umbrellaId, getQuestionsForUmbrella]);

	// Timer: thank you for 15 seconds then switch to already
	useEffect(() => {
		if (viewState === "thankyou") {
			const timer = setTimeout(() => setViewState("already"), 15000);
			return () => clearTimeout(timer);
		}
		return undefined;
	}, [viewState]);

	const canSubmit =
		isContextReady && resolveComment.trim().length > 0 && !submitting && viewState === "form";

	const handleSubmit = useCallback(async () => {
		if (!isContextReady || !resolveComment.trim() || submitting || viewState !== "form") return;

		setSubmitting(true);
		try {
			const token = await getAccessToken();
			if (!token) {
				throw new Error("Authentication required");
			}

			if (!identityToken) {
				throw new Error("Identity token required");
			}

			const response = await fetch(
				`${getPredictionApiBaseUrl()}/umbrellas/settlement-notification`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${token}`,
						"privy-id-token": identityToken,
					},
					body: JSON.stringify({
						umbrellaId,
						resolveComment: resolveComment.trim(),
					}),
				},
			);

			// If response is NOT ok (any error), treat as already submitted
			if (!response.ok) {
				const errorText = await response.text();
				let errorMsg = "Failed to submit notification";

				if (response.status === 403) {
					errorMsg = "You must have at least one order for this market to submit a notification.";
				} else if (response.status === 409) {
					errorMsg = "You have already submitted a notification for this market.";
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
				setHasAlreadySubmitted(true);
				setResolveComment("");
				setViewState("already");
				setSubmitting(false);
				return;
			}

			// Success - show thank you
			setResolveComment("");
			setViewState("thankyou");
		} catch (error) {
			// Any error = already submitted
			setViewState("already");
		} finally {
			setSubmitting(false);
		}
	}, [
		isContextReady,
		getAccessToken,
		login,
		identityToken,
		resolveComment,
		umbrellaId,
		submitting,
		viewState,
	]);

	const handleTextareaChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			setResolveComment(e.target.value);
			if (errorMessage) {
				setErrorMessage(null);
			}
		},
		[errorMessage],
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
				<h3>Propose Resolution</h3>
				<span className={`resolve-notification-arrow ${expanded ? "expanded" : ""}`}>▼</span>
			</div>

			{expanded && (
				<div className="resolve-notification-content">
					{!authenticated ? (
						<div className="resolve-notification-auth-prompt">
							<p>Please log in to submit a settlement notification.</p>
							<button type="button" onClick={login} className="resolve-notification-login-btn">
								Log In
							</button>
						</div>
					) : hasAlreadySubmitted || submitted ? (
						<div className="resolve-notification-success">
							<p>Thank you for submitting a resolution request.</p>
						</div>
					) : (
						<div className="resolve-notification-form">
							<textarea
								value={resolveComment}
								onChange={handleTextareaChange}
								placeholder="Submit a comment or link to proof if you believe this market should be resolved."
								rows={4}
								className="resolve-notification-textarea"
								disabled={submitting}
							/>
							{errorMessage && <div className="resolve-notification-error">{errorMessage}</div>}
							<button
								type="button"
								onClick={handleSubmit}
								disabled={!canSubmit}
								className="resolve-notification-submit-btn"
							>
								{submitting ? "Submitting..." : "Submit Resolution"}
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
