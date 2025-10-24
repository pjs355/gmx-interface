# File Reference

Quick reference for understanding what specific files do and why they exist.

---

## 🚀 Entry Point & App Initialization

### `src/index.tsx`

**Purpose**: Application entry point  
**What it does**:

-   Sets up React root
-   Wraps app in Privy provider
-   Initializes i18n (translations)
-   Mounts the app to DOM

**Key dependencies**: `@privy-io/react-auth`, `@lingui/react`

---

### `src/App/App.tsx`

**Purpose**: Root component  
**What it does**:

-   Wraps app in global context providers (Balance, User, Prediction data)
-   Wraps app in SWR configuration
-   Renders main routing

**Why it's separate from index.tsx**: Keeps provider logic organized and testable

---

### `src/App/swrConfig.tsx`

**Purpose**: SWR (Stale-While-Revalidate) configuration  
**What it does**:

-   Configures data fetching and caching behavior
-   Sets refresh interval to 10 seconds
-   Disables refresh when tab is hidden or offline
-   Provides in-memory cache storage

**Why we need it**:

-   Centralizes data fetching configuration
-   Prevents excessive API calls when user isn't looking
-   Improves performance by caching responses
-   Reduces server load

**When to modify**:

-   Change `refreshInterval` to adjust polling frequency
-   Enable `refreshWhenHidden` if you need background updates
-   Switch `provider` to use localStorage for persistent cache

