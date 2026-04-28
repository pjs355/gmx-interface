# prinx E2E venue suite

End-to-end Playwright suite that drives a real browser through buy/sell cycles on every venue (LevelUp, Polymarket, Predict.fun, Limitless, Kalshi via DFlow) using a single matched market resolved from `predictions-api`.

This suite spends real money on mainnet. Read this whole file before running.

**`yarn predeploy` requires `e2e/.user-data/`** (created by `yarn e2e:seed-profile`). If that directory is missing, predeploy fails immediately. In **default** mode it **never** starts `predictions-api` or the frontend — you run **:8080** and **:3010** yourself so the same env as your interactive shell applies.

## Architecture

- `playwright.config.ts` — workers=1 (mainnet, must serialize), 10 min per-spec timeout, 60 min suite timeout.
- `fixtures/authenticated-page.ts` — opens a persistent context against `.user-data/`, then waits for `[data-qa="user-address"]` (only rendered when Privy + signer have an account). Does **not** use a race with the connect button (that caused false “logged out” when the wallet button painted before Privy finished hydrating).
- `fixtures/matched-market.ts` — calls `GET http://localhost:8080/matched-markets`, filters to upcoming events, picks the first Umbrella whose `exchangeMatching` contains all five venue keys (`polymarket`, `levelup`, `predictFun`, `limitless`, `dflow`). If none exists, logs the top-5 candidates with their missing venues and throws.
- `fixtures/funding-precheck.ts` — reads `[data-qa="header-cash"][data-qa-cash-amount=...]` from the header. Throws if balance < $60.
- `fixtures/cleanup.ts` — `afterEach`-style sweep that walks every venue and sells any leftover YES/NO positions. Wrapped in try/catch.
- `fixtures/test.ts` — re-exports a `test` extended with `session`, `authenticatedPage`, and `matchedMarket` fixtures.
- `page-objects/predictions-page.ts` — finds and opens a market card by `data-qa-umbrella-id`.
- `page-objects/tradebox.ts` — `selectVenue`, `setSide`, `setPosition`, `setAmount`, `submit`, `waitForFill`, `getSellableShares`, `sellAll`, `expectClosed`.
- `specs/full-venue-cycle.spec.ts` — the master spec. One test that cycles every venue and re-trades the first venue at the end to exercise LiFi cross-venue rebalancing.
- `scripts/seed-profile.ts` — one-time interactive login that creates `.user-data/`.

## One-time setup

1. Install **Google Chrome** (stable) on your Mac. The seed script and E2E runs use Playwright’s `channel: "chrome"` so **Google OAuth** works; Playwright’s bundled Chromium is often blocked with “This browser or app may not be secure.”

2. Install Playwright’s browser driver for that channel (required once per machine / after upgrading `@playwright/test`):

```bash
yarn playwright install chrome
```

   If you prefer only the Chromium download for non-Google flows: `yarn playwright install chromium` — Google sign-in may still fail in that browser.

3. **Start the app on port 3010** in a separate terminal (`seed-profile` opens `http://localhost:3010` — nothing is started for you):

```bash
yarn dev:live
```

   Or run `yarn dev` and choose **LIVE** so Vite still listens on **3010** (see `vite.config.ts`).

4. Seed the persistent profile (with the dev server still running):

```bash
yarn e2e:seed-profile
```

The script **waits up to 120s** for `http://localhost:3010` to respond before opening the browser. Complete the Privy flow in the window, then close it when you see the portfolio header.

The profile stays valid until the Privy session expires. If the suite later reports `connect-wallet-button is visible`, re-run `e2e:seed-profile`.

## Running the full suite

The suite is designed to run as a predeploy gate for both `prinx-interface` and `predictions-api`. From either repo root:

```bash
# from prinx-interface (default: you already have API :8080 + UI :3010 running)
yarn predeploy

# one-shot build + spawn + teardown (non-interactive env; same as old behavior)
yarn predeploy:bootstrap

# from predictions-api
npm run predeploy
# optional: npm run predeploy -- --bootstrap
```

