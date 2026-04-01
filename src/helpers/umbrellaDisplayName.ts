/** Remove leading "umbrella" token some catalogs embed in display names (e.g. `umbrellaGTA VI…`). */
export function stripUmbrellaDisplayPrefix(
	name: string | undefined | null
): string {
	if (!name) return "";
	return name.replace(/^umbrella\s*/i, "").trim();
}
