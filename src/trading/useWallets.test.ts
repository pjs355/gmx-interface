import { describe, expect, it } from "vitest";
import type { WalletDescriptor } from "@/types/trading";
import { overviewWalletIsEvmSmartWallet } from "./useWallets";

function firstSmartOverviewAddress(wallets: WalletDescriptor[]): string | undefined {
	const w = wallets.find(overviewWalletIsEvmSmartWallet);
	const a = typeof w?.address === "string" ? w.address.trim() : "";
	return a || undefined;
}

describe("overviewWalletIsEvmSmartWallet", () => {
	it("matches server AccountOverview shape walletType smart + chainFamily evm without kind", () => {
		const w: WalletDescriptor = {
			walletType: "smart",
			chainFamily: "evm",
			address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		};
		expect(overviewWalletIsEvmSmartWallet(w)).toBe(true);
	});

	it("matches walletType smart when chainFamily is omitted (server synthetic rows)", () => {
		const w: WalletDescriptor = {
			walletType: "smart",
			address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		};
		expect(overviewWalletIsEvmSmartWallet(w)).toBe(true);
	});

	it("rejects walletType smart on solana chainFamily", () => {
		const w: WalletDescriptor = {
			walletType: "smart",
			chainFamily: "solana",
			address: "SoLana111",
		};
		expect(overviewWalletIsEvmSmartWallet(w)).toBe(false);
	});

	it("matches legacy kind smart_wallet", () => {
		const w: WalletDescriptor = {
			kind: "smart_wallet",
			address: "0xcccccccccccccccccccccccccccccccccccccccc",
		};
		expect(overviewWalletIsEvmSmartWallet(w)).toBe(true);
	});

	it("matches legacy kind coinbase_smart_wallet", () => {
		const w: WalletDescriptor = {
			kind: "coinbase_smart_wallet",
			address: "0xdddddddddddddddddddddddddddddddddddddddd",
		};
		expect(overviewWalletIsEvmSmartWallet(w)).toBe(true);
	});

	it("matches evmSmartWallet role tag on evm row", () => {
		const w: WalletDescriptor = {
			chainFamily: "evm",
			walletRoleTags: ["evmSmartWallet"],
			address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		};
		expect(overviewWalletIsEvmSmartWallet(w)).toBe(true);
	});

	it("rejects embedded walletType", () => {
		const w: WalletDescriptor = {
			walletType: "embedded",
			chainFamily: "evm",
			address: "0xffffffffffffffffffffffffffffffffffffffff",
		};
		expect(overviewWalletIsEvmSmartWallet(w)).toBe(false);
	});

	it("picks trimmed address from first matching row", () => {
		const wallets: WalletDescriptor[] = [
			{ walletType: "embedded", chainFamily: "evm", address: "0x1111111111111111111111111111111111111111" },
			{ walletType: "smart", chainFamily: "evm", address: "  0x2222222222222222222222222222222222222222  " },
		];
		expect(firstSmartOverviewAddress(wallets)).toBe("0x2222222222222222222222222222222222222222");
	});
});
