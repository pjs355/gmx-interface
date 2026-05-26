export function shortenAddress(address: string, length: number): string {
	if (!address) return "";
	if (!length || address.length <= length) return address;
	const left = Math.max(2, Math.floor((length - 3) / 2));
	const right = length - (left + 3);
	return `${address.slice(0, left)}...${address.slice(-right)}`;
}
