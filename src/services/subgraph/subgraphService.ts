/**
 * Subgraph Service
 *
 * Uses The Graph's LevelUp Subgraph to fetch user positions and balances
 * instead of making individual RPC calls. This significantly reduces
 * the number of blockchain calls and improves performance.
 *
 * The subgraph indexes BOTH testnet and production CTF contracts.
 * 
 * NOTE: Subgraph indexing has inherent delay (typically 10-60 seconds on Base).
 * For real-time balance updates after trades, use RPC fallback or manual refresh.
 */

/** Default: The Graph Studio deployment for LevelUp CTF balances (Base). */
const DEFAULT_SUBGRAPH_URL =
	"https://api.studio.thegraph.com/query/1718616/levelup-subgraph/version/latest";

function getSubgraphUrl(): string {
	const fromEnv = import.meta.env.VITE_LEVELUP_SUBGRAPH_URL?.trim();
	if (!fromEnv || fromEnv.length === 0) return DEFAULT_SUBGRAPH_URL;
	/** Goldsky slug `s111630` was removed; env copies still hit `deployment … does not exist`. */
	if (fromEnv.toLowerCase().includes("s111630")) {
		console.warn(
			"[Subgraph] VITE_LEVELUP_SUBGRAPH_URL references removed deployment s111630 — using default The Graph Studio URL. Update or clear the env var.",
		);
		return DEFAULT_SUBGRAPH_URL;
	}
	return fromEnv;
}

// ============================================================================
// Types
// ============================================================================

export interface TokenBalance {
	tokenId: string;
	balance: string; // Raw balance in micro-units (6 decimals)
}

export interface SubgraphAccount {
	id: string; // wallet address (lowercase)
	usdcBalance: string; // USDC balance in micro-units
	tokenBalances: TokenBalance[];
}

export interface TransferSingle {
	id: string;
	operator: string;
	from: string;
	to: string;
	internal_id: string; // tokenId
	value: string;
	blockNumber: string;
	blockTimestamp: string;
	transactionHash: string;
}

export interface CashTransfer {
	id: string;
	from: string;
	to: string;
	value: string;
	blockNumber: string;
	blockTimestamp: string;
	transactionHash: string;
}

export interface UserTransfers {
	transfersIn: TransferSingle[];
	transfersOut: TransferSingle[];
	cashIn: CashTransfer[];
	cashOut: CashTransfer[];
}

// ============================================================================
// GraphQL Queries
// ============================================================================

// Paginated query - The Graph has a max of 1000 items per query
// We'll paginate to fetch ALL token balances regardless of count
const GET_USER_ACCOUNT_QUERY = `
  query GetUserAccount($wallet: ID!, $first: Int!, $skip: Int!) {
    account(id: $wallet) {
      id
      usdcBalance
      tokenBalances(first: $first, skip: $skip) {
        tokenId
        balance
      }
    }
  }
`;

const GET_USER_TRANSFERS_QUERY = `
  query GetUserTransfers($wallet: Bytes!, $first: Int!) {
    transfersIn: transferSingles(
      where: { to: $wallet }
      orderBy: blockTimestamp
      orderDirection: desc
      first: $first
    ) {
      id
      from
      internal_id
      value
      blockTimestamp
      transactionHash
    }
    
    transfersOut: transferSingles(
      where: { from: $wallet }
      orderBy: blockTimestamp
      orderDirection: desc
      first: $first
    ) {
      id
      to
      internal_id
      value
      blockTimestamp
      transactionHash
    }
    
    cashIn: cashTransfers(
      where: { to: $wallet }
      orderBy: blockTimestamp
      orderDirection: desc
      first: $first
    ) {
      from
      value
      blockTimestamp
      transactionHash
    }
    
    cashOut: cashTransfers(
      where: { from: $wallet }
      orderBy: blockTimestamp
      orderDirection: desc
      first: $first
    ) {
      to
      value
      blockTimestamp
      transactionHash
    }
  }
`;

