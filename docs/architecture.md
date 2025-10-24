# Architecture Overview

High-level overview of how the application is structured and how data flows.

---

## 🏛️ Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  React App (index.tsx)                                 │ │
│  │  ├─ Privy Provider (Auth)                              │ │
│  │  ├─ Lingui Provider (i18n)                             │ │
│  │  └─ App.tsx                                             │ │
│  │     ├─ SWR Config (Data fetching)                      │ │
│  │     ├─ Context Providers                               │ │
│  │     │  ├─ BalanceContext                               │ │
│  │     │  ├─ UserDataContext                              │ │
│  │     │  └─ PredictionDataContext                        │ │
│  │     └─ AppRoutes                                        │ │
│  │        └─ Pages                                         │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                     External Services                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Prediction   │  │   Firebase   │  │  Base Chain  │     │
│  │ API (Railway)│  │   Storage    │  │  (Coinbase)  │     │
│  │              │  │              │  │              │     │
│  │ REST + WS    │  │ Images       │  │ Smart        │     │
│  │ localhost    │  │ Icons        │  │ Contracts    │     │
│  │ :8080        │  │              │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow

### 1. App Initialization

```
User opens app
    ↓
index.tsx loads
    ↓
Privy initializes (checks for auth)
    ↓
App.tsx loads
    ↓
Context providers initialize
    ├─ PredictionDataContext fetches all market data
    ├─ UserDataContext fetches user positions (if authenticated)
    └─ BalanceContext fetches balances (if authenticated)
    ↓
Routes render based on URL
```

### 2. Viewing Predictions

```
User navigates to /predictions
    ↓
PredictionDataContext provides:
    ├─ umbrellas (market groups)
    ├─ allBooksPreview (lowestAsk, highestBid for all markets)
    └─ questions (individual markets)
    ↓
Components render market cards with prices
    ↓
Auto-refresh every 30 seconds
```

### 3. Opening a Market

```
User clicks on a market
    ↓
Navigate to /predictions/umbrella/:id
    ↓
PredictionMarket.tsx loads
    ├─ Opens WebSocket connection for real-time orderbook
    ├─ Fetches historical price data
    └─ Displays chart, orderbook, trade box
    ↓
WebSocket pushes orderbook updates
    ↓
UI updates in real-time
```

### 4. Placing an Order

```
User enters amount & price in trade box
    ↓
Calculate order summary (fees, total cost)
    ↓
User clicks "Buy Yes" or "Buy No"
    ↓
Get Privy auth token
    ↓
Sign order with wallet
    ↓
POST to /orders/ endpoint
    ↓
Backend processes order
    ├─ Updates orderbook
    ├─ Executes on-chain if matched
    └─ Returns confirmation
    ↓
UserDataContext refreshes positions
    ↓
BalanceContext refreshes balances
    ↓
UI shows updated portfolio
```

### 5. Viewing Positions

```
User navigates to /positions
    ↓
UserDataContext provides:
    ├─ Open positions (unresolved markets)
    ├─ Order history
    └─ Resolved positions (claimable earnings)
    ↓
Calculate P&L for each position
    ↓
Display in table/card view
    ↓
User can:
    ├─ Cancel open orders
    └─ Claim earnings from resolved markets
```

---

## 🧱 Layers

### 1. Presentation Layer (Components)

**Location**: `src/pages/`, `src/features/*/components/`, `src/shared/components/`

**Responsibilities**:

-   Render UI
-   Handle user interactions
-   Display data from Context/SWR
-   Basic state management (form inputs, UI toggles)

**Examples**:

-   `PredictionCard` - Displays a market card
-   `PredictionMarketTradeBox` - Order entry form
-   `OrderbookDisplay` - Shows bids/asks

---

### 2. Business Logic Layer (Services)

**Location**: `src/features/*/services/`, `src/services/`

**Responsibilities**:

-   API calls
-   Data transformation
-   Order calculations
-   Smart contract interactions

**Examples**:

