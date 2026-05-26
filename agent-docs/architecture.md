# prinx-interface — architecture

**Last verified:** 2026-05-26 (UTC)

Canonical wiring diagram for **agents and humans**. Update when provider order, data ownership, SOR/trade paths, or major module boundaries change (see workspace rule `agent-docs-architecture.mdc`).

**Master data-flow diagram (keep in sync):**

| File                                                             | Purpose                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [diagrams/master-data-flow.mmd](./diagrams/master-data-flow.mmd) | Edit the graph here first (source of truth)                                    |
| §11 below                                                        | Same Mermaid for agents, GitHub, and Markdown preview (with Mermaid extension) |

When the master diagram changes, update `.mmd` and §11 in one pass (see `agent-docs-architecture.mdc`).

**Preview in Cursor:** install recommended extensions from [`.vscode/extensions.json`](../.vscode/extensions.json) — open `.mmd` with **Mermaid Preview**, or `architecture.md` §11 with **Markdown Preview** (see [guide.md](./guide.md)).

Related policy: [positions-share-sources.md](./positions-share-sources.md) (venue share count sources).

---

## 1. System context

```mermaid
flowchart TB
  Browser[prinx-interface React SPA]

  subgraph Backend[predictions-api]
    SOR_API[POST /api/sor/route + execute tracking]
    PrivAPI[profiles portfolios venue proxies]
    Mongo[(MongoDB umbrellas markets)]
  end

  OMS[Odds Monitor WebSocket]
  Privy[Privy auth + embedded wallets]
  RPC[Chain RPC Base Polygon BSC Solana]
  Venues[Polymarket Predict DFlow Limitless LevelUp CTF]

  Browser --> Backend
  Browser --> OMS
  Browser --> Privy
  Browser --> RPC
  PrivAPI --> Mongo
  SOR_API --> Mongo
  SOR_API --> Venues
  Backend --> Venues
```

| Repo                | Role                                                                     |
| ------------------- | ------------------------------------------------------------------------ |
| **prinx-interface** | React UI, client SOR orchestration, on-chain reads where policy allows   |
| **predictions-api** | Private API, SOR route compute, Mongo catalog, server-side venue proxies |
| **Odds Monitor**    | Live orderbook / odds WebSocket feed                                     |

---

## 2. Bootstrap & provider tree

Mount order from [`src/index.tsx`](../src/index.tsx):

```text
Router
  PrivyProvider + SmartWalletsProvider
    WalletProvider (TanStack QueryClient)
      EnabledVenuesProvider
        PredictionDataProvider          ← public market catalog
          OddsMonitorProvider
            SignerProvider              ← account / signerAddress
              AccountDataProvider       ← profile, VACM, venue accounts, positions.* (incl. LevelUp RPC)
                (nested CollateralTokenProvider → GET /portfolio/cash-summary only)
                PositionsRouteChunkPreloader
                UserDataProvider        ← Mixpanel identify only (no trading data)
                  SetupActivationProvider
                    venue background activators (Poly / Predict / Limitless / Poly deploy)
                    FirstSignupSetupGate
                    RecentSettlementClaimProvider
                      PostTradeAccountSyncProvider
                        PositionsDataProvider   ← Positions page assembly + MTM summary
                          PortfolioProvider     ← header cash + positions total
                            … UI providers …
                              App
```

```mermaid
flowchart TB
  subgraph auth [Auth and identity]
    Privy[PrivyProvider]
    WP[WalletProvider QueryClient]
    Signer[SignerProvider]
    Privy --> WP --> Signer
  end

  subgraph public [Public market data]
    PDD[PredictionDataProvider]
    OMS[OddsMonitorProvider]
    PDD --> OMS
  end

  subgraph account [Per-user account layer]
    ADP[AccountDataProvider]
    CTP[CollateralTokenProvider]
    UDP[UserDataProvider Mixpanel only]
    ADP --> CTP
    ADP --> UDP
  end

  subgraph derived [Derived portfolio]
    PTS[PositionsDataProvider]
    PF[PortfolioProvider]
    PTS --> PF
  end

  subgraph trade [Trade lifecycle]
    PT[PostTradeAccountSyncProvider]
    STA[StickyTradeAmountProvider]
    PT --> PTS
    PF --> STA
  end

  Signer --> ADP
  OMS --> Signer
  ADP --> PT
  STA --> App[App routes]
```

