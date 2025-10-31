import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { tagService, type Tag } from "@/services/api/tagService";

export type QuestionEntry = {
	displayName: string;
	tags: string[]; // Array of tag IDs
	yesColor: string;
	noColor: string;
};

interface MarketQuestionsProps {
	questions: QuestionEntry[];
	submitting?: boolean;
	onQuestionsChange: (questions: QuestionEntry[]) => void;
}

export default function MarketQuestions({
	questions,
	submitting = false,
	onQuestionsChange,
}: MarketQuestionsProps) {
	const { getAccessToken } = usePrivy();
	const [availableTags, setAvailableTags] = useState<Tag[]>([]);
	const [loadingTags, setLoadingTags] = useState(true);

	useEffect(() => {
		let mounted = true;

		async function loadTags() {
			try {
				const token = await getAccessToken();
				if (!token) {
					throw new Error("No access token available");
				}
				const tags = await tagService.fetchAllTags(token);
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

	function updateQuestion<K extends keyof QuestionEntry>(
		index: number,
		key: K,
		value: QuestionEntry[K]
	) {
		const updated = questions.map((q, i) =>
			i === index ? { ...q, [key]: value } : q
		);
		onQuestionsChange(updated);
	}

	function toggleTagForQuestion(index: number, tagId: string) {
		const updated = questions.map((q, i) => {
			if (i !== index) return q;
			const has = q.tags.includes(tagId);
			return {
				...q,
				tags: has
					? q.tags.filter((t) => t !== tagId)
					: [...q.tags, tagId],
			};
		});
		onQuestionsChange(updated);
	}

	function addQuestionEntry() {
		const lastQuestionTags =
			questions.length > 0 ? questions[questions.length - 1].tags : [];

		onQuestionsChange([
			...questions,
			{
				displayName: "",
				tags: [...lastQuestionTags],
				yesColor: "#22c55e",
				noColor: "#ef4444",
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
				<div style={{ fontWeight: 600 }}>
					Questions (add one or more entries)
				</div>
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
							<div style={{ fontWeight: 600 }}>
								Question #{idx + 1}
							</div>
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
								onChange={(e) =>
									updateQuestion(
										idx,
										"displayName",
										e.target.value
									)
								}
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
									value={q.yesColor}
									onChange={(e) =>
										updateQuestion(
											idx,
											"yesColor",
											e.target.value
										)
									}
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
									value={q.noColor}
									onChange={(e) =>
										updateQuestion(
											idx,
											"noColor",
											e.target.value
										)
									}
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
									<div style={{ fontSize: 12, opacity: 0.8 }}>
										Loading tags...
									</div>
								) : (
									availableTags.map((tag) => {
										const isSelected = q.tags.includes(
											tag._id
										);
										return (
											<button
												type="button"
												key={tag._id}
												onClick={() =>
													toggleTagForQuestion(
														idx,
														tag._id
													)
												}
												style={{
													padding: "6px 10px",
													border: "1px solid white",
													borderRadius: 999,
													background: isSelected
														? "rgba(255,255,255,0.2)"
														: "transparent",
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
					onClick={addQuestionEntry}
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
