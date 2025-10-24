# Quick Reference

Cheat sheet for common tasks and patterns.

---

## 🔍 Finding Things

### "Where is...?"

| What you're looking for  | Where to find it                                                |
| ------------------------ | --------------------------------------------------------------- |
| Wallet connection logic  | `src/services/wallets/` + Privy hooks                           |
| API base URL config      | `src/services/api/predictionApiBase.ts`                         |
| Order placement logic    | `src/features/predictions/services/predictionMarketService.ts`  |
| User authentication      | Privy provider in `src/index.tsx`                               |
| Market data cache        | `src/context/PredictionDataContext.tsx`                         |
| Orderbook display        | `src/features/predictions/components/OrderbookDisplay/`         |
| Trade box                | `src/features/predictions/components/PredictionMarketTradeBox/` |
| Smart contract addresses | `src/config/addresses.ts`                                       |
| Global styles            | `src/styles/`                                                   |
| Translations             | `src/locales/`                                                  |

---

## 💻 Common Code Patterns

### Fetching Data with SWR

```typescript
import useSWR from "swr";

function useMarketData(marketId: string) {
	const { data, error, isLoading, mutate } = useSWR(
		marketId ? `/api/markets/${marketId}` : null, // null = don't fetch yet
		fetcher,
		{ refreshInterval: 10000 } // Optional: auto-refresh
	);

	return {
		market: data,
		error,
		isLoading,
		refresh: mutate, // Manual refresh
	};
}
```

### Using Context

```typescript
import { usePredictionData } from "@/context/PredictionDataContext";

function MyComponent() {
	const {
		umbrellas, // All market groups
		allBooksPreview, // Price snapshots
		loading,
		refresh, // Manual refresh function
	} = usePredictionData();

	if (loading) return <Loader />;

	return <div>{/* Use data */}</div>;
}
```

### Authentication with Privy

```typescript
import { usePrivy } from "@privy-io/react-auth";

function MyComponent() {
	const {
		authenticated, // boolean
		user, // user object (wallet, email, etc.)
		login, // open login modal
		logout, // log out
		getAccessToken, // get JWT for API calls
	} = usePrivy();

	const handleApiCall = async () => {
		const token = await getAccessToken();
		fetch("/api/endpoint", {
			headers: { Authorization: `Bearer ${token}` },
		});
	};

	if (!authenticated) return <button onClick={login}>Connect</button>;

	return <div>Wallet: {user.wallet.address}</div>;
}
```

### Making Authenticated API Calls

```typescript
import { usePrivy } from "@privy-io/react-auth";
import { getPredictionApiBaseUrl } from "@/services/api/predictionApiBase";

async function placeOrder(orderData: OrderData) {
	const { getAccessToken } = usePrivy();
	const token = await getAccessToken();
	const baseUrl = getPredictionApiBaseUrl();

	const response = await fetch(`${baseUrl}/orders/`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify(orderData),
	});

	if (!response.ok) {
		throw new Error(`Order failed: ${response.status}`);
	}

	return response.json();
}
```

### WebSocket Connection

```typescript
import { useEffect, useState } from "react";
import { getPredictionWebSocketUrl } from "@/services/api/predictionApiBase";

function useOrderbookWebSocket(marketId: string) {
	const [orderbook, setOrderbook] = useState<Orderbook | null>(null);

	useEffect(() => {
		if (!marketId) return;

		const wsUrl = getPredictionWebSocketUrl();
		const ws = new WebSocket(`${wsUrl}/orderbook/${marketId}`);

		ws.onopen = () => {
			console.log("✅ WebSocket connected");
		};

		ws.onmessage = (event) => {
			const data = JSON.parse(event.data);
			setOrderbook(data.snapshot);
		};

		ws.onerror = (error) => {
			console.error("❌ WebSocket error:", error);
		};

		ws.onclose = () => {
			console.log("🔌 WebSocket closed");
		};

		// Cleanup
		return () => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.close();
			}
		};
	}, [marketId]);

	return orderbook;
}
```

### Routing