**Key rule:** Positions page and trade box **do not read from each other**. They subscribe to the same contexts/hooks (shared TanStack `queryKey`s where applicable).

---

## 3. Public vs per-user data

| Layer             | Owner                                | Source                                                                 | Examples                                                       |
| ----------------- | ------------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| Market catalog    | `PredictionDataContext`              | `GET /umbrellas`, orderbook fetches, tags                              | umbrellas, questions, orderbooks                               |
| Live odds         | `OddsMonitorContext`                 | WebSocket                                                              | book updates                                                   |
| Identity          | `SignerProvider`                     | Privy                                                                  | `account`, `signerAddress`                                     |
| Cash (stables)    | `CollateralTokenProvider`            | `GET /portfolio/cash-summary`                                          | header cash, SOR funding input                                 |
| Venue positions   | `AccountDataContext` → `positions.*` | venue REST / API proxy / server RPC; LevelUp = Base CTF RPC in browser | see [positions-share-sources.md](./positions-share-sources.md) |
| Positions UI rows | `PositionsDataProvider`              | `usePositionsData` assembler                                           | Positions page tables + summary MTM                            |
| Header total      | `PortfolioProvider`                  | `cash + positionsTotalValue` from above                                | portfolio chip                                                 |

---

## 4. Per-user data flow

### Mental model

1. **Identity** — almost every user-scoped query keys off `SignerProvider` or `/profiles/me` → `profileId`.
2. **Account store** — `AccountDataContext` + TanStack owns profile, VACM, venue accounts, and all venue position slices (including LevelUp `positions.levelup` via `useLevelUpPositions` → `GET /api/levelup/positions`). Cash is mapped from nested `CollateralTokenProvider`. LevelUp approvals are venue hooks (`useLevelUpApprovalGate`), not a separate context store.
3. **Portfolio header** — `PortfolioProvider` derives `portfolioTotal = cashBalance + positionsTotalValue`; `positionsTotalValue` comes from `PositionsDataProvider` (single MTM source for header).

```mermaid
flowchart TB
  subgraph identity [Identity]
    Privy[Privy auth]
    Signer[SignerProvider]
    Privy --> Signer
  end

  subgraph accountLayer [AccountDataProvider]
    ADPouter[AccountDataProvider outer]
    CTP[CollateralTokenProvider]
    ADPinner[AccountDataContextInner]
    ME["GET /profiles/me"]
    OV["GET account-overview"]
    CASH["GET /portfolio/cash-summary"]
    POLY_A["GET /polymarket/account"]
    PRED_A["GET /api/predict/account"]
    DFLOW_A["GET /api/dflow/account"]
    PP["GET /api/predict/positions"]
    PM["GET /api/polymarket/positions"]
    PMA["GET /api/polymarket/activity"]
    DF[DFlow positions pipeline]
    LX[Limitless positions API]
    LU["GET /api/levelup/positions"]

    ADPouter --> CTP
    CTP --> ADPinner
    CASH --> CTP
    ME --> ADPouter
    OV --> ADPouter
    POLY_A --> ADPinner
    PRED_A --> ADPinner
    DFLOW_A --> ADPinner
    PP --> ADPinner
    PM --> ADPinner
    PMA --> ADPinner
    DF --> ADPinner
    LX --> ADPinner
    LU --> ADPinner
  end

  subgraph positionsLayer [Positions assembly]
    PDS[PositionsDataProvider]
    PDS --> MTM[positionsTotalValue MTM]
  end

  subgraph portfolioLayer [Header]
    PF[PortfolioProvider]
    MTM --> PF
    CTP --> PF
  end

  subgraph ui [Consumers]
    TB[PredictionMarketTradeBox]
    POS[Positions page]
    HDR[Header portfolio chip]
    TRF[TransfersModal]
    ADPinner --> TB
    PDS --> POS
    PF --> HDR
    ADPinner --> TRF
    CTP --> TRF
  end

  Signer --> ADPouter
  ADPinner --> PDS
```

### Quick import reference

