import React from "react";
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
							onChange={(e) =>
								onDetailsChange({ displayName: e.target.value })
							}
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
								onChange={(e) =>
									onDetailsChange({ yesColor: e.target.value })
								}
								className="edit-color-input"
								name="questionYesColor"
							/>
						</label>
						<label className="admin-form-label">
							<span>No Color</span>
							<input
								type="color"
								value={details.noColor || "#ef4444"}
								onChange={(e) =>
									onDetailsChange({ noColor: e.target.value })
								}
								className="edit-color-input"
								name="questionNoColor"
							/>
						</label>
					</div>
					<div className="edit-tags-section">
						<span>Tags</span>
						<div className="edit-tags-container">
							{loadingTags ? (
								<div style={{ fontSize: 12, opacity: 0.8 }}>
									Loading tags...
								</div>
							) : (
								availableTags.map((tag) => {
									const selected =
										Array.isArray(details.tagIds) &&
										details.tagIds.includes(tag._id);
									return (
										<button
											type="button"
											key={tag._id}
											onClick={() => onTagToggle(tag._id)}
											className={`edit-tag-button ${
												selected ? "selected" : ""
											}`}
										>
											{tag.label}
										</button>
									);
								})
							)}
						</div>
					</div>

					<SettleMarket questionId={details.questionId} />
					<div className="edit-save-question-section">
						<button
							type="button"
							onClick={onSave}
							disabled={saving}
							className="edit-save-question-button"
						>
							{saving ? "Saving..." : "Save Question"}
						</button>
						{saveMessage && (
							<span className="edit-success-message">{saveMessage}</span>
						)}
						{saveError && (
							<span className="edit-error-message">{saveError}</span>
						)}
					</div>
					<SeedMarket
						questionId={details.questionId}
						questionDisplayName={details.displayName}
					/>
				</div>
			)}
		</div>
	);
};

export default QuestionEditor;
