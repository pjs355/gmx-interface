import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivy, useIdentityToken } from "@privy-io/react-auth";
import { Trans, t } from "@lingui/macro";
import ConnectWalletButton from "components/Common/ConnectWalletButton";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import {
	commentsService,
	type UmbrellaComment,
} from "@/services/api/commentsService";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";

import "./Comment.scss";

type CommentsProps = {
	umbrellaId: string;
	markets: PredictionMarket[];
};

type TokenOption = {
	value: string;
	label: string;
	marketId: string;
	side: "yes" | "no";
};

type CreateResponseHandler = (comment: UmbrellaComment) => void;

const COMMENT_MAX_LENGTH = 500;

function getMarketIdentifier(market: PredictionMarket): string {
	if (typeof market._id === "string" && market._id.length > 0) {
		return market._id;
	}
	if (typeof market.questionId === "string" && market.questionId.length > 0) {
		return market.questionId;
	}
	if (typeof market.marketId === "string" && market.marketId.length > 0) {
		return market.marketId;
	}
	throw new Error("Missing market identifier");
}

function getMarketLabel(market: PredictionMarket): string {
	const labelFromDisplayName = market.displayName;
	if (typeof labelFromDisplayName === "string" && labelFromDisplayName.length > 0) {
		return labelFromDisplayName;
	}
	const labelFromQuestion = (market as unknown as { question?: string }).question;
	if (typeof labelFromQuestion === "string" && labelFromQuestion.length > 0) {
		return labelFromQuestion;
	}
	return getMarketIdentifier(market);
}

function buildTokenOptions(markets: PredictionMarket[]): TokenOption[] {
	const options: TokenOption[] = [];
	markets.forEach((market) => {
		const yesToken = market.yesTokenId;
		const noToken = market.noTokenId;
		const marketLabel = getMarketLabel(market);
		if (typeof yesToken === "string" && yesToken.length > 0) {
			options.push({
				value: yesToken,
				label: t({
					id: "comments.option.yes",
					message: "Yes on {market}",
					values: { market: marketLabel },
				}),
				marketId: getMarketIdentifier(market),
				side: "yes",
			});
		}
		if (typeof noToken === "string" && noToken.length > 0) {
			options.push({
				value: noToken,
				label: t({
					id: "comments.option.no",
					message: "No on {market}",
					values: { market: marketLabel },
				}),
				marketId: getMarketIdentifier(market),
				side: "no",
			});
		}
	});
	return options;
}

function formatTimestamp(isoTimestamp: string): string {
	const dateInstance = new Date(isoTimestamp);
	if (Number.isNaN(dateInstance.getTime())) {
		throw new Error("Invalid comment timestamp");
	}
	return dateInstance.toLocaleString(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

function resolveTokenMeta(
	tokenId: string,
	options: TokenOption[]
): { label: string; side: "yes" | "no" } | null {
	const option = options.find((item) => item.value === tokenId);
	if (!option) {
		return null;
	}
	return { label: option.label, side: option.side };
}

async function fetchProfileId(
	getAccessToken: () => Promise<string | null>,
	identityToken: string | null
): Promise<string | null> {
	const accessToken = await getAccessToken();
	if (accessToken === null) {
		return null;
	}
	if (identityToken === null) {
		return null;
	}
	const requestUrl = `${getPredictionApiBaseUrl()}/profiles/me`;
	const response = await fetch(requestUrl, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
			"privy-id-token": identityToken,
		},
	});
	if (!response.ok) {
		return null;
	}
	const payload = await response.json();
	if (payload === null || payload === undefined) {
		return null;
	}
	if (payload.success !== true) {
		return null;
	}
	const data = payload.data;
	if (data === null || data === undefined) {
		return null;
	}
	if (typeof data.id === "string" && data.id.length > 0) {
		return data.id;
	}
	return null;
}

