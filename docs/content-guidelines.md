# ClutchComet Page Generation Guidelines

These are the parameters for any tool generating landing pages, trading pages, comparison pages, or blog pages for ClutchComet.com. The goal of every page: rank well in Google and in AI search engines, sound like a person wrote it, and accurately represent the product.

---

## 1. Voice and Language Rules

### Banned punctuation and constructions
- **No em dashes, ever.** Use a period, a comma, or "and"/"but" instead. If a sentence feels like it needs an em dash, it should usually be split into two sentences.
- No semicolons unless genuinely necessary. Default to two short sentences.
- No rhetorical question openers ("Ever wonder why odds differ across platforms?"). Just state the point.
- No "Whether you're a [X] or a [Y]..." sentence pattern. It's an overused AI tell.
- No "Let's dive in," "In today's fast-paced world," "In the world of X," "At the end of the day," "When it comes to X."
- No stacked superlatives ("incredibly," "truly," "amazingly," "remarkably"). Say the specific thing instead of intensifying a vague one.
- No "Not just X, but Y" sentence structure as a crutch.
- Avoid ending sections with a forced summary sentence ("In conclusion," "Ultimately," "At its core"). Just stop when the point is made.

### Banned vocabulary (common AI-writing tells)
Avoid: unlock, elevate, seamless, seamlessly, game-changing, game-changer, revolutionize, cutting-edge, robust, leverage (as a verb), boasts, tapestry, realm, navigate (metaphorically), empower, dynamic, landscape (metaphorically, e.g. "the betting landscape"), holistic, synergy, in conclusion, it's worth noting, it's important to note, paramount, the world of, look no further, peace of mind (overused), take it to the next level.

### What good ClutchComet copy sounds like
Write like a sharp, knowledgeable trader explaining something to someone who already gets the basics, not like a brochure. Short sentences mixed with the occasional longer one. Contractions are fine and preferred ("you don't have to" not "you do not have to"). Use real numbers and specifics instead of vague claims wherever data is available ("odds varied by 4% between Kalshi and Polymarket on this match" beats "odds can vary significantly"). One clear idea per sentence. It is fine, and good, for sentences to be blunt.

### SEO and AI-search structure notes
AI search engines and Google's AI Overviews favor pages that answer the implied question directly and early, in plain language, before going into detail. Every page should have a first paragraph that could stand alone as a direct answer to "what is this page about." Use real subheadings phrased as the actual question a person would search (e.g. "Why do CS2 odds differ between Polymarket and Kalshi?") rather than vague marketing headers. Don't keyword-stuff; write the natural sentence and let the keyword appear because it's the accurate word for the thing.

---

## 2. How ClutchComet Actually Works (use this to make copy accurate, not just persuasive)

**Matched events, not full catalogs:** ClutchComet shows side-by-side pricing on **matched events** where the backend has linked the same outcome across venues. It does not mirror every market listed on Polymarket, Kalshi, or other venues. A venue column on All Odds appears only when that row is linked for that event.

**The core mechanism:** ClutchComet automatically creates and manages user accounts on **four** fully integrated trading venues: Polymarket, Kalshi, Limitless, and Predict. The user funds one ClutchComet balance, and ClutchComet handles account creation, fund movement, and order placement across those four venues behind the scenes.

**One balance, not four:** Instead of holding separate balances on each venue, the user funds a single balance through ClutchComet. ClutchComet routes and moves funds across the four integrated venues when placing trades on matched markets.

**Smart order routing:** When a user places a trade on a matched market, ClutchComet checks pricing across the four integrated venues and routes the order to wherever the price and liquidity are best at that moment.

**Split order execution:** If no single venue has enough liquidity to fill an order at the best price, ClutchComet can split the order across multiple venues for better overall execution.

**The comparison layer (trust piece):** Beyond the four tradeable venues, ClutchComet also pulls and displays live odds from **five** comparison-only markets on All Odds: Myriad, BetDEX, Forkast, SX.bet (shown as **SX** in the UI), and Hyperliquid. ClutchComet does not execute on these five. They are shown for comparison on matched rows when the feed is linked.

**Live match viewing:** Users can watch esports matches live on ClutchComet while trading or comparing odds.

**Roadmap:** More markets are planned, including MLB, tennis, and NFL. Phrase upcoming markets as roadmap intention, never as guaranteed unless committed.

**LevelUp in content:** Do not list LevelUp as an external venue in blog, learn, or compare content. Product UI may still reference it separately.

### Claims language to use carefully
Avoid absolute words like "always," "guaranteed," or "every time" when describing pricing. Use bounded phrasing:
- Use: "ClutchComet shows pricing across nine All Odds venues on matched events."
- Avoid: "ClutchComet always gets you the best price, guaranteed."
- Use: "Trades route to whichever of our four integrated markets has the best price at that moment on that matched event."

Don't use financial advice language. Describe odds, pricing, and mechanics only.

---

## 3. Logo Usage

Use official logos for games (CS2, League of Legends, Dota 2, Valorant) or sports, and for venues (Polymarket, Kalshi, Limitless, Predict, Forkast, BetDEX, Hyperliquid, SX.bet, Myriad) when a page discusses that venue.

Rules: unmodified logos, identification only, footer disclaimer on pages with third-party logos.

---

## 4. Image Guidelines

Use licensed or press-kit imagery for specific games/sports. Avoid unlicensed broadcast screenshots at scale.

---

## 5. Page Types

- **Venue pages** (Polymarket, Kalshi, Limitless, Predict, Myriad, BetDEX, Forkast, SX.bet, Hyperliquid): venue stats + how ClutchComet links matched rows for that venue.
- **Venue explainer articles** (`/blog/{venue}-explained`): in-depth guides about each exchange (how it works, fees, markets, who uses it). Stats tables use two columns (Metric | Value) only. No "Source" column in tables. Omit stats you cannot verify rather than writing "unknown" or "not publicly reported."
- **Game/sport landers:** esports/sports trading across nine All Odds venues on matched events.
- **Blog:** data-driven mechanics, fees, line shopping, sector volume context.

---

## 6. Standard CTA Pattern

One CTA per page:

"ClutchComet executes on Polymarket, Kalshi, Limitless, and Predict from one balance, with smart order routing on matched events. ClutchComet also shows pricing from five comparison-only venues on All Odds: Myriad, BetDEX, Forkast, SX.bet, and Hyperliquid."

Brand vocabulary: one balance, smart order routing, split order execution, line shop, matched events, four tradeable venues, nine All Odds venues, live match viewing.

---

## 7. Data and sourcing rules

- Every venue page includes a **Key stats (as of {Month YYYY})** table with sourced figures from [venue-metrics.md](./venue-metrics.md).
- Include **ClutchComet matched row counts** from [cc-coverage-snapshot.md](./cc-coverage-snapshot.md), not venue-global market totals.
- Triangulate conflicting third-party stats; label metric type (notional vs DEX vs cumulative).
- Use `N/A — not publicly reported` when data is missing. Never invent volume or user counts.
- Include one **fee math example** per venue explainer and compare page where fees are documented.
- Minimum three source URLs in frontmatter `sources` per article.
- Update `updatedAt` when stats are refreshed.
