import type { SorChain, SorVenue } from "@/features/trading/sor/core/sor-types";
import type { PredictAccountResponse } from "@/services/privateApi/client";
import type { AccountOverview, PolymarketAccountResponse, WalletDescriptor } from "@/types/trading";
import {
	findEvmPrivyEmbeddedWallet,
	type PrivyWalletListEntry,
} from "@/features/trading/venues/polymarket/wallet/privyEmbeddedWallet";

/** Optional wallet roles before the account wallet gate is ready. */
export type AccountWalletRolesPartial = {
	baseSmartWallet: string | undefined;
	limitlessMakerBase: string | undefined;
	/** Privy embedded EOA — signs on Polygon / BNB; Limitless maker. */
	embeddedEoa: string | undefined;
	polymarketSafe: string | undefined;
	/** Polygon Polymarket signer EOA (usually same as {@link embeddedEoa}). */
	polygonSigner: string | undefined;
	/** Predict.fun maker / deposit (kernel or EOA). */
	predictMaker: string | undefined;
	solanaAddress: string | undefined;
};

/** All core wallet roles required for trading / quoting / Li.FI. */
export type AccountWalletRoles = {
	baseSmartWallet: string;
	limitlessMakerBase: string;
	embeddedEoa: string;
	polymarketSafe: string;
	polygonSigner: string;
	predictMaker: string;
	solanaAddress: string;
};

export type AccountWalletGateStatus = "loading" | "ready" | "blocked";

export type AccountWalletGate =
	| { status: "loading"; message: string }
	| { status: "blocked"; message: string }
	| { status: "ready"; message: null };

export type VenueAddressChainEntry = {
	venue: SorVenue;
	chain: SorChain;
	/**
	 * Collateral / maker / deposit address on {@link chain} (where venue balance sits).
	 * May differ from {@link signerAddress} (e.g. Polymarket deposit wallet, Predict kernel).
	 */
	walletAddress: string;
	/** Privy or venue EOA that signs txs and order auth on {@link chain}. */
	signerAddress: string;
};

/** Venue → chain + wallet + signer. Single canonical address map on {@link AccountData}. */
export type VenueAddressChainMap = Record<SorVenue, VenueAddressChainEntry>;

const EVM_RE = /^0x[a-fA-F0-9]{40}$/;

const VENUE_CHAIN: Record<SorVenue, SorChain> = {
	levelup: "base",
	limitless: "base",
	polymarket: "polygon",
	predictfun: "bnb",
	dflow: "solana",
};

type WalletRole = keyof AccountWalletRoles;

const ROLE_LABEL: Record<WalletRole, string> = {
	baseSmartWallet: "Base smart wallet",
	limitlessMakerBase: "Limitless maker wallet",
	embeddedEoa: "Privy embedded EOA",
	polymarketSafe: "Polymarket deposit wallet",
	polygonSigner: "Polymarket Polygon signer",
	predictMaker: "Predict.fun maker wallet",
	solanaAddress: "Solana wallet",
};

export function overviewWalletIsEvmSmartWallet(w: WalletDescriptor): boolean {
	const kind = String(w.kind ?? "").toLowerCase();
	if (kind === "smart_wallet" || kind === "coinbase_smart_wallet") return true;

	const ext = w as WalletDescriptor & {
		walletType?: string;
		walletRoleTags?: readonly string[];
	};
	const chainFamily = String(w.chainFamily ?? "").toLowerCase();
	if (chainFamily === "solana") return false;

	const wt = String(ext.walletType ?? "").toLowerCase();
	if (wt === "smart") return true;

	const tags = ext.walletRoleTags;
	if (!Array.isArray(tags)) return false;
	return tags.some((t) => String(t) === "evmSmartWallet");
}

function readSmartWalletFromUser(user: unknown): string | undefined {
	const linked = (user as { linkedAccounts?: unknown[] } | null)?.linkedAccounts;
	if (!Array.isArray(linked)) return undefined;
	const smart = linked.find((a) => (a as { type?: string })?.type === "smart_wallet") as
		| { address?: string }
		| undefined;
	return smart?.address;
}