| Need                                    | Import                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| LevelUp YES/NO shares                   | `useAccountLevelUpPositions()` or `useAccountData().positions.levelup`                         |
| LevelUp USDC / CTF approvals            | `useLevelUpApprovalGate` / `useLevelUpApprovalsStatus` → `POST /chain/read` (`venue: levelup`) |
| Per-wallet stable snapshot              | `useCollateralTokens()` or `useAccountCash()`                                                  |
| Profile / overview / venue account rows | `useAccountData()`                                                                             |
| Positions page rows + summary MTM       | `usePositionsPageData()`                                                                       |
| Header portfolio total + cash           | `usePortfolio()`                                                                               |
| Trade box all-venue share strip         | `useTradeBoxShareBalances`                                                                     |

---

## 5. Trade box + SOR (end-to-end)

UI shell: [`src/components/PredictionMarketTradeBox/`](../src/components/PredictionMarketTradeBox/). Logic: [`src/features/trading/trade-box/`](../src/features/trading/trade-box/).

**Single path** for quote and execute — no parallel DFlow quote hook.

```mermaid
flowchart LR
  subgraph Input
    A[Amount side venue tab]
    B[StickyTradeAmount + useTradeState]
  end

  subgraph TradeBox[useTradeBoxController]
    F[useTradeBoxSorFunding]
    Q[useTradeBoxQuotesLayer]
    BTN[useTradeBoxTradeButton]
    EX[useTradeBoxSorExecution]
  end

  subgraph Quote
    D[deriveSorRouteAmountFromInput]
    R[useSorRoute POST /api/sor/route]
    P[useTradeQuote buildTradePreview]
  end

  subgraph Execute
    SE[useSorExecution]
    BR[runBridgePrefund corridor LiFi]
    DL[dispatchSorLeg]
    V[venues executeLeg]
    PT[usePostTradeAccountSync]
  end

  A --> B --> F
  F --> Q
  D --> R
  R --> P
  Q --> BTN
  BTN -->|Execute| EX --> SE
  SE --> BR --> DL --> V --> PT
```

### Trade box controller layers

```mermaid
flowchart TB
  TB[PredictionMarketTradeBox.tsx]

  subgraph Ctrl[useTradeBoxController]
    SF[useTradeBoxSorFunding]
    QL[useTradeBoxQuotesLayer]
    SEC[useTradeBoxSorExecution]
    VS[useTradeBoxVenueSelection]
    TB_BTN[useTradeBoxTradeButton]
  end

  subgraph Deps[Context and wiring]
    VACM[venueAddressChainMap walletGate]
    Cash[collateralTokens cash-summary]
    Shares[useTradeBoxShareBalances]
    Wiring[useTradeBoxVenueWiring sessions]
    LegDeps[buildTradeBoxSorLegExecutorDeps]
  end

  TB --> Ctrl
  VACM --> SF
  Cash --> SF
  Shares --> SF
  SF --> QL
  QL --> TB_BTN
  LegDeps --> SEC
  SEC --> TB_BTN
  Wiring -.->|orderbooks Predict complement| QL
```

| Hook                      | Responsibility                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `useTradeBoxSorFunding`   | `buildChainBalances` from VACM + cash → `walletBalances` on route request; venue position rows for sell |
| `useTradeBoxQuotesLayer`  | Debounced `useSorRoute` (`includeDflowPondQuote` for DFlow/all); merges into `useTradeQuote`            |
| `useTradeBoxSorExecution` | `useSorLegExecutor` + `useSorExecution` + execute actions                                               |
| `useTradeBoxTradeButton`  | `useButtonState` / `venueButtonState` — gates on VACM, cash, KYC, route errors                          |

---

## 6. SOR client modules

```mermaid
flowchart TB
  subgraph core[sor/core]
    UR[useSorRoute]
    UE[useSorExecution]
    UL[useSorLegExecutor]
    API[sor-api.ts]
  end

  subgraph route[sor/route]
    PF[sorPreflight]
    QT[sorQuoteTrust]
    UI[sorUiUtils]
  end

  subgraph prefund[sor/prefund]
    RB[runBridgePrefund]
    PP[prefundPlan]
    FSC[fundingStableBalanceChains]
    FSB[fundingStableBalances]
    LQ[lifiPrefundQuoteSolve]
  end

  subgraph post[sor/post-trade]
    SYNC[usePostTradeAccountSync]
    REC[postTradeReconcile]
  end

  subgraph exec[sor/execute]
    DIS[dispatchLeg]
  end

  UR --> UE
  UE --> UL
  UL --> RB
  RB --> PP
  RB --> FSC
  FSC --> FSB
  RB --> LQ
  UL --> DIS
  UE --> SYNC
```

