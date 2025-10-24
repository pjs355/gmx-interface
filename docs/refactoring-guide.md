# Refactoring Guide

This guide outlines the plan to restructure the codebase for better maintainability and scalability.

---

## 🎯 Goals

1. ✅ **Flat pages structure** - Each top-level route is a page
2. ✅ **Feature-based organization** - Group by domain, not file type
3. ✅ **Clear separation of concerns** - Shared vs. feature-specific code
4. ✅ **Better imports** - Use path aliases, not `../../..`
5. ✅ **Consolidated localization** - All translations in one place

---

## 📊 Before vs. After

### Before (Current)

```
src/
├── App/
├── components/              # Mix of shared and specific
├── lib/                     # Mix of services, hooks, utils
├── pages/
│   └── Predictions/
│       ├── Admin/          ❌ Should be top-level
│       ├── components/
│       ├── hooks/
│       └── utils/
├── de/, en/, es/, ...      ❌ Scattered language files
└── utils/                  # Test utilities
```

### After (Target)

```
src/
├── app/                    # Renamed, routing focused
│   └── routes/
├── pages/                  # Flat structure
│   ├── Admin/             ✅ Top-level
│   ├── Predictions/
│   ├── Positions/
│   └── ...
├── features/              🆕 Domain-organized
│   ├── predictions/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── utils/
│   ├── admin/
│   └── positions/
├── shared/                🆕 Truly reusable
│   ├── components/
│   ├── hooks/
│   └── utils/
├── services/              🆕 External APIs
│   ├── api/
│   ├── firebase/
│   └── wallets/
├── assets/                🆕 Static files
│   ├── images/
│   └── game-logos/
└── locales/               ✅ Consolidated
    ├── en/
    ├── es/
    └── ...
```

---

## 🚀 Migration Steps

### Phase 1: Setup (15 minutes)

#### 1.1 Create new directory structure

```bash
cd src/

# Create main directories
mkdir -p features shared services assets

# Create feature subdirectories
mkdir -p features/{predictions,admin,positions}/{components,hooks,services,utils}

# Create shared subdirectories
mkdir -p shared/{components/{ui,layout,business},hooks,utils,types}

# Create service subdirectories
mkdir -p services/{api,firebase,lvlup,wallets,errors}

# Create assets subdirectories
mkdir -p assets/{images,game-logos,fonts}

# Rename App to app
mv App app
mkdir -p app/routes
```

#### 1.2 Update `tsconfig.json` with path aliases

```json
{
	"compilerOptions": {
		"baseUrl": ".",
		"paths": {
			"@/*": ["./src/*"],
			"@/app/*": ["./src/app/*"],
			"@/pages/*": ["./src/pages/*"],
			"@/features/*": ["./src/features/*"],
			"@/shared/*": ["./src/shared/*"],
			"@/services/*": ["./src/services/*"],
			"@/config/*": ["./src/config/*"],
			"@/context/*": ["./src/context/*"],
			"@/assets/*": ["./src/assets/*"],
			"@/styles/*": ["./src/styles/*"]
		}
	}
}
```

#### 1.3 Update `vite.config.ts` with aliases

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@/app": path.resolve(__dirname, "./src/app"),
			"@/pages": path.resolve(__dirname, "./src/pages"),
			"@/features": path.resolve(__dirname, "./src/features"),
			"@/shared": path.resolve(__dirname, "./src/shared"),
			"@/services": path.resolve(__dirname, "./src/services"),
			"@/config": path.resolve(__dirname, "./src/config"),
			"@/context": path.resolve(__dirname, "./src/context"),
			"@/assets": path.resolve(__dirname, "./src/assets"),
			"@/styles": path.resolve(__dirname, "./src/styles"),
		},
	},
});
```

---

### Phase 2: Move Files (1-2 hours)

#### 2.1 Move routing files

```bash
cd src/app/
mv AppRoutes.tsx routes/
mv MainRoutes.tsx routes/
mv HomeRoutes.tsx routes/
```

Update imports in `App.tsx`:

```typescript
import AppRoutes from "./routes/AppRoutes";
```

---

#### 2.2 Move Admin to top-level

```bash
mv pages/Predictions/Admin/ pages/Admin/
```

Update route in `app/routes/MainRoutes.tsx`:

```typescript
// Before
import Admin from "pages/Predictions/Admin/Admin";