function readSolanaAddressFromUser(user: unknown): string | undefined {
	const linked = (user as { linkedAccounts?: unknown[] } | null)?.linkedAccounts;
	if (!Array.isArray(linked)) return undefined;
	const sol = linked.find(
		(a) =>
			(a as { type?: string; chainType?: string })?.type === "wallet" &&
			(a as { chainType?: string })?.chainType === "solana",
	) as { address?: string } | undefined;
	return typeof sol?.address === "string" && sol.address.trim() ? sol.address.trim() : undefined;
}

export type NormalizeWalletRolesInput = {
	user: unknown;
	privyWallets: readonly PrivyWalletListEntry[];
	accountOverview: AccountOverview | undefined;
	polymarketAccount: PolymarketAccountResponse | undefined;
	predictAccount: PredictAccountResponse | undefined;
};

function trimEvmOrUndefined(addr: string | undefined | null): string | undefined {
	if (typeof addr !== "string") return undefined;
	const t = addr.trim();
	return EVM_RE.test(t) ? t : undefined;
}

function readPredictMakerFromOverview(
	accountOverview: AccountOverview | undefined,
): string | undefined {
	const dest = accountOverview?.venues?.find(
		(v) =>
			String(v.venueId).toLowerCase() === "predict_fun" ||
			String(v.venueId).toLowerCase() === "predictfun",
	)?.fundingDestination;
	const raw = typeof dest?.address === "string" ? dest.address.trim() : "";
	return EVM_RE.test(raw) ? raw : undefined;
}

/**
 * Privy + account overview + Polymarket account → five optional role addresses.
 * Called once inside {@link AccountDataProvider}.
 */
export function normalizeWalletRolesFromOverview(
	input: NormalizeWalletRolesInput,
): AccountWalletRolesPartial {
	const { user, privyWallets, accountOverview, polymarketAccount, predictAccount } = input;
	const smartFromUser = readSmartWalletFromUser(user);
	const overviewWallet = accountOverview?.wallets?.find(overviewWalletIsEvmSmartWallet);
	const overviewAddr =
		typeof overviewWallet?.address === "string" ? overviewWallet.address.trim() : "";
	const privyScw =
		typeof smartFromUser === "string" && smartFromUser.trim() ? smartFromUser.trim() : undefined;
	const baseSmartWallet = overviewAddr || privyScw || undefined;

	const embedded = findEvmPrivyEmbeddedWallet(privyWallets) as { address?: string } | undefined;

	const embeddedEoa = trimEvmOrUndefined(embedded?.address);

	const polygonSigner =
		trimEvmOrUndefined(polymarketAccount?.polymarketAccount?.signerAddress) ?? embeddedEoa;

	const predictMaker =
		trimEvmOrUndefined(predictAccount?.predictAccount?.makerAddress) ??
		readPredictMakerFromOverview(accountOverview) ??
		embeddedEoa;

	const polymarketSafe =
		(typeof polymarketAccount?.polymarketAccount?.safeWalletAddress === "string" &&
			polymarketAccount.polymarketAccount.safeWalletAddress) ||
		(accountOverview?.venues?.find((v) => String(v.venueId).toLowerCase() === "polymarket")
			?.fundingDestination?.address as string | undefined);

	const lxDest = accountOverview?.venues?.find(
		(v) => String(v.venueId).toLowerCase() === "limitless",
	)?.fundingDestination;
	const limitlessMakerRaw = typeof lxDest?.address === "string" ? lxDest.address.trim() : "";
	const limitlessMakerBase = EVM_RE.test(limitlessMakerRaw) ? limitlessMakerRaw : undefined;

	const solWallet = privyWallets.find((w) => {
		const cw = w as { chainType?: string; address?: string };
		return cw.chainType === "solana";
	}) as { address?: string } | undefined;

	const solOverview = accountOverview?.wallets?.find(
		(w) => String(w.chainFamily ?? "").toLowerCase() === "solana",
	);

	const solFromLinked = readSolanaAddressFromUser(user);
	return {
		baseSmartWallet,
		limitlessMakerBase,
		embeddedEoa,
		polymarketSafe,
		polygonSigner,
		predictMaker,
		solanaAddress:
			solWallet?.address ??
			(typeof solOverview?.address === "string" ? solOverview.address : undefined) ??
			solFromLinked,
	};
}

