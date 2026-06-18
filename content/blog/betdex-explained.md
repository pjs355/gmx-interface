---
title: "BetDEX Explained for New Traders"
description: "BetDEX is a Solana sports betting exchange built on the Monaco protocol with an Isle of Man license. Learn how BetDEX works and what it lists."
slug: betdex-explained
publishedAt: 2026-06-18
updatedAt: 2026-06-18
pillar: prediction-markets-101
funnelStage: tofu
targetKeyword: "betdex explained"
faqs:
  - question: "What is BetDEX?"
    answer: "BetDEX is a sports betting exchange on Solana built on the Monaco protocol. It holds an Isle of Man sports betting exchange license from 2022."
  - question: "What does BetDEX specialize in?"
    answer: "BetDEX focuses on sports wagering as a peer-to-peer exchange rather than a traditional house book."
  - question: "What protocol does BetDEX use?"
    answer: "BetDEX runs on the Monaco protocol on Solana per industry profiles and vendor positioning."
  - question: "What license does BetDEX hold?"
    answer: "New registrations from April 1, 2026 use an Anjouan (Comoros) license. Prior Irish Revenue Commissioners license (no. 1020267) covers existing registrants. BetDEX publishes a prohibited-jurisdiction list in its terms."
  - question: "What are BetDEX fees?"
    answer: "BetDEX charges 1% commission on net profits per market when you win. No fee on entry or on losing trades. Back $50 at 2.0 decimal odds (50% implied): $0.50 commission on a win, $49.50 net profit."
sources:
  - label: "BetDEX"
    url: "https://www.betdex.com/"
  - label: "Monaco Protocol"
    url: "https://www.monacoprotocol.xyz/"
  - label: "Bitget - BetDEX profile"
    url: "https://www.bitget.com/"
---

BetDEX is a Solana sports betting exchange on the Monaco protocol. New registrations from April 2026 contract under an Anjouan license; prior registrants remain under an Irish Revenue Commissioners license. BetDEX matches sports wagers peer-to-peer rather than acting as a traditional house book. You need a Solana wallet and BetDEX account for direct trading.

## Key stats (as of June 2026)

| Metric | Value |
| --- | --- |
| Protocol | Monaco on Solana |
| Licensing | Anjouan (new regs from Apr 2026); Irish Revenue (prior regs) |
| Focus | Sports wagering |
| Licensing | Anjouan (new regs from Apr 2026); Irish Revenue (prior regs) |

## Where is BetDEX available?

BetDEX contracts under one of two licenses depending on when you registered:

| License | Contracting entity | Applies to |
| --- | --- | --- |
| Anjouan | Stucktaymore Limited (License No. ALSI-092404022-FI2) | All new registrations from April 1, 2026 |
| Irish Revenue Commissioners | BetDEX Labs, Inc. (remote betting intermediary license no. 1020267) | Registrations before April 1, 2026 |

BetDEX states that prohibited countries are **not listed in the account-creation flow**. Its terms also note that the published prohibited list does not include every country BetDEX restricts for licensing or other legal reasons.

**Prohibited jurisdictions** listed in BetDEX terms (Appendix 3):

Afghanistan, Belarus, Burundi, Central African Republic, Côte d'Ivoire (Ivory Coast), Cuba, Democratic Republic of the Congo, Guinea, Guinea-Bissau, Iran, Iraq, North Korea, Libya, Mali, Myanmar, Russia, Sudan, Somalia, South Sudan, Syria, Tunisia, Venezuela, Yemen, Zimbabwe.

BetDEX requires KYC at certain thresholds per its licensed betting-exchange obligations.

## How does trading work on BetDEX?

BetDEX lists sports markets as exchange contracts. Traders back and lay outcomes through the order book on Solana. Settlement follows BetDEX market rules and the Monaco protocol's execution layer.

## What markets does BetDEX list?

BetDEX focuses on sports wagering. Esports coverage may appear when BetDEX lists the event. Liquidity varies by market; thin books can show wide spreads on lower-profile fixtures.

## How do BetDEX fees work?

BetDEX uses a profit-share model, not per-fill taker fees.

| Fee type | Rate | When it applies |
| --- | --- | --- |
| Trading (entry/exit) | 0% | All orders |
| Commission on net profit | 1% | Winning trades only, per market |
| Losing trades | 0% | No commission |

Commission formula for a **For (back)** bet that wins:

**commission = stake × (decimalOdds − 1) × 1%**

Where decimalOdds is the price you backed at (e.g. 2.0 at 50% implied probability).

Fee math example: back the equivalent of 100 shares at 50¢ implied probability.

- Decimal odds = 1 / 0.50 = **2.0**
- Stake = $50.00 (100 shares × $0.50)
- Entry fee = **$0.00**
- If you win: gross profit = $50.00 × (2.0 − 1) = **$50.00**
- Commission = $50.00 × 1% = **$0.50**
- Total return = $50.00 stake + $49.50 profit = **$99.50**
- Net profit = **$49.50**

If the bet loses, you lose the $50.00 stake and pay **$0** in commission.

## What is the Monaco protocol on Solana?

Monaco is the on-chain protocol layer BetDEX builds on. It handles order matching and settlement logic for sports exchange contracts on Solana. BetDEX is the consumer-facing exchange; Monaco is the underlying matching infrastructure.

## How does BetDEX compare to Kalshi and SX.bet?

Kalshi is CFTC-regulated with USD settlement and $23.8B in 2025 notional volume. SX.bet reports roughly $668.6M cumulative DEX volume on DefiLlama with sports-only focus on SX Rollup. BetDEX sits on Solana via Monaco with an Isle of Man license.

Kalshi skews regulated U.S. sports at roughly 80% of its volume since mid-2024. SX.bet targets on-chain sports depth with parlay products. BetDEX targets peer-to-peer sports exchange flow on Solana.

## Who uses BetDEX?

BetDEX fits traders who want Solana-native settlement, Monaco protocol features, and a peer-to-peer sports exchange with an Isle of Man license frame. ClutchComet shows BetDEX prices on All Odds for line shopping on matched sports and esports rows when the feed links.