export function Comments({ umbrellaId, markets }: CommentsProps) {
	const [comments, setComments] = useState<UmbrellaComment[]>([]);
	const [loading, setLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
	const [isDeleting, setIsDeleting] = useState<string | null>(null);
	const { authenticated, getAccessToken, login } = usePrivy();
	const { identityToken } = useIdentityToken();

	const tokenOptions = useMemo(() => buildTokenOptions(markets), [markets]);

	const loadComments = useCallback(async () => {
		try {
			setLoading(true);
			setErrorMessage(null);
			const list = await commentsService.list(umbrellaId);
			setComments(list);
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to load comments";
			setErrorMessage(message);
		} finally {
			setLoading(false);
		}
	}, [umbrellaId]);

	useEffect(() => {
		loadComments();
	}, [loadComments]);

	useEffect(() => {
		let cancelled = false;
		async function resolveProfileId() {
			if (!authenticated) {
				setCurrentProfileId(null);
				return;
			}
			if (typeof getAccessToken !== "function") {
				return;
			}
			const identityForRequest = identityToken !== undefined ? identityToken : null;
			const profileId = await fetchProfileId(getAccessToken, identityForRequest);
			if (cancelled) {
				return;
			}
			if (profileId !== null) {
				setCurrentProfileId(profileId);
			}
		}
		resolveProfileId();
		return () => {
			cancelled = true;
		};
	}, [authenticated, getAccessToken, identityToken]);

	const handleCreated = useCallback<CreateResponseHandler>(
		(newComment) => {
			setComments((prev) => [newComment, ...prev]);
		},
		[]
	);

	const currentIdentityToken = identityToken ?? null;

	const handleDeleted = useCallback(
		async (commentId: string) => {
			if (typeof getAccessToken !== "function") {
				return;
			}
			try {
				setIsDeleting(commentId);
				setErrorMessage(null);
				const token = await getAccessToken();
				if (token === null) {
					throw new Error("Authentication required");
				}
				if (currentIdentityToken === null) {
					throw new Error("Identity token missing. Please re-authenticate.");
				}
				await commentsService.delete({
					commentId,
					accessToken: token,
					identityToken: currentIdentityToken,
				});
				setComments((prev) => prev.filter((item) => item._id !== commentId));
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to delete comment";
				setErrorMessage(message);
			} finally {
				setIsDeleting(null);
			}
		},
		[getAccessToken, currentIdentityToken]
	);

	const renderComment = useCallback(
		(comment: UmbrellaComment) => {
			const resolvedProfile = comment.profile;
			const username =
				resolvedProfile && typeof resolvedProfile.username === "string"
					? resolvedProfile.username
					: "";
			const displayName = username.length > 0 ? username : t`Unknown user`;
			const timestampLabel = formatTimestamp(comment.createdAt);
	const tokenMeta =
		comment.token && comment.token.length > 0
			? resolveTokenMeta(comment.token, tokenOptions)
			: null;
			const isOwnComment =
				currentProfileId !== null &&
				resolvedProfile !== undefined &&
				resolvedProfile !== null &&
				resolvedProfile._id === currentProfileId;
			const deleting = isDeleting === comment._id;
			return (
				<li key={comment._id} className="comments__item">
					<div className="comments__header">
						<span className="comments__username">@{displayName}</span>
						<span className="comments__timestamp">{timestampLabel}</span>
					</div>
					{tokenMeta !== null && (
						<span
							className={`comments__side comments__side--${tokenMeta.side}`}
						>
							{tokenMeta.label}
						</span>
					)}
					<p className="comments__body">{comment.comment}</p>
					{isOwnComment && (
						<button
							type="button"
							className="comments__delete"
							onClick={() => handleDeleted(comment._id)}
							disabled={deleting}
						>
							{deleting ? t`Deleting...` : t`Delete`}
						</button>
					)}
				</li>
			);
		},
		[currentProfileId, handleDeleted, isDeleting, tokenOptions]
	);

	return (
		<section className="comments">
			<div className="comments__title-row">
				<h2 className="comments__title">
					<Trans>Comments</Trans>
				</h2>
			</div>
		<NewComment
			umbrellaId={umbrellaId}
			onCreated={handleCreated}
			isAuthenticated={authenticated}
			identityToken={currentIdentityToken}
			requestLogin={login}
		/>
			{loading && <div className="comments__status">{t`Loading comments...`}</div>}
			{!loading && errorMessage !== null && (
				<div className="comments__error">{errorMessage}</div>
			)}
			{!loading && errorMessage === null && comments.length === 0 && (
				<p className="comments__empty">
					<Trans>No comments yet. Be the first to share your thoughts.</Trans>
				</p>
			)}
			{!loading && errorMessage === null && comments.length > 0 && (
				<ul className="comments__list">
					{comments.map((comment) => renderComment(comment))}
				</ul>
			)}
		</section>
	);
}

type NewCommentProps = {
	umbrellaId: string;
	onCreated: CreateResponseHandler;
	isAuthenticated: boolean;
	requestLogin: () => Promise<void> | void;
	identityToken: string | null;
};

function NewComment({
	umbrellaId,
	onCreated,
	isAuthenticated,
	requestLogin,
	identityToken,
}: NewCommentProps) {
	const [commentText, setCommentText] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const { getAccessToken } = usePrivy();

	const commentLength = commentText.length;
	const remainingCharacters = COMMENT_MAX_LENGTH - commentLength;
	const isNearLimit = commentLength >= 480;

	const canSubmit =
		commentText.trim().length > 0 && remainingCharacters >= 0 && !submitting;

	const handleSubmit = useCallback(async () => {
		if (!isAuthenticated) {
			requestLogin();
			return;
		}
		if (typeof getAccessToken !== "function") {
			throw new Error("Privy access token function unavailable");
		}
		try {
			setSubmitting(true);
			setErrorMessage(null);
			const token = await getAccessToken();
			if (token === null) {
				throw new Error("Authentication required");
			}
			if (identityToken === null) {
				throw new Error("Identity token missing. Please re-authenticate.");
			}
			const payloadComment = commentText.trim();
			const created = await commentsService.create({
				umbrellaId,
				comment: payloadComment,
				accessToken: token,
				identityToken,
			});
			onCreated(created);
			setCommentText("");
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to post comment";
			setErrorMessage(message);
		} finally {
			setSubmitting(false);
		}
	}, [
		commentText,
		getAccessToken,
		identityToken,
		isAuthenticated,
		onCreated,
		requestLogin,
		umbrellaId,
	]);

	return (
		<div className="new-comment">
			<label htmlFor="new-comment-input" className="new-comment__label">
				<Trans>Leave a comment</Trans>
			</label>
			<textarea
				id="new-comment-input"
				className="new-comment__textarea"
				value={commentText}
				maxLength={COMMENT_MAX_LENGTH}
				placeholder={t`Share your view on this market...`}
				onChange={(event) => {
					setCommentText(event.target.value);
				}}
				disabled={submitting}
			/>
			<div className="new-comment__actions">
				<span
					className={`new-comment__counter${
						isNearLimit ? " new-comment__counter--warning" : ""
					}`}
				>
					{commentLength} / {COMMENT_MAX_LENGTH}
				</span>
				{!isAuthenticated ? (
					<ConnectWalletButton onClick={() => requestLogin()}>
						<Trans>Sign in to comment</Trans>
					</ConnectWalletButton>
				) : (
					<button
						type="button"
						className="new-comment__submit"
						onClick={handleSubmit}
						disabled={!canSubmit}
					>
						{submitting ? t`Posting...` : t`Post comment`}
					</button>
				)}
			</div>
			{errorMessage !== null && (
				<div className="new-comment__error">{errorMessage}</div>
			)}
		</div>
	);
}


