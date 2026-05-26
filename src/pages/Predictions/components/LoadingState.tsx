import React from "react";
import Button from "components/Button/Button";
import SpinningLoader from "components/Common/SpinningLoader";

interface LoadingStateProps {
	error: string | null;
	onRetry: () => void;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ error, onRetry }) => {
	if (error) {
		return (
			<div className="predictions-page">
				<div className="predictions-header">
					<h1>Prediction Markets</h1>
				</div>
				<div className="error-message">
					<p>Error loading umbrellas: {error}</p>
					<Button variant="primary" onClick={onRetry}>
						Retry
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div
			className="predictions-page"
			style={{
				display: "flex",
				justifyContent: "center",
				alignItems: "center",
				minHeight: "100vh",
				backgroundColor: "#000",
				color: "#fff",
			}}
			aria-label="Loading"
			role="status"
		>
			<SpinningLoader size="2rem" />
		</div>
	);
};