### Unified quote (client + server)

```mermaid
flowchart TD
  TB[useTradeBoxQuotesLayer] -->|includeDflowPondQuote when dflow or all| UR[useSorRoute]

  UR -->|POST /api/sor/route walletBalances positions| API[predictions-api register-sor]

  subgraph APIInner[POST /api/sor/route]
    CR[computeRoute optimizer books eligibility]
    PQ[fetchSorDflowPondQuote optional]
    OV[applyDflowOrderQuoteToRoute]
    SIG[sign RoutePlan]
    CR --> OV
    PQ --> OV
    OV --> SIG
  end

  API --> APIInner
  APIInner -->|signed RoutePlan| UR
  UR --> TQ[useTradeQuote / buildTradePreview]
```

**Removed:** client `useDflowOrderQuote`, server `GET /api/dflow/order/quote`. DFlow execution still uses `GET /api/dflow/order` at leg time.

### Execute path

```mermaid
flowchart TD
  HE[handleSorExecute] --> SE[useSorExecution.executeRoute]

  SE --> GRP[groupBridgeLegsByCorridor]
  GRP -->|buy legs with bridge| BR[executeBridge runBridgePrefund]
  GRP -->|each leg| LEG[executeLeg]

  BR --> PLAN[resolveBridgePrefundContext]
  PLAN --> READ[readFundingStableBalancesForChains corridor only]
  PLAN --> STEPS[buildPrefundSteps]
  STEPS --> LIFI[runPrefundLifiSteps]
  LIFI --> LEG

  LEG --> DIS[dispatchSorLeg]
  DIS --> V1[polymarket executeLeg]
  DIS --> V2[predict executeLeg]
  DIS --> V3[dflow executeLeg]
  DIS --> V4[limitless executeLeg]
  DIS --> V5[levelup executeLeg]

  SE --> PT[PostTradeAccountSync refresh positions cash]
```

**Prefund corridor:** SOR planner sets `leg.bridge.fromChain` → `toChain`. Execute reads balances only for that corridor (`chainsForBridgeCorridor`). LiFi uses `allowedSourceChains: [bridge.fromChain]`.

| fromChain | LiFi fromAddress (VACM) | Notes                                           |
| --------- | ----------------------- | ----------------------------------------------- |
| base      | SCW or Limitless maker  | Optional same-chain SCW→maker sweep before LiFi |
| polygon   | Polymarket deposit safe | May use Poly relay for signing                  |
| bnb       | Embedded EOA            | USDT on BSC                                     |
| solana    | Solana embedded         | Privy Solana sign                               |

**LI.FI prefund runbook** (server-side detail): `predictions-api/docs/PREFUND_LIFI_STATUS_RUNBOOK.md` in the predictions-api repo.

---

## 7. VACM (venue address chain map)

Privy alone does not produce VACM. `AccountDataProvider` merges profile/overview/venue account slices, then `accountWallets.ts` → `normalizeWalletRolesFromOverview` → `buildVenueAddressChainMap`.

```mermaid
flowchart TB
  subgraph PrivySDK[Privy SDK]
    LA[linkedAccounts SCW Solana]
    PW[usePrivyWallets embedded EOA]
  end

  subgraph APIBoot[Boot fetches after GET /profiles/me]
    AO[account-overview]
    PA[polymarket/account]
    PR[predict/account]
  end

  subgraph Merge[accountWallets.ts]
    N[normalizeWalletRolesFromOverview]
    G[getAccountWalletGate hydrated]
    V[buildVenueAddressChainMap]
    N --> G --> V
  end

  LA --> N
  PW --> N
  AO --> N
  PA --> N
  PR --> N

  V --> TB2[useTradeBoxSorFunding buildChainBalances]
  V --> EXEC[requireVenueAddressChainMapForExecute]
```

| Role               | Primary source                        | Fallback                               |
| ------------------ | ------------------------------------- | -------------------------------------- |
| baseSmartWallet    | overview smart wallet row             | Privy smart_wallet linked account      |
| embeddedEoa        | Privy embedded EOA                    | —                                      |
| polymarketSafe     | polymarket/account safeWalletAddress  | overview polymarket fundingDestination |
| polygonSigner      | polymarket/account signerAddress      | embeddedEoa                            |
| predictMaker       | predict/account makerAddress          | overview → embeddedEoa                 |
| limitlessMakerBase | overview limitless fundingDestination | —                                      |
| solanaAddress      | Privy Solana wallet                   | overview / linkedAccounts              |

