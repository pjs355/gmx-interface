import React from "react";
import type { UmbrellaQuestion } from "@/services/api/umbrellaDataService";

interface QuestionSelectorProps {
	questions: UmbrellaQuestion[];
	onSelect: (question: UmbrellaQuestion) => void;
	selectedQuestionId: string | null;
}

const QuestionSelector: React.FC<QuestionSelectorProps> = ({
	questions,
	onSelect,
	selectedQuestionId,
}) => {
	return (
		<div className="edit-questions-list-section">
			<div className="edit-questions-title">Questions</div>
			{questions.length === 0 ? (
				<div className="edit-no-questions">No questions in this umbrella.</div>
			) : (
				<div className="edit-questions-grid">
					{questions.map((question) => {
						const isSelected = selectedQuestionId === question.questionId;
						return (
							<div
								key={question.questionId}
								className={`edit-question-item ${isSelected ? "selected" : ""}`}
							>
								<div>
									<div className="edit-question-info-name">{question.displayName}</div>
									<div className="edit-question-info-id">id: {question.questionId}</div>
								</div>
								<button
									type="button"
									onClick={() => onSelect(question)}
									className="edit-load-button"
								>
									Load
								</button>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
};

export default QuestionSelector;