-   `predictionMarketService` - Place orders, calculate costs
-   `orderbookService` - Fetch orderbooks
-   `simplifiedOrderService` - Fetch user orders, cancel orders

---

### 3. State Management Layer (Context + SWR)

**Location**: `src/context/`

**Responsibilities**:

-   Cache data across components
-   Provide global state
-   Handle data refresh/polling

**Examples**:

-   `PredictionDataContext` - All market data
-   `UserDataContext` - User positions/orders
-   `BalanceContext` - Token balances

---

### 4. Infrastructure Layer (Services)

**Location**: `src/services/`

**Responsibilities**:

-   External service integrations
-   Authentication
-   Storage
-   Error handling

**Examples**:

-   `services/api/` - API client configuration
-   `services/firebase/` - Firebase Storage
-   `services/wallets/` - Wallet interactions

---

## 📡 Communication Patterns

### HTTP REST API

**Used for**:

-   Fetching market data
-   Placing orders
-   User operations (cancel, claim)

**Flow**:

```
Component → Service → API → Database
                      ↓
                   Response
                      ↓
                  Update Context/SWR Cache
                      ↓
                  Re-render Components
```

### WebSocket

**Used for**:

-   Real-time orderbook updates
-   Live price feeds

**Flow**:

```
Component mounts
    ↓
Open WebSocket connection
    ↓
Server pushes updates
    ↓
Update local state
    ↓
Re-render component
    ↓
Component unmounts
    ↓
Close WebSocket connection
```

### SWR (Stale-While-Revalidate)

**Used for**:

-   Data that needs frequent updates
-   Shareable cache across components

**Flow**:

```
Component calls useSWR(key, fetcher)
    ↓
Check cache
    ├─ Cache hit → Return cached data (instant)
    │   └─ Revalidate in background
    └─ Cache miss → Fetch data
    ↓
Store in cache
    ↓
Return data
    ↓
Auto-refresh on interval
```

---

## 🔐 Authentication Flow

```
User clicks "Connect Wallet"
    ↓
Privy modal opens
    ↓
User chooses wallet/social login
    ↓
Privy authenticates
    ↓
Store session
    ↓
usePrivy() hook provides:
    ├─ authenticated: true
    ├─ user: { wallet, email, etc. }
    └─ getAccessToken(): JWT
    ↓
All API calls include JWT in Authorization header
    ↓
Backend verifies JWT
    ↓
Return user-specific data
```

---

## 💰 Order Flow (Detailed)

### Phase 1: Order Creation (Frontend)

```typescript
// User enters amount in trade box
const amount = 100; // USDC
const position = "yes";

// Calculate order details
const {
	tokenAmount, // Tokens to receive
	totalCost, // USDC to spend
	fee, // Platform fee
} = calculateOrderSummary(amount, position, orderbook);
```

### Phase 2: Order Signing

```typescript
// Get auth token
const token = await getAccessToken();

// Sign order with wallet (EIP-712)
const signature = await signOrder({
	tokenId,
	side: "buy",
	price,
	amount: tokenAmount,
});
```

### Phase 3: Order Submission

```typescript
// POST to API
const response = await fetch("/orders/", {
	method: "POST",
	headers: {
		Authorization: `Bearer ${token}`,
	},
	body: JSON.stringify({
		questionId,
		position,
		amount: tokenAmount,
		price,
		signature,
	}),
});
```

### Phase 4: Backend Processing

```
Backend receives order
    ↓
Verify JWT
    ↓
Verify signature
    ↓
Check user balance
    ↓
Add order to orderbook
    ↓
Try to match with existing orders
    ├─ Full match → Execute on-chain immediately
    ├─ Partial match → Execute matched portion, rest stays in book
    └─ No match → Order stays in book
    ↓
Broadcast orderbook update via WebSocket
    ↓
Return order confirmation
```

### Phase 5: Frontend Update

```
Receive order confirmation
    ↓
Show success message
    ↓
UserDataContext refreshes
    ├─ Fetch updated positions
    └─ Fetch updated orders
    ↓
BalanceContext refreshes
    └─ Fetch updated USDC balance
    ↓
WebSocket receives orderbook update
    └─ Update displayed prices
    ↓
UI reflects new state
```