```typescript
import { useNavigate, useParams } from "react-router-dom";

function MyComponent() {
	const navigate = useNavigate();
	const { id } = useParams(); // Get URL params

	const goToMarket = (marketId: string) => {
		navigate(`/predictions/umbrella/${marketId}`);
	};

	return <button onClick={() => goToMarket("123")}>View Market</button>;
}
```

### Translations (i18n)

```typescript
import { Trans, t } from "@lingui/macro";

function MyComponent() {
	return (
		<div>
			{/* Simple text */}
			<Trans>Hello World</Trans>

			{/* With variables */}
			<Trans>Welcome, {user.name}!</Trans>

			{/* In attributes */}
			<input placeholder={t`Enter amount`} />
		</div>
	);
}
```

---

## 🎨 Styling Patterns

### Component with SCSS Module

```typescript
import "./MyComponent.scss";

function MyComponent() {
	return (
		<div className="my-component">
			<h1 className="my-component__title">Title</h1>
			<div className="my-component__content">Content</div>
		</div>
	);
}
```

```scss
// MyComponent.scss
.my-component {
	padding: var(--spacing-md);
	background: var(--color-background);

	&__title {
		font-size: var(--font-size-xl);
		color: var(--color-text);
	}

	&__content {
		margin-top: var(--spacing-sm);
	}
}
```

### Using CSS Variables

```scss
// Available variables (see src/styles/variables.scss)
var(--color-primary)
var(--color-background)
var(--color-text)
var(--spacing-xs)  // 4px
var(--spacing-sm)  // 8px
var(--spacing-md)  // 16px
var(--spacing-lg)  // 24px
var(--spacing-xl)  // 32px
```

---

## 🛠️ Common Tasks

### Adding a New Page

1. Create component in `src/pages/MyPage/MyPage.tsx`
2. Add route in `src/app/routes/MainRoutes.tsx`:

    ```typescript
    import MyPage from "@/pages/MyPage/MyPage";

    <Route path="/my-page" element={<MyPage />} />;
    ```

3. Add navigation link in Header

### Adding a New Feature

1. Create directory: `src/features/my-feature/`
2. Add subdirectories:
    - `components/` - Feature-specific components
    - `hooks/` - Feature-specific hooks
    - `services/` - API calls and business logic
    - `utils/` - Helper functions
    - `types.ts` - TypeScript types
3. Import using: `@/features/my-feature/...`

### Adding a New Shared Component

1. Decide category:
    - `shared/components/ui/` - Pure UI (Button, Modal, etc.)
    - `shared/components/layout/` - Layout (Header, Footer, etc.)
    - `shared/components/business/` - Business logic (AddressDropdown, etc.)
2. Create component with co-located styles
3. Export from index file
4. Import using: `@/shared/components/{category}/ComponentName`

### Adding a New API Endpoint

1. Add function to appropriate service file
2. Use `getPredictionApiBaseUrl()` for base URL
3. Include auth token if needed
4. Handle errors appropriately

Example:

```typescript
// src/features/predictions/services/myService.ts
import { getPredictionApiBaseUrl } from "@/services/api/predictionApiBase";

export async function fetchSomething(id: string, token?: string) {
	const baseUrl = getPredictionApiBaseUrl();
	const response = await fetch(`${baseUrl}/api/something/${id}`, {
		headers: token ? { Authorization: `Bearer ${token}` } : {},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch: ${response.status}`);
	}

	return response.json();
}
```

### Adding Environment-Specific Config

```typescript
// src/config/env.ts
export const IS_PRODUCTION = import.meta.env.PROD;
export const IS_DEVELOPMENT = import.meta.env.DEV;

// Use in code:
const apiUrl = IS_PRODUCTION
	? "https://api.production.com"
	: "http://localhost:8080";
```

---

## 🐛 Debugging Tips

### Check API Calls

```typescript
// Add to service function
console.log('🔍 API Request:', { url, body, headers });
const response = await fetch(...);
console.log('📥 API Response:', await response.clone().json());
```

### Check Context Data

```typescript
const predictionData = usePredictionData();
console.log("📊 Prediction Data:", predictionData);
```

### Check WebSocket Messages

```typescript
ws.onmessage = (event) => {
	console.log("📦 WebSocket message:", event.data);
	const data = JSON.parse(event.data);
	console.log("📊 Parsed data:", data);
};
```

### Check Privy Auth

```typescript
const { authenticated, user, getAccessToken } = usePrivy();
console.log("🔐 Auth state:", { authenticated, user });

