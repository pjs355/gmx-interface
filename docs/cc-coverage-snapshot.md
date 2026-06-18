# ClutchComet Coverage Snapshot

**As of:** 2026-06-18  
**Source:** `GET https://prediction-api-production.up.railway.app/matched-markets`

ClutchComet shows **matched events** only. Counts below are rows with `exchangeMatching` routing for that venue, not each venue's global catalog size.

## Matched market rows (REST)

| Metric | Count |
| --- | --- |
| Total matched rows | 2,287 |
| Esports matched rows | 117 |
| Sports / other matched rows | 2,170 |

## Linked rows by venue (tradeable)

| Venue | All matched rows | Esports rows |
| --- | --- | --- |
| Polymarket | 2,279 | 109 |
| Kalshi (DFlow) | 1,270 | 39 |
| Limitless | 316 | 29 |
| Predict | 310 | 5 |

## Comparison-only venues (All Odds)

Myriad, BetDEX, Forkast, SX.bet, and Hyperliquid prices are merged from live WebSocket books when linked for a row. They do not appear in REST `exchangeMatching` on this endpoint. Feed health is runtime-only.

## Games in catalog (matched rows)

| Game | Rows |
| --- | --- |
| soccer-fifwc | 1,695 |
| mlb | 475 |
| starcraft 2 | 28 |
| mobile legends | 28 |
| counter-strike 2 | 20 |
| mobile legends: bang bang | 16 |
| valorant | 14 |
| dota 2 | 9 |
| league of legends | 1 |
| counter-strike | 1 |

## Content usage

- Use **matched row counts**, not venue-global market totals.
- Stamp articles: "As of June 2026, ClutchComet linked X matched rows with Polymarket pricing."
- Do not claim all 9 columns appear on every row.
