# LevelUp coding standards

Shared TypeScript compiler defaults for LevelUp repos. **Canonical copy lives in this repo** (`prinx-interface/coding-standards/`) so it is versioned with the reference client implementation.

Other repos (`predictions-api`, `Poly-Proxy`) should **copy this folder** or extend it via a sibling checkout path (see below).

`predictions-api` maintains its own copy at `predictions-api/coding-standards/` with a server-specific `tsconfig/server.json` profile.

## Profiles

| File                    | Use for                                               |
| ----------------------- | ----------------------------------------------------- |
| `tsconfig/base.json`    | Shared strict flags — do not extend directly          |
| `tsconfig/browser.json` | Vite/React clients (`prinx-interface`, Poly-Proxy UI) |
| `tsconfig/node.json`    | Node services, Vite config, scripts                   |

## Enforced by TypeScript (`tsc`)

- `strict` — full strict type-checking
- `noUnusedLocals` / `noUnusedParameters` — dead bindings fail typecheck
- `noFallthroughCasesInSwitch` — no accidental switch fall-through
- `forceConsistentCasingInFileNames` — import paths must match file casing (CI-safe)
- `noImplicitReturns` — every code path in a function with a return type must return
- `noImplicitOverride` — overrides must use the `override` keyword
- `allowUnreachableCode: false` — dead code after `return`/`throw` is an error

## ESLint (browser apps)

ESLint complements `tsc`; it does not replace it. Browser apps use a minimal config for:

- `eslint:recommended`
- `@typescript-eslint/recommended` (with `@typescript-eslint/no-unused-vars` **off** — `tsc` owns unused bindings)
- `react-hooks/recommended`
- `react-refresh/only-export-components` (warn)
- `eslint-config-prettier` (disable ESLint rules that fight Prettier)

Run `yarn lint:strict` (`--max-warnings 0`) before deploy. `build:strict` includes lint on `prinx-interface`.

Reference: [`.eslintrc.cjs`](../.eslintrc.cjs) at repo root.

## Prettier (all LevelUp repos)

Formatting is **Prettier only** — not ESLint, not Biome.

- Shared defaults: [`prettier.config.cjs`](./prettier.config.cjs) (tabs, double quotes, `printWidth: 100`)
- Repo root: `prettier.config.cjs` re-exports this file
- `yarn format` / `yarn format:check`; `build:strict` includes `format:check`

## Adopting in **this repo** (prinx-interface)

**App** (`tsconfig.json`):

```json
{
	"extends": "./coding-standards/tsconfig/browser.json",
	"compilerOptions": { "baseUrl": "./src", "paths": { "@/*": ["*"] } },
	"include": ["src"]
}
```

**Vite config** (`tsconfig.node.json`):

```json
{
	"extends": "./coding-standards/tsconfig/node.json",
	"include": ["vite.config.ts"]
}
```

## Adopting in **other repos**

Pick one:

1. **Copy** — `cp -R prinx-interface/coding-standards predictions-api/coding-standards` and extend `./coding-standards/tsconfig/node.json`.
2. **Sibling checkout** (both repos cloned under `Development/`):
   ```json
   "extends": "../prinx-interface/coding-standards/tsconfig/node.json"
   ```
3. **Copy `.eslintrc.cjs`** from `prinx-interface` for React apps.

Keep copies in sync when `base.json` changes — diff against this repo’s `coding-standards/`.

## Deferred (explicit migration)

Not enabled yet — enable repo-by-repo after a cleanup pass:

- `verbatimModuleSyntax` — require `import type`
- `noUncheckedIndexedAccess` — index reads include `undefined`
- `exactOptionalPropertyTypes` — stricter optional props

## Gates

| Repo            | Command                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| prinx-interface | `yarn build:strict` → typecheck + format:check + lint:strict + vite build   |
| predictions-api | `yarn build:strict` → typecheck + format:check + lint:strict + build:server |