const token = await getAccessToken();
console.log("🎟️ Access token:", token);
```

### Network Tab (Browser DevTools)

-   Open DevTools → Network tab
-   Filter by:
    -   `XHR` - API calls
    -   `WS` - WebSocket connections
-   Check:
    -   Request headers (Authorization token?)
    -   Response status (200? 401? 500?)
    -   Response body (what data came back?)

---

## 🚀 Development Commands

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type check
npm run typecheck

# Lint
npm run lint

# Format code
npm run format
```

---

## 📦 Import Aliases

Use these instead of relative imports:

```typescript
// ❌ Bad
import { Something } from "../../../lib/something";

// ✅ Good
import { Something } from "@/services/api/something";
```

Available aliases:

-   `@/` - Root src/
-   `@/app/` - App initialization
-   `@/pages/` - Page components
-   `@/features/` - Feature modules
-   `@/shared/` - Shared code
-   `@/services/` - External services
-   `@/config/` - Configuration
-   `@/context/` - Context providers
-   `@/assets/` - Static assets
-   `@/styles/` - Global styles

---

## 🎯 Type Definitions

### Common Types

```typescript
// Market/Question
interface Question {
	_id: string;
	questionId: string;
	displayName: string;
	yesTokenId: string;
	noTokenId: string;
	historicalPricesYes: Array<{ ts: number; price: number }>;
	historicalPricesNo: Array<{ ts: number; price: number }>;
}

// Umbrella
interface Umbrella {
	_id: string;
	displayName: string;
	children: Question[];
	image?: string;
}

// Orderbook
interface Orderbook {
	bids: Array<{ price: number; orders: Order[] }>;
	asks: Array<{ price: number; orders: Order[] }>;
}

// Order
interface Order {
	id: string;
	type: "limit" | "market";
	side: "buy" | "sell";
	size: number;
	price: number;
	time: number;
}

// User Position
interface Position {
	marketId: string;
	position: "Yes" | "No";
	size: number;
	averagePrice: number;
	currentValue: number;
	pnl: number;
}
```

---

## 🔧 Troubleshooting

### "Module not found" error

1. Check if file exists
2. Check import path (use aliases!)
3. Restart dev server (`Ctrl+C`, then `npm run dev`)

### TypeScript errors

1. Check `tsconfig.json` for path aliases
2. Run `npm run typecheck` to see all errors
3. Restart TypeScript server in IDE

### Styles not applying

1. Check if `.scss` file is imported
2. Check class name matches
3. Check for typos in CSS variables
4. Clear browser cache

### API calls failing

1. Check Network tab in DevTools
2. Verify API base URL is correct
3. Check if auth token is included (for protected endpoints)
4. Check backend logs

### WebSocket not connecting

1. Check WebSocket URL (ws:// for dev, wss:// for prod)
2. Check if market ID is valid
3. Check browser console for errors
4. Verify backend WebSocket server is running

---

## 💡 Pro Tips

1. **Use React DevTools** - Install browser extension to inspect component tree and props
2. **Use Redux DevTools** - See SWR cache state (enable devTools in SWR config)
3. **Console grouping** - Use `console.group()` to organize logs
4. **Keyboard shortcuts** - `Cmd+K Cmd+P` (VS Code) to quickly open files
5. **Search across files** - `Cmd+Shift+F` to find all usages
6. **Git blame** - Right-click line → "Git Blame" to see who wrote it
7. **Copilot** - Let AI help with boilerplate code
8. **ESLint auto-fix** - `Cmd+S` can auto-fix many linting issues

---

## 📚 Resources

-   [Full Documentation](./README.md)
-   [Core Concepts](./core-concepts.md)
-   [File Reference](./file-reference.md)
-   [Architecture](./architecture.md)
-   [Refactoring Guide](./refactoring-guide.md)