const GET_ALL_ACCOUNTS_QUERY = `
  query GetAllAccounts($first: Int!, $skip: Int!) {
    accounts(
      first: $first
      skip: $skip
      orderBy: usdcBalance
      orderDirection: desc
    ) {
      id
      usdcBalance
      tokenBalances {
        tokenId
        balance
      }
    }
  }
`;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize wallet address to lowercase for subgraph queries
 */
export function normalizeWalletAddress(address: string): string {
	return address.toLowerCase();
}

/**
 * Convert micro-units (6 decimals) to human-readable format
 */
export function fromMicroUnits(value: string): string {
	const num = BigInt(value);
	const divisor = BigInt(1_000_000);
	const integer = num / divisor;
	const remainder = num % divisor;
	const decimalStr = remainder.toString().padStart(6, "0");
	return `${integer}.${decimalStr}`;
}

// ============================================================================
// Rate Limiting & Caching
// ============================================================================

// Simple in-memory cache for subgraph responses
const queryCache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL_MS = 5_000; // 5 seconds cache (short TTL since subgraph can be delayed)

// Rate limiting state
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 100; // Minimum 100ms between requests

/**
 * Clear the in-memory subgraph cache and reset rate limiter.
 */
export function clearSubgraphCache(): void {
	queryCache.clear();
	lastRequestTime = 0;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a cache key for a query
 */
function getCacheKey(query: string, variables: Record<string, unknown>): string {
	return `${query}::${JSON.stringify(variables)}`;
}

/**
 * Execute a GraphQL query against the subgraph with caching and rate limiting
 */
async function executeQuery<T>(
	query: string,
	variables: Record<string, unknown>,
	skipCache: boolean = false
): Promise<T> {
	const subgraphUrl = getSubgraphUrl();
	const cacheKey = getCacheKey(query, variables);
	const now = Date.now();

	// Check cache first (unless skipCache is true)
	if (!skipCache) {
		const cached = queryCache.get(cacheKey);
		if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
			return cached.data as T;
		}
	}

	// Rate limiting - wait if we're making requests too fast
	const timeSinceLastRequest = now - lastRequestTime;
	if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
		const waitTime = MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest;
		await sleep(waitTime);
	}

	lastRequestTime = Date.now();
	const startTime = performance.now();
	
	const response = await fetch(subgraphUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ query, variables }),
	});

	const duration = Math.round(performance.now() - startTime);

	if (!response.ok) {
		console.error(`[Subgraph] Request failed: ${response.status} (${duration}ms)`, {
			status: response.status,
			statusText: response.statusText,
		});
		throw new Error(`Subgraph request failed: ${response.status}`);
	}

	const result = await response.json();

	if (result.errors) {
		console.error("[Subgraph] Query errors:", result.errors);
		throw new Error(`Subgraph query failed: ${result.errors[0]?.message}`);
	}

	// Store in cache
	queryCache.set(cacheKey, { data: result.data, timestamp: Date.now() });

	return result.data;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Fetch a user's account including USDC balance and ALL token positions
 * Uses pagination to fetch unlimited token balances (The Graph limits to 1000 per query)
 *
 * @param walletAddress - The user's wallet address (will be normalized to lowercase)
 * @returns Account data or null if account doesn't exist in subgraph
 */
export async function getUserAccount(
	walletAddress: string
): Promise<SubgraphAccount | null> {
	const normalizedAddress = normalizeWalletAddress(walletAddress);
	const PAGE_SIZE = 1000; // Max allowed by The Graph
	
	// First page - also gets account info
	const firstPage = await executeQuery<{ account: SubgraphAccount | null }>(
		GET_USER_ACCOUNT_QUERY,
		{ wallet: normalizedAddress, first: PAGE_SIZE, skip: 0 }
	);

	if (!firstPage.account) {
		return null;
	}

	const allTokenBalances: TokenBalance[] = [...firstPage.account.tokenBalances];
	let lastPageSize = firstPage.account.tokenBalances.length;
	
	// If we got a full page, there might be more - keep paginating
	let skip = PAGE_SIZE;
	while (lastPageSize === PAGE_SIZE) {
		const nextPage = await executeQuery<{ account: SubgraphAccount | null }>(
			GET_USER_ACCOUNT_QUERY,
			{ wallet: normalizedAddress, first: PAGE_SIZE, skip }
		);
		
		if (!nextPage.account || nextPage.account.tokenBalances.length === 0) {
			break;
		}
		
		allTokenBalances.push(...nextPage.account.tokenBalances);
		lastPageSize = nextPage.account.tokenBalances.length;
		skip += PAGE_SIZE;
		
		// Safety limit - 10,000 tokens should be more than enough
		if (skip >= 10000) {
			console.warn(`[Subgraph] Hit pagination safety limit at ${skip} tokens`);
			break;
		}
	}

	return {
		...firstPage.account,
		tokenBalances: allTokenBalances,
	};
}

