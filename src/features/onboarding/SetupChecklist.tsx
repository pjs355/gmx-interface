import type { VenueSetupRow } from "./useFirstSignupSetup";
import "./FirstSignupSetupModal.scss";

/**
 * Three-row checklist: each row shows the venue label and a state icon.
 *
 *   - "in_progress" → small spinner.
 *   - "ready"       → check mark.
 *   - "pending"     → muted dot. Pending shouldn't last long; the
 *                     activators rush past their idle delay when the gate
 *                     is mounted (`onboardingActive: true`), so any row
 *                     that stays "pending" for more than a frame indicates
 *                     a prereq isn't satisfied (e.g. embedded wallet not
 *                     hydrated yet) and the activator will report
 *                     `setupInProgress: true` shortly.
 */
export function SetupChecklist({ rows }: { rows: VenueSetupRow[] }) {
	return (
		<ul className="first-signup-setup-modal__checklist">
			{rows.map((row) => (
				<li
					key={row.id}
					className="first-signup-setup-modal__row"
					data-state={row.state}
					data-qa={`setup-row-${row.id}`}
				>
					<span className="first-signup-setup-modal__row-icon" aria-hidden>
						{row.state === "ready" ? (
							<svg viewBox="0 0 16 16" className="first-signup-setup-modal__check">
								<path
									d="M3 8.5l3.2 3.2L13 4.7"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						) : row.state === "in_progress" ? (
							<span className="first-signup-setup-modal__spinner" />
						) : (
							<span className="first-signup-setup-modal__dot" />
						)}
					</span>
					<span className="first-signup-setup-modal__row-label">{row.label}</span>
				</li>
			))}
		</ul>
	);
}