// After
import Admin from "@/pages/Admin/Admin";
```

---

#### 2.3 Move prediction-specific code to features

##### Components

```bash
# Prediction-specific components
mv pages/Predictions/components/PredictionCard.tsx features/predictions/components/
mv pages/Predictions/components/SingleMarketActions.tsx features/predictions/components/
mv pages/Predictions/components/MultiMarketActions.tsx features/predictions/components/
mv pages/Predictions/components/LoadingState.tsx features/predictions/components/

# Market header/panels
mv pages/Predictions/PredictionMarket/MarketHeader.tsx features/predictions/components/
mv pages/Predictions/PredictionMarket/MarketPanels.tsx features/predictions/components/

# Large components (keep structure)
mv components/PredictionMarketChart/ features/predictions/components/
mv components/PredictionMarketTradeBox/ features/predictions/components/
mv components/OrderbookDisplay/ features/predictions/components/
```

##### Hooks

```bash
mv pages/Predictions/hooks/usePredictionData.ts features/predictions/hooks/
mv pages/Predictions/PredictionMarket/usePredictionMarket.ts features/predictions/hooks/
mv pages/Predictions/PredictionMarket/useChartState.ts features/predictions/hooks/
```

##### Services

```bash
mv lib/predictionMarketService.ts features/predictions/services/
mv lib/predictionMarketDataService.ts features/predictions/services/
mv lib/orderbookService.ts features/predictions/services/
mv lib/simplifiedOrderService.ts features/predictions/services/
mv lib/predictionMarketCache.ts features/predictions/services/
```

##### Utils

```bash
mv pages/Predictions/utils/predictionUtils.ts features/predictions/utils/
mv pages/Predictions/utils/gameLogoResolver.ts features/predictions/utils/
mv pages/Predictions/utils/umbrellaBanners.ts features/predictions/utils/
mv pages/Predictions/PredictionMarket/utils.ts features/predictions/utils/marketUtils.ts
```

---

#### 2.4 Move shared components

```bash
# UI components
mv components/Button/ shared/components/ui/
mv components/Modal/ shared/components/ui/
mv components/Tabs/ shared/components/ui/
mv components/Tooltip/ shared/components/ui/
mv components/Common/Loader.* shared/components/ui/
mv components/Common/SpinningLoader.* shared/components/ui/
mv components/Common/Card.* shared/components/ui/

# Layout components
mv components/Header/ shared/components/layout/
mv components/Footer/ shared/components/layout/
mv components/ScrollableTable/ shared/components/layout/

# Business components
mv components/AddressDropdown/ shared/components/business/
mv components/NetworkDropdown/ shared/components/business/
mv components/OneClickButton/ shared/components/business/
```

---

#### 2.5 Move shared hooks

```bash
mv lib/useBowser.ts shared/hooks/
mv lib/usePolling.ts shared/hooks/
mv lib/usePrevious.ts shared/hooks/
mv lib/useRouteQuery.ts shared/hooks/
mv lib/useNotifyModalState.ts shared/hooks/
mv lib/useRedirectPopupTimestamp.ts shared/hooks/
```

---

#### 2.6 Move shared utils

```bash
mv lib/dates.ts shared/utils/
mv lib/numbers/ shared/utils/
mv lib/sleep.ts shared/utils/
mv lib/chains.ts shared/utils/
mv lib/legacy.ts shared/utils/
```

---

#### 2.7 Move services

```bash
# API services
mv lib/umbrellaDataService.ts services/api/
mv lib/currentPriceService.ts services/api/
mv lib/predictionApiBase.ts services/api/

# Firebase
mv lib/firebase.ts services/firebase/
mv lib/firebaseStorage.ts services/firebase/

# LvlUp services
mv lib/lvlup/ services/

# Wallet services
mv lib/wallets/ services/

# Error handling
mv lib/errors/ services/

