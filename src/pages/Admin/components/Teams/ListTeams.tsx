import { useEffect, useState } from "react";
import { teamService, type TeamRecord } from "@/services/api/teamService";
import "./scss/TeamsAdmin.scss";

interface ListTeamsProps {
	onEdit: (team: TeamRecord) => void;
	refreshKey?: number;
}

export default function ListTeams({ onEdit, refreshKey }: ListTeamsProps) {
	const [teams, setTeams] = useState<TeamRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		async function loadTeams() {
			setLoading(true);
			setError(null);
			try {
				const fetched = await teamService.fetchTeams();
				if (!cancelled) {
					setTeams(fetched);
				}
			} catch (err) {
				console.error("error", err);
				if (!cancelled) {
					setError(err instanceof Error ? err.message : "Failed to load teams");
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		}
		void loadTeams();
		return () => {
			cancelled = true;
		};
	}, [refreshKey]);

	return (
		<div className="teams-admin">
			<div className="teams-admin__header">
				<h2 className="teams-admin__title">Teams</h2>
			</div>
			{loading && <div className="teams-admin__status">Loading teams…</div>}
			{!loading && error && (
				<div className="teams-admin__status teams-admin__status--error">{error}</div>
			)}
			{!loading && !error && teams.length === 0 && (
				<div className="teams-admin__status">No teams found.</div>
			)}
			{!loading && !error && teams.length > 0 && (
				<div className="teams-admin__table-wrapper">
					<table className="teams-admin__table">
						<thead>
							<tr>
								<th>Name</th>
								<th>Short Code</th>
								<th>PandaScore ID</th>
								<th>Primary</th>
								<th>Secondary</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{teams.map((team) => (
								<tr key={team._id}>
									<td>{team.displayName}</td>
									<td>{team.shortCode}</td>
									<td>{team.pandaId}</td>
									<td>
										<div className="teams-admin__color-chip">
											<span>{team.primaryColor ?? "—"}</span>
											{team.primaryColor && (
												<span
													className="teams-admin__color-swatch"
													style={{
														backgroundColor: team.primaryColor,
													}}
												/>
											)}
										</div>
									</td>
									<td>
										<div className="teams-admin__color-chip">
											<span>{team.secondaryColor ?? "—"}</span>
											{team.secondaryColor && (
												<span
													className="teams-admin__color-swatch"
													style={{
														backgroundColor: team.secondaryColor,
													}}
												/>
											)}
										</div>
									</td>
									<td>
										<button
											type="button"
											onClick={() => onEdit(team)}
											className="teams-admin__link"
										>
											Edit
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