function isValidEvm(addr: string | undefined): addr is string {
	return typeof addr === "string" && EVM_RE.test(addr.trim());
}

function isValidSolana(addr: string | undefined): addr is string {
	if (typeof addr !== "string") return false;
	const t = addr.trim();
	return t.length >= 32 && t.length <= 44;
}

function missingRoles(wallets: AccountWalletRolesPartial): WalletRole[] {
	const missing: WalletRole[] = [];
	if (!isValidEvm(wallets.baseSmartWallet)) missing.push("baseSmartWallet");
	if (!isValidEvm(wallets.limitlessMakerBase)) missing.push("limitlessMakerBase");
	if (!isValidEvm(wallets.embeddedEoa)) missing.push("embeddedEoa");
	if (!isValidEvm(wallets.polymarketSafe)) missing.push("polymarketSafe");
	if (!isValidSolana(wallets.solanaAddress)) missing.push("solanaAddress");
	return missing;
}

export function resolveAccountWalletRoles(wallets: AccountWalletRolesPartial): AccountWalletRoles {
	const embeddedEoa = wallets.embeddedEoa!.trim();
	return {
		baseSmartWallet: wallets.baseSmartWallet!.trim(),
		limitlessMakerBase: wallets.limitlessMakerBase!.trim(),
		embeddedEoa,
		polymarketSafe: wallets.polymarketSafe!.trim(),
		polygonSigner: (wallets.polygonSigner ?? embeddedEoa).trim(),
		predictMaker: (wallets.predictMaker ?? embeddedEoa).trim(),
		solanaAddress: wallets.solanaAddress!.trim(),
	};
}

export function isAccountWalletRolesComplete(wallets: AccountWalletRolesPartial): boolean {
	return missingRoles(wallets).length === 0;
}

export function assertAccountWalletRoles(wallets: AccountWalletRolesPartial): AccountWalletRoles {
	const missing = missingRoles(wallets);
	if (missing.length > 0) {
		const labels = missing.map((r) => ROLE_LABEL[r]).join(", ");
		throw new Error(
			`Account wallets are not ready (${labels}). Finish account setup and try again.`,
		);
	}
	return resolveAccountWalletRoles(wallets);
}

export function getAccountWalletGate(
	wallets: AccountWalletRolesPartial,
	hydrated: boolean,
	opts?: { accountSetupInProgress?: boolean },
): AccountWalletGate {
	if (!hydrated) {
		return {
			status: "loading",
			message: opts?.accountSetupInProgress ? "Setting up your account" : "Loading wallets",
		};
	}
	const missing = missingRoles(wallets);
	if (missing.length > 0) {
		const labels = missing.map((r) => ROLE_LABEL[r]).join(", ");
		return {
			status: "blocked",
			message: `Missing ${labels}. Finish account setup and try again.`,
		};
	}
	return { status: "ready", message: null };
}

function trimEvm(addr: string): string {
	return addr.trim();
}

/**
 * Venue-indexed trading wallets. Limitless collateral is always the embedded EOA,
 * not the Base SCW, even when the overview row is stale.
 */
