/** Align YES/NO token id strings across Limitless API + Mongo (same as predictions server). */
export function canonicalLimitlessTokenId(raw: string): string {
	const s = raw.trim();
	if (!s) return s;
	if (/^-?\d+$/.test(s)) {
		try {
			return BigInt(s).toString();
		} catch {
			return s;
		}
	}
	if (/^0x[0-9a-fA-F]+$/i.test(s)) {
		try {
			return BigInt(s).toString();
		} catch {
			return s.toLowerCase();
		}
	}
	return s;
}
