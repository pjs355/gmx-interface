import { useCallback, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
	teamService,
	type TeamRecord,
	type UpdateTeamPayload,
} from "@/services/api/teamService";
import "./TeamsAdmin.scss";
import {
	adminErrorMessage,
	formatAdminErrorForUser,
	ADMIN_MISSING_ACCESS_TOKEN,
	ADMIN_TEAM_DISPLAY_NAME_REQUIRED,
	ADMIN_TEAM_PANDASCORE_ID_NUMBER,
	ADMIN_TEAM_PANDASCORE_ID_REQUIRED,
	ADMIN_TEAM_SHORT_CODE_REQUIRED,
	ADMIN_TEAM_SLUG_REQUIRED,
	ADMIN_TEAM_UPDATE_FAILED,
	ADMIN_OPERATION_FAILED,
} from "@/errors";

interface EditTeamProps {
	team: TeamRecord;
	onBack: () => void;
	onSaved: (team: TeamRecord) => void;
}

interface EditableTeamForm {
	displayName: string;
	slug: string;
	shortCode: string;
	pandaId: string;
	primaryColor: string;
	secondaryColor: string;
	backgroundUrl: string;
	logoUrl: string;
}

function buildEditableForm(team: TeamRecord): EditableTeamForm {
	return {
		displayName: team.displayName,
		slug: team.slug,
		shortCode: team.shortCode,
		pandaId: String(team.pandaId),
		primaryColor: team.primaryColor ?? "",
		secondaryColor: team.secondaryColor ?? "",
		backgroundUrl: team.backgroundUrl ?? "",
		logoUrl: team.logoUrl ?? "",
	};
}