export function buildVenueAddressChainMap(roles: AccountWalletRoles): VenueAddressChainMap {
	const scw = trimEvm(roles.baseSmartWallet);
	const embeddedEoa = trimEvm(roles.embeddedEoa);
	const overviewLimitlessMaker = trimEvm(roles.limitlessMakerBase);
	const polymarketSafe = trimEvm(roles.polymarketSafe);
	const polygonSigner = trimEvm(roles.polygonSigner);
	const predictMaker = trimEvm(roles.predictMaker);
	const solanaAddress = roles.solanaAddress.trim();

	if (scw.toLowerCase() === embeddedEoa.toLowerCase()) {
		throw new Error(
			"Base smart wallet and embedded EOA must be different addresses. Limitless uses the EOA; LevelUp uses the SCW.",
		);
	}
	if (overviewLimitlessMaker.toLowerCase() !== embeddedEoa.toLowerCase()) {
		throw new Error(
			`Limitless venue row address (${overviewLimitlessMaker}) does not match embedded EOA (${embeddedEoa}). Re-run Limitless ensure-account so makerAddress matches the Privy embedded wallet.`,
		);
	}

	return {
		levelup: {
			venue: "levelup",
			chain: VENUE_CHAIN.levelup,
			walletAddress: scw,
			signerAddress: scw,
		},
		limitless: {
			venue: "limitless",
			chain: VENUE_CHAIN.limitless,
			walletAddress: embeddedEoa,
			signerAddress: embeddedEoa,
		},
		polymarket: {
			venue: "polymarket",
			chain: VENUE_CHAIN.polymarket,
			walletAddress: polymarketSafe,
			signerAddress: polygonSigner,
		},
		predictfun: {
			venue: "predictfun",
			chain: VENUE_CHAIN.predictfun,
			walletAddress: predictMaker,
			signerAddress: embeddedEoa,
		},
		dflow: {
			venue: "dflow",
			chain: VENUE_CHAIN.dflow,
			walletAddress: solanaAddress,
			signerAddress: solanaAddress,
		},
	};
}

export function walletAddressForVenue(
	venue: SorVenue,
	venueAddressChainMap: VenueAddressChainMap,
): string {
	return venueAddressChainMap[venue].walletAddress;
}

export function walletRolesFromVenueAddressChainMap(
	venueAddressChainMap: VenueAddressChainMap,
): AccountWalletRoles {
	return {
		baseSmartWallet: venueAddressChainMap.levelup.walletAddress,
		limitlessMakerBase: venueAddressChainMap.limitless.walletAddress,
		embeddedEoa: venueAddressChainMap.predictfun.signerAddress,
		polymarketSafe: venueAddressChainMap.polymarket.walletAddress,
		polygonSigner: venueAddressChainMap.polymarket.signerAddress,
		predictMaker: venueAddressChainMap.predictfun.walletAddress,
		solanaAddress: venueAddressChainMap.dflow.walletAddress,
	};
}

/** Predict kernel/deposit address when it differs from the Privy signer EOA. */
export function predictKernelAddressFromVacm(
	entry: VenueAddressChainEntry | undefined,
): string | undefined {
	if (!entry) return undefined;
	if (entry.walletAddress.trim().toLowerCase() === entry.signerAddress.trim().toLowerCase()) {
		return undefined;
	}
	return entry.walletAddress.trim();
}

export function isVacmReady(
	account: Pick<AccountDataVacmSlice, "walletGate" | "venueAddressChainMap">,
): account is AccountDataVacmSlice & {
	walletGate: Extract<AccountWalletGate, { status: "ready" }>;
	venueAddressChainMap: VenueAddressChainMap;
} {
	return account.walletGate.status === "ready" && account.venueAddressChainMap != null;
}

/** User-facing copy when execute runs before VACM is hydrated. */
export const ACCOUNT_WALLETS_NOT_READY_MESSAGE = "Finishing wallet setup. Try again in a moment.";

/**
 * Fail-fast boundary for SOR execute / prefund — after hydration, VACM must exist.
 */
export function requireVenueAddressChainMapForExecute(
	map: VenueAddressChainMap | null,
	gate: AccountWalletGate,
): VenueAddressChainMap {
	if (gate.status === "loading") {
		throw new Error(gate.message ?? ACCOUNT_WALLETS_NOT_READY_MESSAGE);
	}
	if (gate.status === "blocked") {
		throw new Error(gate.message);
	}
	if (map == null) {
		throw new Error(ACCOUNT_WALLETS_NOT_READY_MESSAGE);
	}
	return map;
}

export type AccountDataVacmSlice = {
	venueAddressChainMap: VenueAddressChainMap | null;
	walletGate: AccountWalletGate;
	walletIsLoading: boolean;
};

export function resolveVenueAddressChainMap(
	roles: AccountWalletRolesPartial,
	gate: AccountWalletGate,
): VenueAddressChainMap | null {
	if (gate.status !== "ready") {
		return null;
	}
	return buildVenueAddressChainMap(resolveAccountWalletRoles(roles));
}