---

## 🏗️ Component Hierarchy

### Typical Page Structure

```
Page (e.g., PredictionMarket.tsx)
├─ Layout
│  ├─ Header
│  └─ Footer
├─ MarketHeader
│  ├─ Game Logo
│  ├─ Market Title
│  └─ Stats
├─ MarketPanels
│  ├─ Chart Panel
│  │  └─ PredictionMarketChart
│  │     ├─ ChartHeader (timeframe selector)
│  │     └─ SeriesChart (Recharts)
│  ├─ Orderbook Panel
│  │  └─ OrderbookDisplay
│  │     ├─ Asks table
│  │     └─ Bids table
│  └─ Trade Panel
│     └─ PredictionMarketTradeBox
│        ├─ Position selector (Yes/No tabs)
│        ├─ Amount input
│        ├─ Order summary
│        └─ Submit button
└─ Rules/Info section
```

---

## 🎯 Key Design Decisions

### 1. Why Context instead of Redux?

-   **Simpler**: Less boilerplate for our use case
-   **Built-in**: No extra dependency
-   **Sufficient**: App state is not complex enough to need Redux
-   **SWR handles most**: Data fetching/caching covered by SWR

### 2. Why SWR instead of React Query?

-   **Lighter**: Smaller bundle size
-   **Simpler API**: Less configuration needed
-   **Good enough**: Meets all our caching needs
-   **Vercel ecosystem**: Works well with our stack

### 3. Why Privy instead of RainbowKit?

-   **More features**: Social logins + crypto wallets
-   **Better UX**: Embedded wallets for non-crypto users
-   **Auth included**: JWT tokens for backend auth
-   **Growing ecosystem**: Better support and updates

### 4. Why WebSockets instead of polling?

-   **Efficiency**: Server pushes updates instead of client requesting
-   **Real-time**: Instant updates when orderbook changes
-   **Lower load**: Less requests to server
-   **Better UX**: No lag between trades and price updates

### 5. Why per-market WebSockets?

-   **Simplicity**: Each market owns its connection
-   **Cleanup**: Easy to close when leaving page
-   **Isolation**: One market's issues don't affect others
-   **Scaling**: Can connect/disconnect based on what user is viewing

---

## 📊 Performance Considerations

### Caching Strategy

1. **SWR Cache**: 10-second TTL for market data
2. **Context**: Long-lived cache for all umbrellas
3. **WebSocket**: Real-time updates override cache
4. **Browser Cache**: Static assets (images, scripts)

### Optimization Techniques

-   **Code Splitting**: Dynamic imports for routes
-   **Lazy Loading**: Images load as needed
-   **Memoization**: React.memo for expensive components
-   **Debouncing**: Input handlers debounced
-   **Virtualization**: Large lists use virtual scrolling

### Bundle Size

Current approach keeps bundle under 500KB (gzipped):

-   Tree-shaking unused code
-   Dynamic imports for admin panel
-   Optimized images (WebP, SVG)
-   Minimal dependencies

---

## 🔮 Future Considerations

### Scalability

As the app grows, consider:

-   **Move to React Query** if caching needs become complex
-   **Add Redux** if state management becomes unwieldy
-   **Service Workers** for offline support
-   **GraphQL** if API queries become too numerous
-   **Micro-frontends** if teams grow large

### Monitoring

Add these as app matures:

-   Error tracking (Sentry)
-   Analytics (PostHog, Mixpanel)
-   Performance monitoring (Web Vitals)
-   Real User Monitoring (RUM)

---

## 📚 Further Reading

-   [React Docs](https://react.dev)
-   [SWR Documentation](https://swr.vercel.app)
-   [Privy Documentation](https://docs.privy.io)
-   [Vite Guide](https://vitejs.dev/guide/)
-   [TypeScript Handbook](https://www.typescriptlang.org/docs/)