# RPC
mv lib/rpc/ services/
```

---

#### 2.8 Move assets

```bash
mv img/ assets/images/
mv pages/Predictions/GameLogos/ assets/game-logos/
```

---

#### 2.9 Clean up language files

```bash
# Keep only locales/ directory
# Delete root-level language folders (they duplicate locales/)
rm -rf de/ en/ es/ fr/ ja/ ko/ pseudo/ ru/ zh/
```

---

### Phase 3: Update Imports (1-2 hours)

This is the most tedious part. Use your IDE's "Find & Replace in Files" feature.

#### 3.1 Update routing imports

```typescript
// In app/App.tsx
import AppRoutes from "./routes/AppRoutes";
import { SWRConfigProp } from "./swrConfig";
```

#### 3.2 Update feature imports

```typescript
// Before
import { PredictionCard } from "pages/Predictions/components/PredictionCard";
import { usePredictionMarket } from "pages/Predictions/PredictionMarket/usePredictionMarket";
import { predictionMarketService } from "lib/predictionMarketService";

// After
import { PredictionCard } from "@/features/predictions/components/PredictionCard";
import { usePredictionMarket } from "@/features/predictions/hooks/usePredictionMarket";
import { predictionMarketService } from "@/features/predictions/services/predictionMarketService";
```

#### 3.3 Update shared imports

```typescript
// Before
import Button from "components/Button/Button";
import { usePolling } from "lib/usePolling";
import { formatDate } from "lib/dates";

// After
import Button from "@/shared/components/ui/Button/Button";
import { usePolling } from "@/shared/hooks/usePolling";
import { formatDate } from "@/shared/utils/dates";
```

#### 3.4 Update service imports

```typescript
// Before
import { umbrellaDataService } from "lib/umbrellaDataService";
import { firebase } from "lib/firebase";
import { getPredictionApiBaseUrl } from "lib/predictionApiBase";

// After
import { umbrellaDataService } from "@/services/api/umbrellaDataService";
import { firebase } from "@/services/firebase/firebase";
import { getPredictionApiBaseUrl } from "@/services/api/predictionApiBase";
```

#### 3.5 Update asset imports

```typescript
// Before
import icon from "img/icon.svg";
import logo from "../GameLogos/lol.webp";

// After
import icon from "@/assets/images/icon.svg";
import logo from "@/assets/game-logos/lol.webp";
```

#### 3.6 Update context imports

```typescript
// Before
import { usePredictionData } from "context/PredictionDataContext";

