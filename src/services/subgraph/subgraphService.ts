/**
 * Subgraph Service
 *
 * Uses The Graph's LevelUp Subgraph to fetch user positions and balances
 * instead of making individual RPC calls. This significantly reduces
 * the number of blockchain calls and improves performance.
 *
 * Studio URL (Free tier: 100k queries/month)
 */

const SUBGRAPH_URL =
	"https://api.studio.thegraph.com/query/1718616/levelup-subgraph/version/latest";

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

const GET_USER_ACCOUNT_QUERY = `
  query GetUserAccount($wallet: ID!) {
    account(id: $wallet) {
      id
      usdcBalance
      tokenBalances {
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
const CACHE_TTL_MS = 30_000; // 30 seconds cache

// Rate limiting state
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 200; // Minimum 200ms between requests

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
 * Execute a GraphQL query against the subgraph with retry logic for rate limiting
 */
async function executeQuery<T>(
	query: string,
	variables: Record<string, unknown>,
	maxRetries: number = 3
): Promise<T> {
	const startTime = performance.now();
	
	const response = await fetch(SUBGRAPH_URL, {
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

	console.log(`[Subgraph] Query OK (${duration}ms)`, { variables });

	return result.data;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Fetch a user's account including USDC balance and all token positions
 *
 * @param walletAddress - The user's wallet address (will be normalized to lowercase)
 * @returns Account data or null if account doesn't exist in subgraph
 */
export async function getUserAccount(
	walletAddress: string
): Promise<SubgraphAccount | null> {
	const normalizedAddress = normalizeWalletAddress(walletAddress);

	const data = await executeQuery<{ account: SubgraphAccount | null }>(
		GET_USER_ACCOUNT_QUERY,
		{ wallet: normalizedAddress }
	);

	return data.account;
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

