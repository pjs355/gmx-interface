import React, { useState } from "react";
import type { Tag } from "@/services/api/tagService";
import { QuestionDetails } from "@/types/market-types";
import SettleMarket from "../SettleMarket";
import SeedMarket from "../SeedMarket";

interface QuestionEditorProps {
	loading: boolean;
	error: string | null;
	details: QuestionDetails | null;
	availableTags: Tag[];
	loadingTags: boolean;
	onTagToggle: (tagId: string) => void;
	onDetailsChange: (patch: Partial<QuestionDetails>) => void;
	onSave: () => void;
	saving: boolean;
	saveMessage: string | null;
	saveError: string | null;
}

const QuestionEditor: React.FC<QuestionEditorProps> = ({
	loading,
	error,
	details,
	availableTags,
	loadingTags,
	onTagToggle,
	onDetailsChange,
	onSave,
	saving,
	saveMessage,
	saveError,
}) => {
	const [detailsExpanded, setDetailsExpanded] = useState(false);

	if (!details && !loading && !error) {
		return null;
	}

	return (
		<div className="edit-editing-section">
			<div className="edit-editing-title">Editing Question</div>
			{loading && <div className="admin-loading-text">Loading…</div>}
			{error && <div className="edit-error-message">{error}</div>}
			{details && (
				<div className="edit-question-details">
					<label className="admin-form-label">
						<span>Question</span>
						<input
							value={details.question || ""}
							readOnly
							className="edit-question-readonly"
							name="questionIdReadonly"
						/>
					</label>
					<label className="admin-form-label">
						<span>Display Name</span>
						<input
							value={details.displayName || ""}
							onChange={(e) => onDetailsChange({ displayName: e.target.value })}
							className="edit-form-input"
							name="questionDisplayName"
						/>
					</label>
					<div className="edit-color-grid">
						<label className="admin-form-label">
							<span>Yes Color</span>
							<input
								type="color"
								value={details.yesColor || "#22c55e"}
								onChange={(e) => onDetailsChange({ yesColor: e.target.value })}
								className="edit-color-input"
								name="questionYesColor"
							/>
						</label>
						<label className="admin-form-label">
							<span>No Color</span>
							<input
								type="color"
								value={details.noColor || "#ef4444"}
								onChange={(e) => onDetailsChange({ noColor: e.target.value })}
								className="edit-color-input"
								name="questionNoColor"
							/>
						</label>
					</div>
					<div className="edit-tags-section">
						<span>Tags</span>
						<div className="edit-tags-container">
							{loadingTags ? (
								<div style={{ fontSize: 12, opacity: 0.8 }}>Loading tags...</div>
							) : (
								availableTags.map((tag) => {
									const selected =
										Array.isArray(details.tagIds) && details.tagIds.includes(tag._id);
									return (
										<button
											type="button"
											key={tag._id}
											onClick={() => onTagToggle(tag._id)}
											className={`edit-tag-button ${selected ? "selected" : ""}`}
										>
											{tag.label}
										</button>
									);
								})
							)}
						</div>
					</div>

					{/* Details Dropdown - Token Addresses */}
					<div style={{ marginTop: 16 }}>
						<button
							type="button"
							onClick={() => setDetailsExpanded(!detailsExpanded)}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 8,
								padding: "8px 14px",
								border: "1px solid rgba(255,255,255,0.2)",
								borderRadius: 6,
								background: detailsExpanded ? "rgba(59, 130, 246, 0.2)" : "rgba(255,255,255,0.05)",
								color: "white",
								cursor: "pointer",
								fontSize: 13,
								fontWeight: 500,
								transition: "all 0.2s ease",
								width: "fit-content",
							}}
						>
							<span
								style={{
									transform: detailsExpanded ? "rotate(90deg)" : "rotate(0deg)",
									transition: "transform 0.2s ease",
									display: "inline-block",
								}}
							>
								▶
							</span>
							Details
						</button>
						{detailsExpanded && (
							<div
								style={{
									marginTop: 10,
									padding: 14,
									borderRadius: 8,
									background: "rgba(0,0,0,0.3)",
									border: "1px solid rgba(255,255,255,0.1)",
								}}
							>
								<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
									<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
										<span
											style={{
												background: "#22c55e",
												color: "#000",
												padding: "3px 8px",
												borderRadius: 4,
												fontWeight: 600,
												minWidth: 40,
												textAlign: "center",
												fontSize: 12,
											}}
										>
											YES
										</span>
										<code
											style={{
												background: "rgba(255,255,255,0.1)",
												padding: "6px 10px",
												borderRadius: 4,
												fontFamily: "monospace",
												fontSize: 12,
												wordBreak: "break-all",
												flex: 1,
												color: "white",
											}}
										>
											{details.yesTokenId || "N/A"}
										</code>
										<button
											type="button"
											onClick={() => {
												navigator.clipboard.writeText(details.yesTokenId || "");
											}}
											style={{
												padding: "6px 10px",
												border: "1px solid rgba(255,255,255,0.2)",
												borderRadius: 4,
												background: "rgba(255,255,255,0.1)",
												color: "white",
												cursor: "pointer",
												fontSize: 11,
											}}
											title="Copy YES Token ID"
										>
											Copy
										</button>
									</div>
									<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
										<span
											style={{
												background: "#ef4444",
												color: "#fff",
												padding: "3px 8px",
												borderRadius: 4,
												fontWeight: 600,
												minWidth: 40,
												textAlign: "center",
												fontSize: 12,
											}}
										>
											NO
										</span>
										<code
											style={{
												background: "rgba(255,255,255,0.1)",
												padding: "6px 10px",
												borderRadius: 4,
												fontFamily: "monospace",
												fontSize: 12,
												wordBreak: "break-all",
												flex: 1,
												color: "white",
											}}
										>
											{details.noTokenId || "N/A"}
										</code>
										<button
											type="button"
											onClick={() => {
												navigator.clipboard.writeText(details.noTokenId || "");
											}}
											style={{
												padding: "6px 10px",
												border: "1px solid rgba(255,255,255,0.2)",
												borderRadius: 4,
												background: "rgba(255,255,255,0.1)",
												color: "white",
												cursor: "pointer",
												fontSize: 11,
											}}
											title="Copy NO Token ID"
										>
											Copy
										</button>
									</div>
								</div>
							</div>
						)}
					</div>

					<SettleMarket
						questionId={details.questionId}
						status={details.status}
						resolvedOutcome={details.resolvedOutcome}
						resolvedAt={details.resolvedAt}
					/>
					<div className="edit-save-question-section">
						<button
							type="button"
							onClick={onSave}
							disabled={saving}
							className="edit-save-question-button"
						>
							{saving ? "Saving..." : "Save Question"}
						</button>
						{saveMessage && <span className="edit-success-message">{saveMessage}</span>}
						{saveError && <span className="edit-error-message">{saveError}</span>}
					</div>
					<SeedMarket questionId={details.questionId} questionDisplayName={details.displayName} />
				</div>
			)}
		</div>
	);
};

export default QuestionEditor;
