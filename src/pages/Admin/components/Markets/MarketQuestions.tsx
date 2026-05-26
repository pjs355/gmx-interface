import { useEffect, useState, useMemo } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { tagService, type Tag } from "@/services/api/tagService";
import { findMatchingTag } from "./tagMatcher";

export type QuestionEntry = {
	displayName: string;
	tagIds: string[]; // Array of tag ObjectIds
	yesColor: string;
	noColor: string;
};

interface DefaultColors {
	yesColor?: string;
	noColor?: string;
}

interface MarketQuestionsProps {
	questions: QuestionEntry[];
	submitting?: boolean;
	onQuestionsChange: (questions: QuestionEntry[]) => void;
	gameName?: string;
	autoMatchTags?: boolean;
	defaultColors?: DefaultColors;
	preferredTagLabels?: string[];
}

export default function MarketQuestions({
	questions,
	submitting = false,
	onQuestionsChange,
	gameName,
	autoMatchTags = false,
	defaultColors,
	preferredTagLabels,
}: MarketQuestionsProps) {
	const { getAccessToken } = usePrivy();
	const [availableTags, setAvailableTags] = useState<Tag[]>([]);
	const [loadingTags, setLoadingTags] = useState(true);

	const BASE_YES_COLOR = "#22c55e";
	const BASE_NO_COLOR = "#ef4444";

	const resolvedDefaultYesColor = useMemo(() => {
		if (defaultColors?.yesColor) {
			return defaultColors.yesColor;
		}
		return BASE_YES_COLOR;
	}, [defaultColors]);

	const resolvedDefaultNoColor = useMemo(() => {
		if (defaultColors?.noColor) {
			return defaultColors.noColor;
		}
		return BASE_NO_COLOR;
	}, [defaultColors]);

	useEffect(() => {
		if (questions.length > 0) {
			return;
		}
		onQuestionsChange([
			{
				displayName: "",
				tagIds: [],
				yesColor: resolvedDefaultYesColor,
				noColor: resolvedDefaultNoColor,
			},
		]);
	}, []);

	useEffect(() => {
		if (questions.length === 0) {
			return;
		}
		let didUpdate = false;
		const updated = questions.map((question) => {
			let yesColor = question.yesColor;
			let noColor = question.noColor;
			let questionChanged = false;
			if (
				defaultColors?.yesColor &&
				(yesColor === BASE_YES_COLOR || yesColor === defaultColors.yesColor) &&
				yesColor !== defaultColors.yesColor
			) {
				yesColor = defaultColors.yesColor;
				questionChanged = true;
			}
			if (
				defaultColors?.noColor &&
				(noColor === BASE_NO_COLOR || noColor === defaultColors.noColor) &&
				noColor !== defaultColors.noColor
			) {
				noColor = defaultColors.noColor;
				questionChanged = true;
			}
			if (questionChanged) {
				didUpdate = true;
				return {
					...question,
					yesColor,
					noColor,
				};
			}
			return question;
		});
		if (didUpdate) {
			onQuestionsChange(updated);
		}
	}, [defaultColors, questions, onQuestionsChange]);

	useEffect(() => {
		let mounted = true;

		async function loadTags() {
			try {
				const tags = await tagService.fetchAllTags();
				if (mounted) setAvailableTags(tags);
			} catch (err) {
				console.error("error", err);
			} finally {
				if (mounted) setLoadingTags(false);
			}
		}

		loadTags();

		return () => {
			mounted = false;
		};
	}, [getAccessToken]);

	useEffect(() => {
		if (
			!preferredTagLabels ||
			preferredTagLabels.length === 0 ||
			availableTags.length === 0 ||
			questions.length === 0 ||
			questions[0].tagIds.length > 0
		) {
			return;
		}
		const normalizedPreferred = preferredTagLabels.map((label) => label.toLowerCase());
		const preferredTag = availableTags.find((tag) => {
			const labelMatch = normalizedPreferred.includes(tag.label.toLowerCase());
			const slugMatch = normalizedPreferred.includes(tag.slug.toLowerCase());
			return labelMatch || slugMatch;
		});
		if (!preferredTag) {
			return;
		}
		const updated = [...questions];
		updated[0] = {
			...updated[0],
			tagIds: [preferredTag._id],
		};
		console.log("MarketQuestions preferred tag applied", preferredTag.label, updated[0].tagIds);
		onQuestionsChange(updated);
	}, [availableTags, preferredTagLabels, questions, onQuestionsChange]);

	// Auto-match tags when tags are loaded and gameName is provided
	useEffect(() => {
		if (questions.length === 0) {
			return;
		}
		if (questions[0].tagIds.length > 0) {
			return;
		}
		let matchedTagId: string | null = null;
		if (preferredTagLabels && preferredTagLabels.length > 0) {
			const normalizedPreferred = preferredTagLabels.map((label) => label.toLowerCase());
			const preferredTag = availableTags.find((tag) => {
				const labelMatch = normalizedPreferred.includes(tag.label.toLowerCase());
				const slugMatch = normalizedPreferred.includes(tag.slug.toLowerCase());
				return labelMatch || slugMatch;
			});
			if (preferredTag) {
				matchedTagId = preferredTag._id;
			}
		}
		if (!matchedTagId && availableTags.length > 0 && gameName && autoMatchTags) {
			matchedTagId = findMatchingTag(gameName, availableTags);
		}
		if (matchedTagId) {
			const updated = [...questions];
			updated[0] = {
				...updated[0],
				tagIds: [matchedTagId],
			};
			console.log("MarketQuestions auto-match applied", matchedTagId, updated[0].tagIds);
			onQuestionsChange(updated);
		}
	}, [availableTags, gameName, autoMatchTags, preferredTagLabels, questions, onQuestionsChange]);

	function updateQuestion<K extends keyof QuestionEntry>(
		index: number,
		key: K,
		value: QuestionEntry[K],
	) {
		const updated = questions.map((q, i) => (i === index ? { ...q, [key]: value } : q));
		onQuestionsChange(updated);
	}

	function updateQuestionColor(index: number, key: "yesColor" | "noColor", value: string) {
		const updated = questions.map((q, i) => (i === index ? { ...q, [key]: value } : q));
		onQuestionsChange(updated);
	}

	function toggleTagForQuestion(index: number, tagId: string) {
		const updated = questions.map((q, i) => {
			if (i !== index) return q;
			const has = q.tagIds.includes(tagId);
			return {
				...q,
				tagIds: has ? q.tagIds.filter((t) => t !== tagId) : [...q.tagIds, tagId],
			};
		});
		onQuestionsChange(updated);
	}

	function addQuestion() {
		onQuestionsChange([
			...questions,
			{
				displayName: "",
				tagIds: [],
				yesColor: resolvedDefaultYesColor,
				noColor: resolvedDefaultNoColor,
			},
		]);
	}

	function removeQuestionEntry(index: number) {
		onQuestionsChange(questions.filter((_, i) => i !== index));
	}

	return (
		<div
			style={{
				marginTop: 16,
				borderTop: "1px solid rgba(255,255,255,0.2)",
				paddingTop: 12,
			}}
		>
			<div
				style={{
					marginBottom: 8,
				}}
			>
				<div style={{ fontWeight: 600 }}>Questions (add one or more entries)</div>
			</div>
			<div style={{ display: "grid", gap: 12 }}>
				{questions.map((q, idx) => (
					<div
						key={idx}
						style={{
							border: "1px solid rgba(255,255,255,0.2)",
							borderRadius: 8,
							padding: 12,
							background: "rgba(255,255,255,0.03)",
						}}
					>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								marginBottom: 8,
							}}
						>
							<div style={{ fontWeight: 600 }}>Question #{idx + 1}</div>
							<button
								type="button"
								onClick={() => removeQuestionEntry(idx)}
								style={{ padding: "4px 8px" }}
							>
								Remove
							</button>
						</div>
						<label style={{ display: "grid", gap: 6 }}>
							<span>Display Name</span>
							<input
								value={q.displayName}
								onChange={(e) => updateQuestion(idx, "displayName", e.target.value)}
								placeholder="Question display name"
								style={{
									padding: 8,
									color: "cyan",
									border: "1px solid white",
									borderRadius: "4px",
									background: "transparent",
								}}
							/>
						</label>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "1fr 1fr",
								gap: 12,
								marginTop: 8,
							}}
						>
							<label style={{ display: "grid", gap: 6 }}>
								<span>Yes Color</span>
								<input
									type="color"
									value={q.yesColor || resolvedDefaultYesColor}
									onChange={(event) => updateQuestionColor(idx, "yesColor", event.target.value)}
									style={{
										height: 40,
										padding: 0,
										background: "transparent",
										border: "1px solid white",
										borderRadius: 4,
									}}
								/>
							</label>
							<label style={{ display: "grid", gap: 6 }}>
								<span>No Color</span>
								<input
									type="color"
									value={q.noColor || resolvedDefaultNoColor}
									onChange={(event) => updateQuestionColor(idx, "noColor", event.target.value)}
									style={{
										height: 40,
										padding: 0,
										background: "transparent",
										border: "1px solid white",
										borderRadius: 4,
									}}
								/>
							</label>
						</div>
						<div
							style={{
								display: "grid",
								gap: 6,
								marginTop: 8,
							}}
						>
							<span>Tags</span>
							<div
								style={{
									display: "flex",
									flexWrap: "wrap",
									gap: 8,
								}}
							>
								{loadingTags ? (
									<div style={{ fontSize: 12, opacity: 0.8 }}>Loading tags...</div>
								) : (
									availableTags.map((tag) => {
										const isSelected = q.tagIds.includes(tag._id);
										return (
											<button
												type="button"
												key={tag._id}
												onClick={() => toggleTagForQuestion(idx, tag._id)}
												style={{
													padding: "6px 10px",
													border: "1px solid white",
													borderRadius: 999,
													background: isSelected ? "rgba(255,255,255,0.2)" : "transparent",
													color: "white",
													cursor: "pointer",
												}}
											>
												{tag.label}
											</button>
										);
									})
								)}
							</div>
						</div>
					</div>
				))}
			</div>
			<div style={{ marginTop: 12 }}>
				<button
					type="button"
					onClick={addQuestion}
					disabled={submitting}
					style={{
						padding: "6px 10px",
						border: "1px solid white",
						borderRadius: 6,
						background: "transparent",
						color: "white",
						cursor: "pointer",
					}}
				>
					+ Add Question
				</button>
			</div>
		</div>
	);
}
