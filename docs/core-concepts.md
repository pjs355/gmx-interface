# Core Concepts

This document explains the key libraries, patterns, and concepts used throughout the codebase.

---

## 📡 SWR (Stale-While-Revalidate)

**Library**: `swr` by Vercel  
**What it does**: Data fetching library with built-in caching, revalidation, and auto-refresh  
**Why we use it**: Provides automatic cache management and data synchronization without Redux boilerplate

### Key Features

-   **Caching**: Stores fetched data in memory to avoid redundant requests
-   **Revalidation**: Automatically refetches data in the background
-   **Focus Revalidation**: Refetches when user returns to the tab
-   **Interval Polling**: Automatically refreshes data at specified intervals

### Our Configuration (`swrConfig.tsx`)

```typescript
{
  refreshInterval: 10000,        // Refresh every 10 seconds
  refreshWhenHidden: false,      // Don't refresh when tab is hidden
  refreshWhenOffline: false,     // Don't refresh when offline
  provider: () => new Map()      // Use in-memory cache
}
```

### When to Use

-   ✅ Fetching market data that updates frequently
-   ✅ User positions/balances that need real-time updates
-   ✅ Leaderboard data
-   ❌ One-time config fetches (use regular fetch)
-   ❌ POST/PUT requests (use mutations instead)

### Example Usage

```typescript
import useSWR from "swr";

function useMarketData(marketId: string) {
	const { data, error, isLoading } = useSWR(
		`/api/markets/${marketId}`,
		fetcher,
		{ refreshInterval: 5000 }
	);

	return { market: data, error, isLoading };
}
```

---

## 🔐 Privy

**Library**: `@privy-io/react-auth`  
**What it does**: Wallet connection and authentication provider  
**Why we use it**: Abstracts away wallet connection complexity, supports social logins + crypto wallets

### Key Features

-   **Multi-Wallet Support**: MetaMask, Coinbase Wallet, WalletConnect, etc.
-   **Social Login**: Email, Twitter, Discord, etc.
-   **Embedded Wallets**: Create wallets for users without crypto experience
-   **Session Management**: Handles token refresh and auth state

### Core Hooks

```typescript
import { usePrivy } from "@privy-io/react-auth";

const {
	authenticated, // Is user logged in?
	user, // User object (address, email, etc.)
	login, // Open login modal
	logout, // Log out user
	getAccessToken, // Get JWT for API calls
} = usePrivy();
```

### API Authentication

```typescript
const token = await getAccessToken();
fetch("/api/endpoint", {
	headers: {
		Authorization: `Bearer ${token}`,
	},
});
```

---

## 🌐 WebSocket Connections

**What they do**: Real-time bidirectional communication for live orderbook updates  
**Why we use them**: HTTP polling is inefficient; WebSockets push updates instantly

### Our Implementation

-   **Per-Market Connections**: Each market gets its own WebSocket
-   **Auto-Reconnect**: Automatically reconnects on disconnect
-   **Message Format**:
    ```json
    {
      "type": "orderbook",
      "questionId": "...",
      "snapshot": { "bids": [...], "asks": [...] }
    }
    ```

### Example (from `PredictionMarket.tsx`)

```typescript
useEffect(() => {
	const ws = new WebSocket(`${wsUrl}/orderbook/${marketId}`);

	ws.onmessage = (event) => {
		const data = JSON.parse(event.data);
		updateOrderbook(data.snapshot);
	};

	return () => ws.close();
}, [marketId]);
```

---

## 📊 Context Providers

**Pattern**: React Context API  
**What they do**: Share state across the component tree without prop drilling  
**Why we use them**: Global state management for auth, balances, market data

### Our Contexts

#### `PredictionDataContext`

-   **Purpose**: Caches all prediction market data
-   **What it provides**: Umbrellas, questions, orderbooks, preview data
-   **When to use**: Any component displaying market data

#### `UserDataContext`

-   **Purpose**: User positions, orders, balances
-   **What it provides**: Open positions, order history, P&L
-   **When to use**: Portfolio, positions page, user-specific data

#### `BalanceContext`

-   **Purpose**: Real-time token balances
-   **What it provides**: USDC balance, token balances
-   **When to use**: Trade box, wallet display

### Usage Pattern

```typescript
import { usePredictionData } from "context/PredictionDataContext";

function MyComponent() {
	const { umbrellas, allBooksPreview } = usePredictionData();
	// Use the data...
}
```

---

## 🎨 Styling

**Approach**: SCSS Modules + Global Styles  
**Why**: Scoped styles prevent conflicts, global variables for theming

### File Structure

-   `*.scss` files next to components (scoped)
-   `styles/variables.scss` for global variables (colors, spacing)
-   `styles/globals.css` for base styles

### Dark Mode

We use CSS variables for theming:

```scss
:root {
	--color-background: #0a0e1a;
	--color-text: #ffffff;
	--color-primary: #3b82f6;
}
```

---

## 🔗 API Base URLs

**Pattern**: Centralized configuration (`lib/predictionApiBase.ts`)  
**Why**: Easy to switch between dev/prod, single source of truth

### Functions

```typescript
getPredictionApiBaseUrl(); // HTTP API (localhost:8080 or production)
getPredictionWebSocketUrl(); // WebSocket (ws://localhost:8080 or wss://...)
```

### Environment Detection

Automatically detects `localhost` and uses local endpoints for development.

---

## 🎯 Path Aliases (Planned)

**Current**: Relative imports (`../../lib/service.ts`)  
**Future**: Absolute imports with aliases

```typescript
// Instead of:
import { service } from "../../lib/service";

// Use:
import { service } from "@/services/api/service";
```

See [Refactoring Guide](./refactoring-guide.md) for migration plan.

---

## 🚀 Build Tools

### Vite

-   **Purpose**: Fast build tool and dev server
-   **Features**: Hot Module Replacement (HMR), fast rebuilds
-   **Config**: `vite.config.ts`

### TypeScript

-   **Purpose**: Type safety and better developer experience
-   **Config**: `tsconfig.json`
-   **Strict Mode**: Enabled for maximum safety

---

## 📦 Key Dependencies

| Library                | Purpose               | Documentation                   |
| ---------------------- | --------------------- | ------------------------------- |
| `react`                | UI framework          | [docs](https://react.dev)       |
| `react-router-dom`     | Client-side routing   | [docs](https://reactrouter.com) |
| `swr`                  | Data fetching         | [docs](https://swr.vercel.app)  |
| `@privy-io/react-auth` | Wallet auth           | [docs](https://docs.privy.io)   |
| `ethers`               | Ethereum interactions | [docs](https://docs.ethers.org) |
| `recharts`             | Charts                | [docs](https://recharts.org)    |
| `@lingui/react`        | i18n                  | [docs](https://lingui.dev)      |

---

## 🔄 Data Flow

```
User Action
    ↓
Component Event Handler
    ↓
Service Function (lib/ or features/)
    ↓
API Call (with Privy auth if needed)
    ↓
Update Context/SWR Cache
    ↓
Re-render Components
```

### Example: Placing an Order

1. User clicks "Buy Yes" in `PredictionMarketTradeBox`
2. Component calls `placeOrder()` from `predictionMarketService`
3. Service gets auth token from Privy
4. Makes POST to `/orders/` endpoint
5. Order appears in `UserDataContext`
6. Portfolio updates automatically