/**
 * Fetch a user's transfer history
 *
 * @param walletAddress - The user's wallet address
 * @param limit - Maximum number of transfers to fetch per category (default: 100)
 * @returns Transfer history grouped by type
 */
export async function getUserTransfers(
	walletAddress: string,
	limit: number = 100
): Promise<UserTransfers> {
	const normalizedAddress = normalizeWalletAddress(walletAddress);

	const data = await executeQuery<UserTransfers>(GET_USER_TRANSFERS_QUERY, {
		wallet: normalizedAddress,
		first: limit,
	});

	return data;
}

/**
 * Fetch all accounts with positions (useful for leaderboard)
 *
 * @param first - Number of accounts to fetch (default: 100)
 * @param skip - Number of accounts to skip (default: 0)
 * @returns Array of accounts ordered by USDC balance
 */
export async function getAllAccounts(
	first: number = 100,
	skip: number = 0
): Promise<SubgraphAccount[]> {
	const data = await executeQuery<{ accounts: SubgraphAccount[] }>(
		GET_ALL_ACCOUNTS_QUERY,
		{ first, skip }
	);

	return data.accounts;
}

/**
 * Parse token balances from subgraph into a map keyed by marketId
 *
 * @param tokenBalances - Raw token balances from subgraph
 * @param marketDataMap - Map of marketId -> { yesTokenId, noTokenId }
 * @returns Map of marketId -> { yesTokenId, noTokenId, yesBalance, noBalance }
 */
export function parseTokenBalances(
	tokenBalances: TokenBalance[],
	marketDataMap: Map<string, { yesTokenId: string; noTokenId: string }>
): Map<
	string,
	{ yesTokenId: string; noTokenId: string; yesBalance: string; noBalance: string }
> {
	// Create a reverse lookup: tokenId -> { marketId, isYes }
	const tokenToMarket = new Map<
		string,
		{ marketId: string; isYes: boolean }
	>();

	for (const [marketId, { yesTokenId, noTokenId }] of marketDataMap.entries()) {
		tokenToMarket.set(yesTokenId, { marketId, isYes: true });
		tokenToMarket.set(noTokenId, { marketId, isYes: false });
	}

	// Build result map
	const result = new Map<
		string,
		{ yesTokenId: string; noTokenId: string; yesBalance: string; noBalance: string }
	>();

	// Initialize all markets with zero balances
	for (const [marketId, { yesTokenId, noTokenId }] of marketDataMap.entries()) {
		result.set(marketId, {
			yesTokenId,
			noTokenId,
			yesBalance: "0.000000",
			noBalance: "0.000000",
		});
	}

	// Fill in actual balances
	for (const tb of tokenBalances) {
		const mapping = tokenToMarket.get(tb.tokenId);
		if (!mapping) continue;

		const existing = result.get(mapping.marketId);
		if (!existing) continue;

		const balanceFormatted = fromMicroUnits(tb.balance);

		if (mapping.isYes) {
			existing.yesBalance = balanceFormatted;
		} else {
			existing.noBalance = balanceFormatted;
		}
	}

	return result;
}

// ============================================================================
// Exports
// ============================================================================

export const subgraphService = {
	getUserAccount,
	getUserTransfers,
	getAllAccounts,
	parseTokenBalances,
	normalizeWalletAddress,
	fromMicroUnits,
	clearSubgraphCache,
};

export default subgraphService;