| Venue      | Chain   | walletAddress | signerAddress      |
| ---------- | ------- | ------------- | ------------------ |
| levelup    | base    | SCW           | SCW                |
| limitless  | base    | embedded EOA  | embedded EOA       |
| polymarket | polygon | deposit safe  | polygon signer EOA |
| predictfun | bnb     | predict maker | embedded EOA       |
| dflow      | solana  | solana wallet | same               |

### RPC networks vs wallets

JSON-RPC chains (Base, Polygon, BSC, Solana) are **transport**. VACM is **who signs and where collateral sits**. Limitless and LevelUp both use Base RPC but different wallets.

```mermaid
flowchart LR
  subgraph RPC[JSON-RPC]
    B[Base]
    P[Polygon]
    C[BSC]
    S[Solana]
  end

  LU[LevelUp CTF] --> B
  LX[Limitless] --> B
  PO[Polymarket] --> P
  PF[Predict.fun] --> C
  DF[DFlow] --> S
  LiFi[LiFi bridges] --> RPC
```

---

## 8. Module directory map

```text
src/
├── index.tsx                    provider tree entry
├── app/                         App routes shell
├── components/
│   └── PredictionMarketTradeBox/  trade UI shell (~940 lines)
├── context/                     React contexts (Account, User, Portfolio, …)
├── features/
│   ├── trading/
│   │   ├── trade-box/           controller, quotes, venue wiring
│   │   ├── sor/                 client SOR (core, prefund, post-trade, execute)
│   │   └── venues/              polymarket predict dflow limitless levelup
│   ├── positions/               Positions page hooks and assemblers
│   └── onboarding/              setup activation gate
├── services/                    private API client, wallets
└── config/                      RPC, addresses

predictions-api/ (sibling repo)
├── api/private-api/sor/         POST /api/sor/route + execute tracking
└── src/sor/                     route compute, DFlow pond overlay
```

---

## 9. Known gaps (May 2026)

- **Wallet gate incomplete** — `isTradeFundingReady` / button state partial in some paths.
- **Predict success UX** — toast on HTTP 201 without mandatory fill confirmation.
- **LiFi stale quote** — deadline can expire between quote and SCW estimate; re-quote before send not implemented.

---

## 10. Verify after architecture changes

```bash
cd prinx-interface
yarn build:strict
```

Targeted tests when touching SOR or prefund:

```bash
npx vitest run src/features/trading/sor/tests/prefundPlan.test.ts \
  src/features/trading/sor/tests/fundingStableBalanceChains.test.ts
```

---

## 11. Master data-flow diagram (reference)

**Preview:** open [diagrams/master-data-flow.mmd](./diagrams/master-data-flow.mmd) and run the Mermaid Preview command, or preview this file with **Markdown Preview Mermaid Support** (see [guide.md](./guide.md)).

The block below is a copy of the `.mmd` source for agents and GitHub.

Read this diagram **top → bottom, left → right**:

1. **External sources** — what the client calls directly (HTTP, WebSocket, RPC, Privy). Upstream venue APIs reached only via predictions-api are not separate nodes here (same as Predict/Limitless positions).
2. **React stores** — contexts and TanStack Query caches that own fetched data (not UI components).
3. **UI consumers** — screens/widgets that _subscribe_ to stores (they do not fetch from each other).
4. **Trade path** — quote → execute → post-trade refresh (orthogonal to catalog/positions reads).

Solid arrows = primary data ownership or fetch direction. Dashed arrows = read/subscribe or refresh after trade.

