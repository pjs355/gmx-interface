# Venue Metrics Reference

**Last updated:** 2026-06-18  
**Use in:** blog, learn, and compare content. Triangulate conflicts; never invent figures.

## Sector context

| Metric | Value | Source |
| --- | --- | --- |
| 2025 prediction market sector volume (est.) | ~$50B | [HTX 2025 review](https://www.htx.com/news/2025-prediction-market-review-total-trading-volume-exceeds-5-Q4y3TtCj/) |
| Kalshi + Polymarket combined share | ~97.5% | HTX / industry syntheses |
| Combined monthly volume (Kalshi + Polymarket intl.) | ~$24B (Apr 2026) | [Pew Research / The Block](https://www.pewresearch.org/short-reads/2026/05/27/trading-volume-on-prediction-markets-has-soared-in-recent-months/) |

---

## Polymarket

| Field | Value | Source |
| --- | --- | --- |
| 2025 notional volume (est.) | ~$21–22B | Industry reports; DefiLlama DEX lower |
| Mar 2026 monthly volume | ~$10.57B | [BitKE / platform reports](https://bitcoinke.io/2026/04/polymarket-in-march-2026/) |
| Category mix (Jul 2024+) | Sports 39%, politics 32%, crypto 20% | Pew / The Block |
| Polymarket US Apr 2026 monthly | ~$1.3B | Pew |
| Settlement | USDC on Polygon | [Polymarket docs](https://docs.polymarket.com/) |
| Jurisdiction | Main platform: US + 29 countries blocked; close-only PL/SG/TH/TW; JP frontend-only; Polymarket US separate | Polymarket geoblock docs |
| Fees | Category taker: Sports 0.03, Crypto 0.07, Finance/Politics/Mentions/Tech 0.04, Economics/Culture/Weather/Other 0.05, Geopolitics 0. Formula: C × feeRate × p × (1−p). Makers 0%. At 50¢ sports/100 shares: $0.75 fee. | Polymarket docs |
| CC matched rows linked | 2,279 (109 esports) | [cc-coverage-snapshot.md](./cc-coverage-snapshot.md) |
| On ClutchComet | Tradeable | All Odds column |

---

## Kalshi

| Field | Value | Source |
| --- | --- | --- |
| 2025 notional volume | $23.8B (+1,108% YoY) | [Kalshi / Phemex summary](https://phemex.com/news/article/kalshis-2025-trading-volume-soars-to-238-billion-up-1108-51226) |
| 2025 transactions | 97M | Kalshi press |
| Open interest (end 2025) | ~$225M (+169% YoY) | Kalshi press |
| 2025 fee revenue | ~$263.5M | Industry reports |
| Category mix (Jul 2024+) | Sports ~80%, crypto ~7%, politics ~4% | Pew / The Block |
| Settlement | USD (regulated DCM) | [Kalshi](https://kalshi.com/) |
| Jurisdiction | Available: all 50 U.S. states, D.C., U.S. territories. Restricted: 50+ countries per member agreement | Kalshi member agreement |
| Fees | Taker: round_up(0.07 × C × P × (1−P)). Makers 0% on resting limits. At 50¢/100 contracts: $1.75 fee. | Kalshi docs |
| CC matched rows linked | 1,270 (39 esports) | cc-coverage-snapshot |
| On ClutchComet | Tradeable (DFlow routing) | All Odds column |

---

## Limitless

| Field | Value | Source |
| --- | --- | --- |
| Cumulative volume (claims) | $270M–$497M (sources vary) | IQ.wiki, DappRadar |
| Taker fees (order book) | CLOB buy 3.00% at ≤50¢; sell peaks 1.50% at 50¢; AMM 0.40% flat | Limitless docs |
| Maker fees | 0% (limit orders) | Limitless docs |
| Chain / collateral | Base, USDC | Limitless |
| Funding raised | ~$7–9M | Crypto-fundraising / press |
| 30d volume (public dashboard) | N/A — not on DefiLlama at snapshot | — |
| CC matched rows linked | 316 (29 esports) | cc-coverage-snapshot |
| On ClutchComet | Tradeable | All Odds column |

---

## Predict.fun

| Field | Value | Source |
| --- | --- | --- |
| Cumulative DEX volume | ~$2.22B | [DefiLlama](https://defillama.com/protocol/predict-fun) |
| 30d DEX volume | ~$280M | DefiLlama |
| TVL | ~$19.1M | DefiLlama |
| Fees | Taker only. Formula: baseFee × min(p, 1−p) × shares (2% base). Makers 0%. At 50¢/100 shares: $1.00 fee. | Predict.fun docs |
| Chain | BSC (primary) | DefiLlama |
| CC matched rows linked | 310 (5 esports) | cc-coverage-snapshot |
| On ClutchComet | Tradeable | All Odds column |

---

## Myriad

| Field | Value | Source |
| --- | --- | --- |
| Cumulative DEX volume | ~$228.6M | [DefiLlama](https://defillama.com/protocol/myriad-markets) |
| Dune trade volume (alt metric) | ~$542M | [Dune](https://dune.com/surfquery/myriad-markets) |
| 30d DEX volume | ~$2.9M | DefiLlama |
| TVL | ~$481K | DefiLlama |
| Fees | Order-book taker: peak 1.5% at 50¢ (feeBPS = 150 × min(p, 1−p) / 0.5). Makers 0%. At 50¢/100 shares: $0.75 fee. | Myriad docs |
| Users (press, cumulative) | 400K+ active traders; 6.3M+ trades | [Bitcoin.com](https://news.bitcoin.com/prediction-protocol-myriad-surpasses-100m-trading-volume-reports-10x-growth-in-3-months/) |
| CC matched rows (REST) | WS-linked when feed active | cc-coverage-snapshot |
| On ClutchComet | Comparison-only | All Odds column |

---

## BetDEX

| Field | Value | Source |
| --- | --- | --- |
| Aggregate volume | Not publicly reported | — |
| Protocol | Monaco on Solana | Industry profiles |
| License | Anjouan (new regs Apr 2026); Irish Revenue Commissioners (prior regs) | BetDEX terms |
| Jurisdiction | Prohibited list: 24 countries in Appendix 3; additional restrictions at registration | BetDEX terms |
| Focus | Sports wagering | Vendor positioning |
| Fees | 1% commission on net profit (winning trades only). No entry fee. At 50% implied / $50 stake win: $0.50 commission. | BetDEX docs |
| CC matched rows (REST) | WS-linked when feed active | cc-coverage-snapshot |
| On ClutchComet | Comparison-only | All Odds column |

---

## Forkast

| Field | Value | Source |
| --- | --- | --- |
| Weekly volume (active weeks) | ~$100K–$110K | [W3Gamer reports](https://w3gamer.com/articles/traders-forkast-100k-volume-prediction-market/) |
| Cumulative volume | Not publicly reported | — |
| Focus | Esports, gaming, internet culture | Community Gaming / press |
| Chain | Arbitrum (migrated Nov 2025) | BlockchainGamerBiz |
| Fees | Promo zero through June 2026. Standard: 0% buy, 0.75% sell taker, 0.75% redemption, 0.25% TC→USDC. | Forkast docs |
| CC matched rows (REST) | WS-linked when feed active | cc-coverage-snapshot |
| On ClutchComet | Comparison-only | All Odds column |

---

## SX.bet

| Field | Value | Source |
| --- | --- | --- |
| Cumulative DEX volume (DefiLlama) | ~$668.6M | [DefiLlama](https://defillama.com/protocol/sx-bet) |
| Self-reported cumulative (sports) | ~$1.2B; ~$500M last 12 months | [SX Bet blog](https://blog.sx.bet/sports-betting/guides/sx-bet-vs-polymarket-sports-prediction-markets/) |
| 30d DEX volume | ~$57.8M | DefiLlama |
| Open interest | ~$1.35M | DefiLlama |
| 7d bets (blog snapshot) | ~62,554 | SX Bet blog |
| Fees | Singles: 0% maker/taker. Parlays: 5% on profit (winning only). At 50¢/100 singles: $0 fee. | SX Bet docs |
| Jurisdiction | Not available in the United States (per SX Bet blog) | SX Bet blog |
| CC matched rows (REST) | WS-linked when feed active | cc-coverage-snapshot |
| On ClutchComet | Comparison-only (shown as **SX**) | All Odds column |

---

## Hyperliquid (outcome markets on CC)

| Field | Value | Source |
| --- | --- | --- |
| HIP-3 perp volume (May 2026) | ~$62B/month (builder markets) | [The Defiant](https://thedefiant.io/news/defi/builder-deployed-perp-markets-push-hyperliquid-to-record-share-of-global-perps-volume) |
| HIP-4 outcome markets | Launched May 2026; day-one ~6M contracts notional (reports) | CoinGecko / press |
| Fees | No fee on open. Settlement tier-0 taker 0.045% on $1/share. At 100 shares settle Yes: $0.045 fee. | Hyperliquid docs |
| Jurisdiction | Restricted: sanctioned countries; certain activities involving U.S. or Ontario | Hyperliquid docs |
| CC feed scope | Outcome/WS prices on matched rows, not full HL perp stack | Product |
| CC matched rows (REST) | WS-linked when feed active | cc-coverage-snapshot |
| On ClutchComet | Comparison-only | All Odds column |
