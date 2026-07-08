const SPORT_LABELS: Record<string, string> = {
	soccer: "Soccer",
	baseball: "Baseball",
	basketball: "Basketball",
	football: "Football",
	hockey: "Hockey",
	tennis: "Tennis",
	mma: "MMA",
	golf: "Golf",
	racing: "Racing",
	cricket: "Cricket",
	esports_cs: "CS2",
	esports_valorant: "Valorant",
	esports_lol: "League of Legends",
	esports_dota: "Dota 2",
	esports: "Esports",
};

export function prettySportLabel(sport: string): string {
	return SPORT_LABELS[sport] ?? sport.replace(/_/g, " ");
}