// After
import { usePredictionData } from "@/context/PredictionDataContext";
```

---

### Phase 4: Cleanup (30 minutes)

#### 4.1 Delete empty directories

```bash
# After moving all files, remove empty folders
find src/ -type d -empty -delete
```

#### 4.2 Delete old language directories

```bash
cd src/
rm -rf de/ en/ es/ fr/ ja/ ko/ pseudo/ ru/ zh/
```

#### 4.3 Update documentation

-   Update this guide with any lessons learned
-   Update README.md with new structure
-   Add comments to complex files

---

### Phase 5: Testing (30 minutes)

#### 5.1 Check for build errors

```bash
npm run build
```

Fix any import errors that were missed.

#### 5.2 Test dev server

```bash
npm run dev
```

Navigate through all pages to ensure nothing is broken.

#### 5.3 Test key flows

-   [ ] Login/logout
-   [ ] View predictions
-   [ ] Place an order
-   [ ] View positions
-   [ ] Admin panel (if you have access)

---

## 📝 Find & Replace Patterns

Use these patterns in your IDE's "Replace in Files" feature:

### Routing

```
Find:    from ['"]App/
Replace: from '@/app/

Find:    from ['"]\.\.\/App/
Replace: from '@/app/
```

### Features - Predictions

```
Find:    from ['"].*pages/Predictions/components/
Replace: from '@/features/predictions/components/

Find:    from ['"].*lib/predictionMarket
Replace: from '@/features/predictions/services/predictionMarket

Find:    from ['"].*lib/orderbook
Replace: from '@/features/predictions/services/orderbook

Find:    from ['"].*lib/simplifiedOrder
Replace: from '@/features/predictions/services/simplifiedOrder
```

### Shared Components

```
Find:    from ['"].*components/Button
Replace: from '@/shared/components/ui/Button

Find:    from ['"].*components/Modal
Replace: from '@/shared/components/ui/Modal

Find:    from ['"].*components/Header
Replace: from '@/shared/components/layout/Header

Find:    from ['"].*components/Footer
Replace: from '@/shared/components/layout/Footer
```

### Shared Hooks

```
Find:    from ['"].*lib/use([A-Z][a-zA-Z]*)['"]
Replace: from '@/shared/hooks/use$1'
```

### Services

```
Find:    from ['"].*lib/umbrellaDataService
Replace: from '@/services/api/umbrellaDataService

Find:    from ['"].*lib/firebase
Replace: from '@/services/firebase/firebase

Find:    from ['"].*lib/predictionApiBase
Replace: from '@/services/api/predictionApiBase
```

### Assets

```
Find:    from ['"]img/
Replace: from '@/assets/images/

Find:    from ['"].*GameLogos/
Replace: from '@/assets/game-logos/
```

### Context

```
Find:    from ['"]context/
Replace: from '@/context/

Find:    from ['"]\.\.\/context/
Replace: from '@/context/
```

---

## ⚠️ Gotchas & Tips

### 1. Check for dynamic imports

Some imports might be using `import()` for code splitting:

```typescript
const { OrderbookService } = await import("lib/orderbookService");
```

These need to be updated too!

### 2. SCSS imports might not support aliases

If you get errors with SCSS imports, you may need to configure Vite to handle them:

```typescript
// vite.config.ts
css: {
  preprocessorOptions: {
    scss: {
      includePaths: ['src'],
    },
  },
},
```

Or use relative imports for SCSS.

### 3. Test files

Don't forget to update imports in any test files (`.test.ts`, `.spec.ts`).

### 4. Image imports in SCSS

SCSS files might reference images. Update those too:

```scss
// Before
background-image: url("../img/icon.svg");

// After
background-image: url("@/assets/images/icon.svg");
```

### 5. Vite glob imports

Files like `gameLogoResolver.ts` use Vite's `import.meta.glob`:

```typescript
// Before
import.meta.glob("../GameLogos/*.{png,jpg}");

// After
import.meta.glob("@/assets/game-logos/*.{png,jpg}");
```

### 6. Git history

Consider using `git mv` instead of regular `mv` to preserve file history:

```bash
git mv pages/Predictions/Admin pages/Admin
```

---

## 📊 Progress Checklist

Use this to track your progress:

### Setup

-   [ ] Created new directory structure
-   [ ] Updated `tsconfig.json` paths
-   [ ] Updated `vite.config.ts` aliases

### File Moves

-   [ ] Moved routing files to `app/routes/`
-   [ ] Moved Admin to top-level pages
-   [ ] Moved prediction components to `features/predictions/components/`
-   [ ] Moved prediction hooks to `features/predictions/hooks/`
-   [ ] Moved prediction services to `features/predictions/services/`
-   [ ] Moved prediction utils to `features/predictions/utils/`
-   [ ] Moved shared components to `shared/components/`
-   [ ] Moved shared hooks to `shared/hooks/`
-   [ ] Moved shared utils to `shared/utils/`
-   [ ] Moved API services to `services/api/`
-   [ ] Moved Firebase to `services/firebase/`
-   [ ] Moved images to `assets/images/`
-   [ ] Moved game logos to `assets/game-logos/`
-   [ ] Deleted duplicate language folders

### Import Updates

-   [ ] Updated app/routing imports
-   [ ] Updated feature imports (predictions)
-   [ ] Updated shared component imports
-   [ ] Updated shared hook imports
-   [ ] Updated service imports
-   [ ] Updated asset imports
-   [ ] Updated context imports
-   [ ] Updated SCSS imports

### Testing

-   [ ] Build passes (`npm run build`)
-   [ ] Dev server runs (`npm run dev`)
-   [ ] All pages load
-   [ ] Key user flows work
-   [ ] No console errors

### Documentation

-   [ ] Updated README with new structure
-   [ ] Added comments to complex moves
-   [ ] Documented any issues encountered

---

## 🎉 Success Criteria

You know the refactor is complete when:

1. ✅ No relative imports with more than 2 levels (`../../`)
2. ✅ All imports use path aliases (`@/...`)
3. ✅ `src/lib/` only contains what doesn't fit elsewhere
4. ✅ Pages are flat, not nested
5. ✅ Features are self-contained
6. ✅ Build and dev server work
7. ✅ All tests pass (if you have them)

---

## 🆘 Rollback Plan

If things go wrong:

```bash
# Stash your changes
git stash

# Or create a backup branch first
git checkout -b refactor-backup
git checkout main
```

Always commit working code before starting the refactor!
