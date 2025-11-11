const TEAM_LOGO_MAP: Record<string, string> = {
	"500": new URL("../assets/team-logos/500_500.webp", import.meta.url).href,
	AAB: new URL("../assets/team-logos/aab_aab.webp", import.meta.url).href,
	ALL: new URL("../assets/team-logos/alliance_all.webp", import.meta.url)
		.href,
	ARC: new URL("../assets/team-logos/arcred_arc.webp", import.meta.url).href,
	BCA: new URL("../assets/team-logos/betclic_bca.webp", import.meta.url).href,
	CW: new URL("../assets/team-logos/copenhagenwolves_cw.svg", import.meta.url)
		.href,
	CS: new URL("../assets/team-logos/cybershoke_cs.webp", import.meta.url)
		.href,
	DNE: new URL("../assets/team-logos/dynamoeclot_dne.webp", import.meta.url)
		.href,
	EYE: new URL("../assets/team-logos/eyeballers_eye.webp", import.meta.url)
		.href,
	FAL: new URL("../assets/team-logos/falcons_fal.webp", import.meta.url).href,
	FORZER: new URL("../assets/team-logos/forze_fzr.webp", import.meta.url)
		.href,
	FZR: new URL("../assets/team-logos/forze_fzr.webp", import.meta.url).href,
	FURIA: new URL("../assets/team-logos/furia_furia.svg", import.meta.url)
		.href,
	FUTA: new URL("../assets/team-logos/futacademy_futa.webp", import.meta.url)
		.href,
	JJH: new URL("../assets/team-logos/jijihao_jjh.webp", import.meta.url).href,
	JS: new URL("../assets/team-logos/johnnyspeeds_js.webp", import.meta.url)
		.href,
	LILMIX: new URL("../assets/team-logos/lilmix_lilmix.png", import.meta.url)
		.href,
	MEGO: new URL("../assets/team-logos/megoshort_mego.svg", import.meta.url)
		.href,
	MZP: new URL("../assets/team-logos/metizport_mzp.webp", import.meta.url)
		.href,
	MGLZ: new URL("../assets/team-logos/mongolz_mglz.webp", import.meta.url)
		.href,
	NXS: new URL("../assets/team-logos/nexus_nxs.webp", import.meta.url).href,
	NVQ: new URL("../assets/team-logos/novaq_nvq.webp", import.meta.url).href,
	ORM: new URL("../assets/team-logos/oramond.webp", import.meta.url).href,
	PAIN: new URL("../assets/team-logos/pain_pain.svg", import.meta.url).href,
	PAR: new URL("../assets/team-logos/partizan_par.webp", import.meta.url)
		.href,
	PSSNUA: new URL(
		"../assets/team-logos/passionua_passnua.webp",
		import.meta.url
	).href,
	SNG: new URL("../assets/team-logos/sangal_sng.webp", import.meta.url).href,
	SL: new URL("../assets/team-logos/southernlights_sl.svg", import.meta.url)
		.href,
	SPARTA: new URL("../assets/team-logos/sparta_sparta.webp", import.meta.url)
		.href,
	TS: new URL("../assets/team-logos/spirit_ts.webp", import.meta.url).href,
	TPU: new URL("../assets/team-logos/tpudcatb_tpu.webp", import.meta.url)
		.href,
	TYLOO: new URL("../assets/team-logos/tyloo_tyloo.svg", import.meta.url)
		.href,
	VIT: new URL("../assets/team-logos/vitality_vit.webp", import.meta.url)
		.href,
};

const TEAM_CODE_REGEX = /\(([^)]+)\)/g;

export function extractTeamCodesFromTitle(title: string): string[] {
	if (typeof title !== "string" || title.length === 0) {
		return [];
	}
	const codes: string[] = [];
	let match: RegExpExecArray | null;
	while ((match = TEAM_CODE_REGEX.exec(title)) !== null) {
		const code = match[1].replace(/\./g, "").trim().toUpperCase();
		if (code.length > 0) {
			codes.push(code);
		}
	}
	return codes;
}

export function resolveTeamLogo(code: string | null | undefined) {
	if (!code) {
		return undefined;
	}
	const normalized = code.replace(/\./g, "").trim().toUpperCase();
	return TEAM_LOGO_MAP[normalized];
}

export function resolveLogosFromTitle(title: string) {
	const codes = extractTeamCodesFromTitle(title);
	return codes.map((code) => ({
		code,
		logo: resolveTeamLogo(code),
	}));
}

export { TEAM_LOGO_MAP };
