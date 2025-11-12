import type { UmbrellaTeamMapping } from "@/services/api/umbrellaDataService";

export interface TeamColors {
	yesColor?: string;
	noColor?: string;
}

export type AddMarketForm = {
	oracle: string;
	seedAmount: string;
	selectedUmbrellaId?: string;
	umbrellaDisplayName: string;
	umbrellaRule: string;
	isEvent: boolean;
	eventDate?: string;
	endDate?: string;
	image1Url?: string;
	image2Url?: string;
	status: boolean;
	streamEnabled: boolean;
	streamUrl: string;
	game: string;
	pandascore_matchId: string;
};

export interface SeriesTeamInfo {
	id: number | null;
	name: string;
	acronym?: string | null;
}

export interface SeriesMatch {
	id: number;
	name: string;
	scheduledAt: string | null;
	team1: SeriesTeamInfo;
	team2: SeriesTeamInfo;
}

export interface SeriesData {
	name: string;
	game: string;
}

export interface AddMarketProps {
	series?: SeriesData;
	match?: SeriesMatch;
	onCreated?: (createdData: any) => void | Promise<void>;
}

export type TeamCandidate = {
	displayName: string;
	slug: string;
	shortCode: string | null;
	pandaId: number | null | undefined;
	logoUrl?: string | null;
};

export type QuestionDetails = {
	_id?: string;
	questionId: string;
	question?: string;
	displayName?: string;
	oracle?: string;
	conditionId?: string;
	yesTokenId?: string;
	noTokenId?: string;
	seedAmount?: string;
	registered?: boolean;
	registrationTxHash?: string;
	creationTxHash?: string;
	yesColor?: string;
	noColor?: string;
	tagIds?: string[];
};

export interface UmbrellaUpdatePayload {
	displayName?: string;
	rule?: string;
	active: boolean;
	streamEnabled: boolean;
	streamUrl?: string;
	eventDate: string | null;
	endDate: string | null;
	image1Url?: string | null;
	image2Url?: string | null;
	teamMappings?: UmbrellaTeamMapping[];
}

export interface TeamMappingPayload {
	teamId?: string;
	shortCode?: string | null;
	pandaId?: number | null;
	slug?: string;
	displayName?: string;
}

export interface CreateMarketRequestPayload {
	oracle: string;
	seedAmount: string;
	umbrellaId?: string;
	umbrellaDisplayName?: string;
	umbrellaRule?: string;
	rule?: string;
	isEvent: boolean;
	eventDate?: string | null;
	endDate?: string | null;
	status: boolean;
	streamEnabled: boolean;
	streamUrl?: string;
	game?: string;
	pandascore_matchId?: string;
	image1Url?: string;
	image2Url?: string;
	questions?: Array<{
		displayName?: string;
		tagIds?: string[];
		yesColor?: string;
		noColor?: string;
	}>;
	teamMappings?: TeamMappingPayload[];
}