export default function EditTeam({ team, onBack, onSaved }: EditTeamProps) {
	const { getAccessToken } = usePrivy();
	const [form, setForm] = useState<EditableTeamForm>(() =>
		buildEditableForm(team)
	);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	const isDirty = useMemo(() => {
		const baseline = buildEditableForm(team);
		return (
			baseline.displayName !== form.displayName ||
			baseline.slug !== form.slug ||
			baseline.shortCode !== form.shortCode ||
			baseline.pandaId !== form.pandaId ||
			baseline.primaryColor !== form.primaryColor ||
			baseline.secondaryColor !== form.secondaryColor ||
			baseline.backgroundUrl !== form.backgroundUrl ||
			baseline.logoUrl !== form.logoUrl
		);
	}, [form, team]);

	const updateField = useCallback(
		<T extends keyof EditableTeamForm>(key: T, value: EditableTeamForm[T]) => {
			setForm((prev) => ({ ...prev, [key]: value }));
		},
		[]
	);

	const handleReset = useCallback(() => {
		setForm(buildEditableForm(team));
		setError(null);
		setSuccess(null);
	}, [team]);

	const handleSubmit = useCallback(async () => {
		setSaving(true);
		setError(null);
		setSuccess(null);
		try {
			const token =
				typeof getAccessToken === "function"
					? await getAccessToken()
					: null;
			if (typeof token !== "string" || token.length === 0) {
				throw new Error(adminErrorMessage(ADMIN_MISSING_ACCESS_TOKEN));
			}

			if (form.displayName.trim().length === 0) {
				throw new Error(adminErrorMessage(ADMIN_TEAM_DISPLAY_NAME_REQUIRED));
			}
			if (form.slug.trim().length === 0) {
				throw new Error(adminErrorMessage(ADMIN_TEAM_SLUG_REQUIRED));
			}
			if (form.shortCode.trim().length === 0) {
				throw new Error(adminErrorMessage(ADMIN_TEAM_SHORT_CODE_REQUIRED));
			}
			const trimmedPandaId = form.pandaId.trim();
			if (trimmedPandaId.length === 0) {
				throw new Error(adminErrorMessage(ADMIN_TEAM_PANDASCORE_ID_REQUIRED));
			}
			const parsedPanda = Number.parseInt(trimmedPandaId, 10);
			if (Number.isNaN(parsedPanda)) {
				throw new Error(adminErrorMessage(ADMIN_TEAM_PANDASCORE_ID_NUMBER));
			}

			const payload: UpdateTeamPayload = {};
			if (team.displayName !== form.displayName) {
				payload.displayName = form.displayName.trim();
			}
			if (team.slug !== form.slug) {
				payload.slug = form.slug.trim();
			}
			if (team.shortCode !== form.shortCode) {
				payload.shortCode = form.shortCode.trim();
			}
			if (team.pandaId !== parsedPanda) {
				payload.pandaId = parsedPanda;
			}
			const trimmedPrimary = form.primaryColor.trim();
			if ((team.primaryColor ?? "") !== trimmedPrimary) {
				payload.primaryColor = trimmedPrimary.length === 0 ? null : trimmedPrimary;
			}
			const trimmedSecondary = form.secondaryColor.trim();
			if ((team.secondaryColor ?? "") !== trimmedSecondary) {
				payload.secondaryColor =
					trimmedSecondary.length === 0 ? null : trimmedSecondary;
			}
			const trimmedBackground = form.backgroundUrl.trim();
			if ((team.backgroundUrl ?? "") !== trimmedBackground) {
				payload.backgroundUrl =
					trimmedBackground.length === 0 ? null : trimmedBackground;
			}
			const trimmedLogo = form.logoUrl.trim();
			if ((team.logoUrl ?? "") !== trimmedLogo) {
				payload.logoUrl = trimmedLogo.length === 0 ? null : trimmedLogo;
			}

			if (Object.keys(payload).length === 0) {
				setSuccess("No changes to save");
				setSaving(false);
				return;
			}

			const updated = await teamService.updateTeam(team._id, payload, token);
			onSaved(updated);
			setSuccess("Team updated");
		} catch (err: unknown) {
			console.error("error", err);
			const msg = formatAdminErrorForUser(err);
			setError(
				msg === adminErrorMessage(ADMIN_OPERATION_FAILED)
					? adminErrorMessage(ADMIN_TEAM_UPDATE_FAILED)
					: msg,
			);
		} finally {
			setSaving(false);
		}
	}, [form, getAccessToken, onSaved, team]);

	return (
		<div className="teams-admin">
			<div className="teams-admin__header">
				<h2 className="teams-admin__title">Edit Team</h2>
				<div className="teams-admin__header-actions">
					<button
						type="button"
						onClick={onBack}
						className="teams-admin__back-button"
					>
						Back
					</button>
				</div>
			</div>
			<div className="teams-admin__form-grid">
				<label className="teams-admin__field-label">
					<span>Display Name</span>
					<input
						value={form.displayName}
						onChange={(event) =>
							updateField("displayName", event.target.value)
						}
						className="teams-admin__input teams-admin__input--wide"
					/>
				</label>
				<label className="teams-admin__field-label">
					<span>Slug</span>
					<input
						value={form.slug}
						onChange={(event) => updateField("slug", event.target.value)}
						className="teams-admin__input"
					/>
				</label>
				<label className="teams-admin__field-label">
					<span>Short Code</span>
					<input
						value={form.shortCode}
						onChange={(event) =>
							updateField("shortCode", event.target.value)
						}
						className="teams-admin__input"
					/>
				</label>
				<label className="teams-admin__field-label">
					<span>PandaScore ID</span>
					<input
						value={form.pandaId}
						onChange={(event) => updateField("pandaId", event.target.value)}
						disabled
						className="teams-admin__input teams-admin__input--disabled"
					/>
				</label>
				<label className="teams-admin__field-label">
					<span>Primary Color</span>
					<input
						value={form.primaryColor}
						onChange={(event) =>
							updateField("primaryColor", event.target.value)
						}
						className="teams-admin__input"
						placeholder="#000000"
					/>
				</label>
				<label className="teams-admin__field-label">
					<span>Secondary Color</span>
					<input
						value={form.secondaryColor}
						onChange={(event) =>
							updateField("secondaryColor", event.target.value)
						}
						className="teams-admin__input"
						placeholder="#ffffff"
					/>
				</label>
				<label className="teams-admin__field-label">
					<span>Background URL</span>
					<input
						value={form.backgroundUrl}
						onChange={(event) =>
							updateField("backgroundUrl", event.target.value)
						}
						className="teams-admin__input teams-admin__input--wide"
						placeholder="https://..."
					/>
				</label>
				<label className="teams-admin__field-label">
					<span>Logo URL</span>
					<input
						value={form.logoUrl}
						onChange={(event) => updateField("logoUrl", event.target.value)}
						className="teams-admin__input teams-admin__input--wide"
						placeholder="https://..."
					/>
				</label>
			</div>

			{error && (
				<div className="teams-admin__status teams-admin__status--error">
					{error}
				</div>
			)}
			{success && (
				<div className="teams-admin__status teams-admin__status--success">
					{success}
				</div>
			)}

			<div className="teams-admin__actions-row">
				<button
					type="button"
					onClick={handleSubmit}
					disabled={saving || !isDirty}
					className="teams-admin__primary-btn"
				>
					{saving ? "Saving…" : "Save changes"}
				</button>
				<button
					type="button"
					onClick={handleReset}
					disabled={saving || !isDirty}
					className="teams-admin__secondary-btn"
				>
					Reset
				</button>
			</div>
		</div>
	);
}
