export interface ButtonStateResult {
	text: string;
	disabled: boolean;
	onClick: () => void;
	/** Shown under the deposit CTA when SOR buy needs more cash. */
	depositShortfallUsd?: number;
	isSweepingBook?: boolean;
	availableShares?: number;
}