**Related**: See [Core Concepts - SWR](./core-concepts.md#-swr-stale-while-revalidate)

---

## 🛣️ Routing

### `src/App/AppRoutes.tsx`

**Purpose**: Main application routes  
**Defines**:

-   `/` - Home/landing page
-   `/trade/*` - Trading pages (MainRoutes)
-   Other top-level routes

---

### `src/App/MainRoutes.tsx`

**Purpose**: Authenticated trading routes  
**Defines**:

-   `/trade/predictions` - Main predictions page
-   `/trade/predictions/umbrella/:id` - Specific umbrella/market
-   `/trade/positions` - User positions
-   `/trade/admin` - Admin panel

---

### `src/App/HomeRoutes.tsx`

**Purpose**: Public/landing page routes  
**Defines**: Marketing/home page routes

---

## 🌐 API & Services

### `src/lib/predictionApiBase.ts`

**Purpose**: Centralized API URL configuration  
**Functions**:

-   `getPredictionApiBaseUrl()` - Returns HTTP API URL
-   `getPredictionWebSocketUrl()` - Returns WebSocket URL

**Why we need it**:

-   Single source of truth for API endpoints
-   Automatically switches between dev (localhost:8080) and production
-   Easy to change API hosts without touching code

**Environment logic**:

```typescript
localhost → http://localhost:8080
production → https://prediction-api-production.up.railway.app
```

---

### `src/lib/predictionMarketService.ts`

**Purpose**: Core prediction market trading logic  
**What it does**:

-   Places buy/sell orders
-   Calculates token amounts and pricing
-   Interacts with smart contracts (CTF, Exchange)
-   Handles order signing and submission

**Key functions**:

-   `placePredictionMarketOrder()` - Main order placement
-   `calculateOrderSummary()` - Calculate costs before placing order

---

### `src/lib/orderbookService.ts`

**Purpose**: Fetch and manage orderbook data  
**What it does**:

-   Fetches orderbooks from API
-   Caches orderbook data
-   Provides orderbook snapshots for markets

**Used by**: Trading UI, price displays

---

### `src/lib/simplifiedOrderService.ts`

**Purpose**: User order history and management  
**What it does**:

-   Fetches user's open orders
-   Fetches order history
-   Cancels orders
-   Calculates P&L

**Used by**: Positions page, order management

---

### `src/lib/umbrellaDataService.ts`

**Purpose**: Fetch umbrella (market group) data  
**What it does**:

-   Fetches all umbrellas
-   Fetches questions within umbrellas
-   Manages umbrella metadata

**Data structure**:

```typescript
Umbrella {
  _id: string
  displayName: string
  children: Question[]  // Markets in this umbrella
}
```

---

## 🎯 Context Providers

### `src/context/PredictionDataContext.tsx`

**Purpose**: Global state for all prediction market data  
**Provides**:

-   `umbrellas` - All market umbrellas
-   `allBooksPreview` - Lightweight orderbook snapshots (lowestAsk, highestBid)
-   `getQuestionsForUmbrella()` - Get markets for an umbrella
-   `refreshOrderbook()` - Manually refresh orderbook

**Why we need it**:

-   Avoids re-fetching market data on every page
-   Single source of truth for market data
-   Automatic refresh every 30 seconds for `allBooksPreview`

**Data flow**:

1. Loads on app mount
2. Fetches all umbrellas
3. Fetches orderbook previews
4. Provides data to all components

---

### `src/context/UserDataContext.tsx`

**Purpose**: User-specific data (positions, orders, balances)  
**Provides**:

-   User's open positions
-   Order history
-   P&L calculations

**Requires**: User must be authenticated (Privy)

---

### `src/context/BalanceContext.tsx`

**Purpose**: Real-time token balances  
**Provides**:

-   USDC balance
-   Prediction token balances

**Updates**: On wallet connection, after trades, on interval

---

## 🧩 Shared Components

### `src/components/PredictionMarketTradeBox/`

**Purpose**: Trade interface for buying/selling prediction tokens  
**What it does**:

-   Displays current prices
-   Calculates order costs
-   Handles order placement
-   Shows order confirmation

**Used by**: All prediction market pages

---

### `src/components/PredictionMarketChart/`

**Purpose**: Price history chart for prediction markets  
**What it does**:

-   Displays Yes/No price over time
-   Shows volume data
-   Interactive tooltips

**Library**: Recharts

---

### `src/components/OrderbookDisplay/`

**Purpose**: Visual orderbook (bids/asks table)  
**What it does**:

-   Shows all open orders at each price level
-   Displays depth bars
-   Click to fill order form

---

## 📄 Page Components

### `src/pages/Predictions/Predictions.tsx`

**Purpose**: Main predictions landing page  
**Shows**: All umbrellas with game links

---

### `src/pages/Predictions/UmbrellaPage.tsx`

**Purpose**: Display all markets within an umbrella  
**Route**: `/predictions/umbrella/:id`  
**Shows**: List of markets, filtering options

---

### `src/pages/Predictions/PredictionMarket.tsx`

**Purpose**: Single market trading page  
**Route**: `/predictions/umbrella/:umbrellaId` (single market umbrella)  
**Shows**: Chart, orderbook, trade box, market info

**Key features**:

-   WebSocket connection for real-time orderbook updates
-   Chart with price history
-   Trade interface

---

### `src/pages/Positions/`

**Purpose**: User's portfolio and order history  
**Shows**:

-   Open positions with P&L
-   Order history
-   Resolved markets
-   Claim earnings

---

### `src/pages/Predictions/Admin/`

**Purpose**: Admin panel for market management  
**Features**:

-   Create/edit markets
-   Seed orderbooks
-   Manage tags
-   Market settings

**Access**: Requires admin role (Privy)

---

## 🎨 Utilities

### `src/pages/Predictions/utils/gameLogoResolver.ts`

**Purpose**: Resolve game logos for markets  
**What it does**:

-   Maps game tags to logo files
-   Provides fallback logo
-   Resolves Firebase Storage URLs for custom icons

**Used by**: All market displays

---

### `src/pages/Predictions/utils/predictionUtils.ts`

**Purpose**: Shared utility functions for predictions  
**Functions**:

-   `calculateOrderbookPrices()` - Get best bid/ask
-   `toCentsString()` - Format prices as cents
-   `getTopTwoMarkets()` - Get top markets by volume

---

## ⚙️ Configuration

### `src/config/addresses.ts`

**Purpose**: Smart contract addresses  
**Contains**: CTF, Exchange, USDC contract addresses for Base chain

---

### `src/config/chains.ts`

**Purpose**: Blockchain network configuration  
**Contains**: Base network config (RPC, explorer, etc.)

---

### `src/config/constants.ts`

**Purpose**: App-wide constants  
**Contains**: Feature flags, limits, URLs

---

### `src/config/localStorage.ts`

**Purpose**: localStorage key constants  
**Why**: Prevents typos, easy to find all stored data

---

## 🌍 Internationalization (i18n)

### `src/lib/i18n.ts`

**Purpose**: Initialize Lingui for translations  
**What it does**: Sets up translation system

### `src/locales/`

**Purpose**: Translation files for each language  
**Structure**: `{language}/messages.po`

**Supported languages**: en, es, de, fr, ja, ko, ru, zh

---

## 🎨 Styles

### `src/styles/variables.scss`

**Purpose**: Global SCSS variables  
**Contains**: Colors, spacing, breakpoints

### `src/styles/globals.css`

**Purpose**: Global CSS (reset, base styles)

---

## 🔧 Build Configuration

### `vite.config.ts`

**Purpose**: Vite build tool configuration  
**Settings**: Aliases, plugins, build options

### `tsconfig.json`

**Purpose**: TypeScript compiler configuration  
**Settings**: Type checking rules, module resolution

---

## 📝 Notes on File Organization

### Current Issues

-   ❌ `lib/` is a grab-bag of services, hooks, and utils
-   ❌ Language files scattered in root (`de/`, `en/`, etc.)
-   ❌ Prediction components mixed with pages
-   ❌ Admin nested under Predictions

### Planned Improvements

See [Refactoring Guide](./refactoring-guide.md) for the new structure.

---

## 🆘 "Where do I put this?"

| What you're adding         | Where it goes (current)        | Where it goes (future)                                    |
| -------------------------- | ------------------------------ | --------------------------------------------------------- |
| New API service            | `src/lib/`                     | `src/services/api/` or `src/features/{feature}/services/` |
| Shared component           | `src/components/`              | `src/shared/components/`                                  |
| Feature-specific component | `src/pages/{page}/components/` | `src/features/{feature}/components/`                      |
| Hook used by one feature   | `src/pages/{page}/hooks/`      | `src/features/{feature}/hooks/`                           |
| Hook used everywhere       | `src/lib/`                     | `src/shared/hooks/`                                       |
| Utility function           | `src/lib/` or `src/utils/`     | `src/shared/utils/` or `src/features/{feature}/utils/`    |
| New page                   | `src/pages/{Page}/`            | `src/pages/{Page}/`                                       |
| Config file                | `src/config/`                  | `src/config/`                                             |
