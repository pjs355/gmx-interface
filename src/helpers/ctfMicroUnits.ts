/** CTF outcome ERC1155 balances use 6 decimals (micro-units) as raw uint256. */
export function fromMicroUnits(value: string): string {
	const num = BigInt(value);
	const divisor = BigInt(1_000_000);
	const integer = num / divisor;
	const remainder = num % divisor;
	const decimalStr = remainder.toString().padStart(6, "0");
	return `${integer}.${decimalStr}`;
}
