/**
 * Remove leading catalog noise token `umbrella` — either as a separate word
 * (`umbrella Monte …`) or glued (`umbrellaMonte…`, `umbrellaCounter-Strike…`).
 */
export function stripUmbrellaDisplayPrefix(
	name: string | undefined | null
): string {
	if (!name) return "";
	let s = name.trim();
	if (!/^umbrella/i.test(s)) return s;
	s = s.replace(/^umbrella/i, "").trim();
	if (s.startsWith("-") || s.startsWith(":")) s = s.slice(1).trim();
	return s;
}

/** Block / row header: prefer catalog umbrella display, stripped of the `umbrella` prefix. */
export function umbrellaHeaderLabel(
	umbrellaLike: { displayName?: string | null } | null | undefined,
): string {
	return stripUmbrellaDisplayPrefix(umbrellaLike?.displayName ?? "").trim();
}

/** Map en dash, em dash, minus sign to ASCII hyphen so VS-core parsing can terminate after team B. */
function normalizeVsTitleDashes(s: string): string {
	return s
		.replace(/\u2013/g, "-")
		.replace(/\u2014/g, "-")
		.replace(/\u2212/g, "-");
}

function splitVsCoreTeams(core: string): [string, string] | null {
	const parts = core.split(/\s+vs\s+/);
	if (parts.length !== 2) return null;
	const left = parts[0]!.trim();
	const right = parts[1]!.trim();
	if (!left || !right) return null;
	return [left, right];
}

/** Same roster, different roster strings (e.g. "MIBR" vs "MIBR Academy", sponsor suffixes). */
function vsTeamTokensLooselyMatch(a: string, b: string): boolean {
	const x = a.trim().toLowerCase();
	const y = b.trim().toLowerCase();
	if (!x || !y) return false;
	if (x === y) return true;
	if (x.includes(y) || y.includes(x)) return true;
	return false;
}

function vsCoresTeamPairsMatch(coreA: string, coreB: string): boolean {
	const pa = splitVsCoreTeams(coreA);
	const pb = splitVsCoreTeams(coreB);
	if (!pa || !pb) return false;
	const [a1, a2] = pa;
	const [b1, b2] = pb;
	return (
		(vsTeamTokensLooselyMatch(a1, b1) && vsTeamTokensLooselyMatch(a2, b2)) ||
		(vsTeamTokensLooselyMatch(a1, b2) && vsTeamTokensLooselyMatch(a2, b1))
	);
}

/**
 * Extracts the "TeamA vs TeamB" core from a market title, stripping game
 * prefixes (e.g. "Counter-Strike: "), tournament suffixes, BO tags, etc.
 * Returns null for non-VS titles.
 */
export function extractVsCore(title: string): string | null {
	const lower = normalizeVsTitleDashes(title).toLowerCase();
	const noPrefix = lower.replace(/^[^:]+:\s*/, "");
	const m = noPrefix.match(/^(.+?)\s+vs\.?\s+(.+?)(?:\s*[\(\-\?]|$)/);
	if (!m) return null;
	return `${m[1].trim()} vs ${m[2].trim()}`;
}

/**
 * Checks whether an umbrella display-name and a venue market title refer
 * to the same event.  Uses three strategies:
 *   1. Full substring match
 *   2. Substring match after stripping parenthetical content
 *   3. VS-core equality (e.g. "ecstatic vs ursa" from both sides)
 *   4. VS-core loose team match (e.g. "mibr vs vexa" vs "mibr academy vs vexa")
 */
export function titlesMatchVenue(umbrellaName: string, venueTitle: string): boolean {
	const a = umbrellaName.toLowerCase();
	const b = venueTitle.toLowerCase();
	if (b.includes(a) || a.includes(b.replace(/\s*\(.*\)/, ""))) return true;
	const coreA = extractVsCore(umbrellaName);
	const coreB = extractVsCore(venueTitle);
	if (coreA && coreB) {
		if (coreA === coreB) return true;
		if (vsCoresTeamPairsMatch(coreA, coreB)) return true;
	}
	return false;
}

/**
 * When no LevelUp umbrella is in the loaded catalog and the monitor has no Predict keys,
 * show a compact label instead of the full Predict.fun question (game prefix + BO tag).
 */
export function shortPredictFunMarketTitleForPortfolio(
	raw: string | undefined | null,
): string {
	const t = (raw ?? "").trim();
	if (!t) return "";
	/** e.g. "Will Team Nemesis win the Heroic vs. Team Nemesis CS2 match?" → match line */
	const predictWinner = t.match(
		/\bwin\s+the\s+(.+?)\s+(?:CS2\s+)?match\??\s*$/i,
	);
	if (predictWinner?.[1]) {
		const inner = predictWinner[1].replace(/\s+/g, " ").trim();
		if (inner.length >= 3 && inner.length <= 160) {
			return stripUmbrellaDisplayPrefix(inner).trim() || inner;
		}
	}
	let s = t.replace(/^(?:[^:]+:\s*)+/i, "");
	s = s.replace(/\s*\(\s*bo[0-9]+\s*\)/gi, "");
	s = normalizeVsTitleDashes(s).replace(/\s+/g, " ").trim();
	return s || t;
}