Both invoke `prinx-interface/scripts/predeploy.ts`.

### Default: `yarn predeploy` (no spawn, no build)

Use this when **you** already start `predictions-api` and the UI the way you normally do (interactive zsh, `.zshrc`, `direnv`, etc.). The script **does not** start child processes, so it inherits **no** responsibility for their env — whatever is listening on **8080** and **3010** is what gets tested.

Before you run `yarn predeploy`, start **`predictions-api`** (so `GET http://localhost:8080/health` works) and the **frontend on 3010** (e.g. `yarn dev:live` or `yarn dev` → LIVE), each in the shell where your env is correct.

The script then:

1. Verifies `e2e/.user-data/` exists.
2. Waits until `http://localhost:8080/health` and `http://localhost:3010/` respond (up to 120s each).
3. Probes `GET /matched-markets`; if no upcoming Umbrella has all 5 venues, prints the top-5 candidates and exits non-zero.
4. Runs Playwright against `http://localhost:3010`.
5. Exits 0 on green; non-zero otherwise. **Does not** stop your servers.

### Optional: `yarn predeploy:bootstrap` (build + spawn + teardown)

One-shot mode for machines where you want the script to `npm run build` / `yarn build`, spawn `node dist/cjs/server.js` and `yarn preview`, run tests, then tear down. Child processes get **only** the env of the Node process that launched them (often **not** the same as an interactive login shell), which is why default mode exists.

After a green predeploy, manually `cd <repo> && railway up`.

## Running the suite directly (`yarn e2e`)

Same Playwright tests as predeploy, but **no** waits and **no** `/matched-markets` probe — you must have **3010** and **8080** up yourself, same as default `yarn predeploy`.

```bash
yarn e2e
```

## Debugging a single venue

The master spec uses `test.step` tagged `@venue-{name}`. Step tags are not first-class for `--grep`, but you can edit `VENUE_ORDER` in `specs/full-venue-cycle.spec.ts` to limit the cycle, or run the spec with the Playwright UI for step-by-step inspection:

```bash
npx playwright test --config e2e/playwright.config.ts --ui
```

## Interpreting failures

- Playwright writes failure artifacts to `e2e/test-results/` (screenshots, videos) and an HTML report to `e2e/playwright-report/`.
- Open the last HTML report: `yarn e2e:report` (same as `yarn playwright show-report e2e/playwright-report`).
- For trace viewer (interactive replay of a failed run):

```bash
npx playwright show-trace e2e/test-results/<spec-folder>/trace.zip
```

- The trace shows every locator query, network request, and console message; it's the fastest path from "test failed" to "I know why."

## What the LiFi rebalance step proves

After cycling every venue, the spec re-buys + re-sells on the first venue (LevelUp by default). After five buys+sells across venues, balances on each venue's account differ from where they started. Re-trading the first venue forces LiFi to move funds back to that venue's account. If LiFi routing is broken, this step fails — typically with an "insufficient balance" or routing error in the trade box.

## Mainnet safety

- `funding-precheck` requires >= $60 cash before any trade.
- `workers: 1` — orders never run in parallel; nonces and order ids never collide.
- `cleanup.ts` runs in a `finally` block after the master spec; it sweeps every venue and sells any leftover position. Wrapped in try/catch so a failure in one venue doesn't block sweeping others.
- Per-spec timeout of 10 minutes; suite timeout 60 minutes. A hung order fails loudly rather than burning money.

## Known constraints

- The persistent profile is locked while Playwright is running; you cannot have another Chromium session open against `.user-data/` simultaneously.
- **`yarn predeploy:bootstrap`** expects `predictions-api` as a sibling of `prinx-interface` on disk (same as before). **Default `yarn predeploy`** does not read that path; it only talks to `http://localhost:8080`.
