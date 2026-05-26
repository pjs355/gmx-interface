import type { SeriesMatch } from "@/types/market-types";
import type { AddMarketForm, CreateMarketRequestPayload } from "@/types/market-types";
import type { TeamRecord } from "@/services/api/teamService";
import type { QuestionEntry } from "../MarketQuestions";

export const slugify = (value: string): string =>
	value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

export const formatDateTimeLocal = (isoString: string | null | undefined): string => {
	if (typeof isoString !== "string" || isoString.length === 0) {
		return "";
	}
	const date = new Date(isoString);
	const pad = (value: number) => {
		const text = String(value);
		if (text.length >= 2) {
			return text;
		}
		return `0${text}`;
	};
	const year = String(date.getFullYear());
	const month = pad(date.getMonth() + 1);
	const day = pad(date.getDate());
	const hours = pad(date.getHours());
	const minutes = pad(date.getMinutes());
	return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export const addHoursAndFormat = (
	isoString: string | null | undefined,
	hoursToAdd: number,
): string => {
	if (typeof isoString !== "string" || isoString.length === 0) {
		return "";
	}
	if (typeof hoursToAdd !== "number" || Number.isNaN(hoursToAdd)) {
		return "";
	}
	const originalDate = new Date(isoString);
	const milliseconds = originalDate.getTime();
	if (Number.isNaN(milliseconds)) {
		return "";
	}
	const offsetMilliseconds = hoursToAdd * 60 * 60 * 1000;
	const adjustedDate = new Date(milliseconds + offsetMilliseconds);
	return formatDateTimeLocal(adjustedDate.toISOString());
};

export const cleanTeamName = (teamName: string): string => {
	const openParenIndex = teamName.indexOf("(");
	if (openParenIndex === -1) {
		return teamName.trim();
	}
	return teamName.substring(0, openParenIndex).trim();
};

export const extractTeamKey = (teamName: string, acronym?: string | null): string | null => {
	const acronymValue = typeof acronym === "string" ? acronym.trim() : undefined;
	if (acronymValue && acronymValue.length > 0) {
		return acronymValue.replace(/\./g, "").trim().toUpperCase();
	}
	const matchKey = teamName.match(/\(([^)]+)\)/);
	if (!matchKey) {
		return null;
	}
	const normalized = matchKey[1]?.replace(/\./g, "").trim();
	if (!normalized || normalized.length === 0) {
		return null;
	}
	return normalized.toUpperCase();
};

export const getTeamCode = (team: Pick<SeriesMatch["team1"], "name" | "acronym">): string => {
	const key = extractTeamKey(team.name, team.acronym);
	if (key) {
		return key;
	}
	return cleanTeamName(team.name);
};

export const normalizeTeamKey = (value?: string | null): string | null => {
	if (!value) {
		return null;
	}
	return value.replace(/\./g, "").trim().toUpperCase();
};

export const buildLongMatchDisplayName = (match: SeriesMatch): string => {
	const team1Name = cleanTeamName(match.team1.name);
	const team2Name = cleanTeamName(match.team2.name);
	return `${team1Name} vs ${team2Name}`;
};

export const buildShortMatchDisplayName = (match: SeriesMatch): string => {
	const team1Code = getTeamCode(match.team1);
	const team2Code = getTeamCode(match.team2);
	return `${team1Code} vs ${team2Code}`;
};

export interface BuildCreateMarketPayloadArgs {
	form: AddMarketForm;
	questions: QuestionEntry[];
	linkedTeams: Record<string, TeamRecord>;
	image1: File | null;
	image2: File | null;
	uploadImage: (file: File, type: "image1" | "image2") => Promise<string>;
}

export const buildCreateMarketPayload = async ({
	form,
	questions,
	linkedTeams,
	image1,
	image2,
	uploadImage,
}: BuildCreateMarketPayloadArgs): Promise<CreateMarketRequestPayload> => {
	let seedAmount = form.seedAmount;
	if (!seedAmount || seedAmount.length === 0) {
		seedAmount = "0";
	}
	const payload: CreateMarketRequestPayload = {
		oracle: form.oracle,
		seedAmount,
		isEvent: Boolean(form.isEvent),
		status: form.status,
		streamEnabled: form.streamEnabled,
	};

	const umbrellaId = form.selectedUmbrellaId;
	if (umbrellaId && umbrellaId.length > 0) {
		payload.umbrellaId = umbrellaId;
	} else {
		const umbrellaDisplayName = form.umbrellaDisplayName;
		if (umbrellaDisplayName && umbrellaDisplayName.length > 0) {
			payload.umbrellaDisplayName = umbrellaDisplayName;
		}
		const umbrellaRule = form.umbrellaRule;
		if (umbrellaRule && umbrellaRule.length > 0) {
			payload.umbrellaRule = umbrellaRule;
			payload.rule = umbrellaRule;
		}
	}

	if (form.isEvent) {
		const eventDate = form.eventDate;
		if (eventDate && eventDate.length > 0) {
			payload.eventDate = new Date(eventDate).toISOString();
		}
		const endDate = form.endDate;
		if (endDate && endDate.length > 0) {
			payload.endDate = new Date(endDate).toISOString();
		}
	}

	const streamUrl = form.streamUrl;
	if (streamUrl && streamUrl.length > 0) {
		payload.streamUrl = streamUrl;
	}

	const game = form.game;
	if (game && game.length > 0) {
		payload.game = game;
	}

	const matchId = form.pandascore_matchId;
	if (matchId && matchId.length > 0) {
		payload.pandascore_matchId = matchId;
	}

	if (image1) {
		const uploadedImage1 = await uploadImage(image1, "image1");
		payload.image1Url = uploadedImage1;
	}

	if (image2) {
		const uploadedImage2 = await uploadImage(image2, "image2");
		payload.image2Url = uploadedImage2;
	}

	if (questions.length > 0) {
		payload.questions = questions.map((question) => {
			return {
				displayName: question.displayName,
				tagIds: question.tagIds,
				yesColor: question.yesColor,
				noColor: question.noColor,
			};
		});
	}

	const linkedTeamEntries = Object.values(linkedTeams);
	if (linkedTeamEntries.length > 0) {
		payload.teamMappings = linkedTeamEntries.map((team) => {
			return {
				teamId: team._id,
				shortCode: team.shortCode,
				pandaId: team.pandaId,
				slug: team.slug,
				displayName: team.displayName,
			};
		});
	}

	return payload;
};