```mermaid
flowchart TB
  subgraph sources [External sources]
    direction LR
    PRIVY[Privy auth + embedded wallets]
    API[predictions-api private REST]
    OMS_WS[Odds Monitor WebSocket]
    VENUES[Venue APIs via SOR legs]
  end

  subgraph publicStores [Public stores - no login]
    direction TB
    PDD["PredictionDataContext<br/>umbrellas · orderbooks · tags"]
    OMS["OddsMonitorContext<br/>live book deltas"]
    PDD --- OMS
  end

  subgraph identity [Identity]
    SIGNER["SignerProvider<br/>account · signerAddress"]
    PRIVY --> SIGNER
  end

  subgraph accountStores [Account stores - TanStack + context]
    direction TB
    ADP["AccountDataContext<br/>profile · VACM · venue accounts · positions"]
    CTP["CollateralTokenProvider<br/>GET /portfolio/cash-summary"]
    ADP --> CTP
    ME["GET /profiles/me"]
    OV["GET /account-overview"]
    CASH["GET /portfolio/cash-summary"]
    V_POLY["GET /polymarket/account"]
    V_PRED["GET /api/predict/account"]
    V_DF["GET /api/dflow/account"]
    V_POS_PRED["GET /api/predict/positions"]
    V_POS_LX["GET /api/limitless/positions"]
    V_POS_DF["DFlow positions pipeline"]
    V_POS_PM["GET /api/polymarket/positions"]
    V_ACT_PM["GET /api/polymarket/activity"]
    V_POS_LU["GET /api/levelup/positions"]
    API --> ME --> ADP
    API --> OV --> ADP
    API --> CASH --> CTP
    API --> V_POLY --> ADP
    API --> V_PRED --> ADP
    API --> V_DF --> ADP
    API --> V_POS_PRED --> ADP
    API --> V_POS_LX --> ADP
    API --> V_POS_DF --> ADP
    API --> V_POS_PM --> ADP
    API --> V_ACT_PM --> ADP
    API --> V_POS_LU --> ADP
    PDD -.->|market catalog · token IDs| ADP
  end

  subgraph derivedStores [Derived stores]
    direction TB
    PDS["PositionsDataProvider<br/>rows + MTM summary"]
    PF["PortfolioProvider<br/>cash + positions total"]
    ADP --> PDS
    PDS --> PF
    CTP --> PF
  end

  subgraph ui [UI consumers - subscribe only]
    direction LR
    MARKETS[Market pages]
    TB[PredictionMarketTradeBox]
    POS[Positions page]
    HDR[Header chip]
    TRF[TransfersModal]
    PDD --> MARKETS
    OMS --> MARKETS
    PDD --> TB
    OMS --> TB
    ADP --> TB
    CTP --> TB
    PDS --> POS
    PF --> HDR
    ADP --> TRF
    CTP --> TRF
  end

  subgraph tradePath [Trade path - user action]
    direction TB
    STA[StickyTradeAmountProvider]
    CTRL[useTradeBoxController]
    SOR_ROUTE["useSorRoute<br/>POST /api/sor/route"]
    SOR_EXEC["useSorExecution · useSorLegExecutor"]
    POST[PostTradeAccountSyncProvider]
    STA --> CTRL
    ADP -.->|VACM · walletBalances| CTRL
    CTP -.->|cash snapshot| CTRL
    ADP -.->|venue positions sell| CTRL
    CTRL --> SOR_ROUTE
    API --> SOR_ROUTE
    SOR_ROUTE --> CTRL
    CTRL -->|Execute| SOR_EXEC
    SOR_EXEC --> VENUES
    SOR_EXEC --> POST
    POST -.->|refresh| CTP
    POST -.->|refresh| ADP
    POST -.->|refresh| PDS
  end

  OMS_WS --> OMS
  API --> PDD
  SIGNER --> ADP
  TB --> STA
  TB --> CTRL
```

### Node legend

| Node kind   | Examples                                      | Rule                                                      |
| ----------- | --------------------------------------------- | --------------------------------------------------------- |
| **Source**  | `predictions-api`, Privy, venue SOR legs      | What the client calls directly over the network           |
| **Store**   | `AccountDataContext`, `PositionsDataProvider` | Owns fetch or cache; keyed by user/profile/wallet         |
| **Derived** | `PortfolioProvider`                           | Computed from other stores — no independent fetch         |
| **UI**      | Trade box, Positions page, Header             | Reads hooks/context only; never the sole owner of a fetch |

### Same data, multiple subscribers

`AccountDataProvider`, `PositionsDataProvider`, `useTradeBoxShareBalances`, and `PortfolioProvider` may all call the same venue position hooks. That creates multiple React subscriptions but **one TanStack `queryKey` fetch** until invalidation or stale refetch.

Server counterpart for SOR route compute and private API routes: [predictions-api/agent-docs/architecture.md](../../predictions-api/agent-docs/architecture.md).
