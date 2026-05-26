import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";

export interface TeamRecord {
	_id: string;
	displayName: string;
	slug: string;
	shortCode: string;
	pandaId: number;
	logoUrl?: string | null;
	backgroundUrl?: string | null;
	primaryColor?: string | null;
	secondaryColor?: string | null;
	createdAt?: string;
	updatedAt?: string;
}

export interface CreateTeamPayload {
	displayName: string;
	slug: string;
	shortCode: string;
	pandaId: number;
	logoUrl?: string | null;
	backgroundUrl?: string | null;
	primaryColor?: string | null;
	secondaryColor?: string | null;
}

export interface UpdateTeamPayload {
	displayName?: string;
	slug?: string;
	shortCode?: string;
	pandaId?: number;
	logoUrl?: string | null;
	backgroundUrl?: string | null;
	primaryColor?: string | null;
	secondaryColor?: string | null;
}

class TeamService {
	private readonly adminTeamsUrl: string;
	private readonly resolveUrl: string;
	private readonly publicTeamsUrl: string;

	constructor() {
		const base = getPredictionApiBaseUrl();
		this.adminTeamsUrl = `${base}/admin/teams`;
		this.resolveUrl = `${base}/admin/teams/resolve/pandascore`;
		this.publicTeamsUrl = `${base}/teams`;
	}

	private extractTeamFromJson(json: any): TeamRecord | null {
		if (!json || typeof json !== "object") {
			return null;
		}
		if (json.data && typeof json.data === "object") {
			return json.data as TeamRecord;
		}
		if (json.team && typeof json.team === "object") {
			return json.team as TeamRecord;
		}
		const possibleKeys = ["_id", "displayName", "slug", "shortCode", "pandaId"];
		const hasTeamShape = possibleKeys.every((key) => key in json);
		return hasTeamShape ? (json as TeamRecord) : null;
	}

	private extractTeamsFromJson(json: any): TeamRecord[] {
		if (!json || typeof json !== "object") {
			return [];
		}
		if (Array.isArray(json)) {
			return json as TeamRecord[];
		}
		if (Array.isArray(json.data)) {
			return json.data as TeamRecord[];
		}
		return [];
	}

	async lookupByShortCode(shortCode: string, accessToken: string): Promise<TeamRecord | null> {
		try {
			if (typeof shortCode !== "string" || shortCode.trim().length === 0) {
				throw new Error("Team short code is required for lookup");
			}
			if (typeof accessToken !== "string" || accessToken.length === 0) {
				throw new Error("Missing admin access token for team lookup");
			}
			const url = `${this.resolveUrl}?shortCode=${encodeURIComponent(shortCode)}`;
			const response = await fetch(url, {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			});
			if (response.status === 404) {
				return null;
			}
			if (!response.ok) {
				const json = await response.json().catch(() => ({}));
				const message =
					typeof (json as any).error === "string"
						? (json as any).error
						: `Team lookup failed with status ${response.status}`;
				throw new Error(message);
			}
			const json = await response.json().catch(() => ({}));
			return this.extractTeamFromJson(json);
		} catch (error) {
			console.error("error", error);
			throw error;
		}
	}

	async lookupByPandaId(pandaId: number, accessToken: string): Promise<TeamRecord | null> {
		try {
			if (typeof pandaId !== "number" || Number.isNaN(pandaId)) {
				throw new Error("pandaId is required for lookup");
			}
			if (typeof accessToken !== "string" || accessToken.length === 0) {
				throw new Error("Missing admin access token for team lookup");
			}
			const url = `${this.resolveUrl}?pandaId=${encodeURIComponent(String(pandaId))}`;
			const response = await fetch(url, {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			});
			if (response.status === 404) {
				return null;
			}
			if (!response.ok) {
				const json = await response.json().catch(() => ({}));
				const message =
					typeof (json as any).error === "string"
						? (json as any).error
						: `Team lookup failed with status ${response.status}`;
				throw new Error(message);
			}
			const json = await response.json().catch(() => ({}));
			return this.extractTeamFromJson(json);
		} catch (error) {
			console.error("error", error);
			throw error;
		}
	}

	async createTeam(payload: CreateTeamPayload, accessToken: string): Promise<TeamRecord> {
		try {
			if (typeof accessToken !== "string" || accessToken.length === 0) {
				throw new Error("Missing admin access token for team creation");
			}
			const response = await fetch(this.adminTeamsUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${accessToken}`,
				},
				body: JSON.stringify(payload),
			});
			const json = await response.json().catch(() => ({}));
			if (!response.ok) {
				const message =
					typeof json.error === "string"
						? json.error
						: `Team creation failed with status ${response.status}`;
				throw new Error(message);
			}
			const team = this.extractTeamFromJson(json);
			if (!team) {
				throw new Error("Team creation succeeded but response shape was unexpected.");
			}
			return team;
		} catch (error) {
			console.error("error", error);
			throw error;
		}
	}

	async fetchTeams(): Promise<TeamRecord[]> {
		try {
			const response = await fetch(this.publicTeamsUrl);
			const json = await response.json().catch(() => ({}));
			if (!response.ok) {
				const message =
					typeof json.error === "string"
						? json.error
						: `Team listing failed with status ${response.status}`;
				throw new Error(message);
			}
			return this.extractTeamsFromJson(json);
		} catch (error) {
			console.error("error", error);
			throw error;
		}
	}

	async fetchTeamById(teamId: string, accessToken?: string): Promise<TeamRecord | null> {
		try {
			if (typeof teamId !== "string" || teamId.length === 0) {
				throw new Error("Team ID is required for lookup");
			}
			const url = `${this.publicTeamsUrl}/${teamId}`;
			const response = await fetch(url, {
				headers:
					typeof accessToken === "string" && accessToken.length > 0
						? { Authorization: `Bearer ${accessToken}` }
						: undefined,
			});
			if (response.status === 404) {
				return null;
			}
			const json = await response.json().catch(() => ({}));
			if (!response.ok) {
				const message =
					typeof json.error === "string"
						? json.error
						: `Team fetch failed with status ${response.status}`;
				throw new Error(message);
			}
			return this.extractTeamFromJson(json);
		} catch (error) {
			console.error("error", error);
			throw error;
		}
	}

	async updateTeam(
		teamId: string,
		payload: UpdateTeamPayload,
		accessToken: string,
	): Promise<TeamRecord> {
		try {
			if (typeof teamId !== "string" || teamId.length === 0) {
				throw new Error("Team ID is required for update");
			}
			if (typeof accessToken !== "string" || accessToken.length === 0) {
				throw new Error("Missing admin access token for team update");
			}
			const url = `${this.adminTeamsUrl}/${teamId}`;
			const response = await fetch(url, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${accessToken}`,
				},
				body: JSON.stringify(payload),
			});
			const json = await response.json().catch(() => ({}));
			if (!response.ok) {
				const message =
					typeof json.error === "string"
						? json.error
						: `Team update failed with status ${response.status}`;
				throw new Error(message);
			}
			const team = this.extractTeamFromJson(json);
			if (!team) {
				throw new Error("Team update succeeded but response shape was unexpected.");
			}
			return team;
		} catch (error) {
			console.error("error", error);
			throw error;
		}
	}
}

export const teamService = new TeamService();
