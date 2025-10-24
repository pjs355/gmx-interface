# Prinx Interface Documentation

This directory contains technical documentation for understanding the codebase architecture, key concepts, and important files.

## 📚 Documentation Index

-   **[Quick Reference](./quick-reference.md)** - Cheat sheet for common tasks and patterns ⚡
-   **[Core Concepts](./core-concepts.md)** - Essential libraries and patterns used (SWR, Privy, WebSockets)
-   **[File Reference](./file-reference.md)** - What specific files do and why they exist
-   **[Architecture](./architecture.md)** - High-level system design and data flow
-   **[Refactoring Guide](./refactoring-guide.md)** - Migration plan for directory restructure

## 🚀 Quick Start

### New to the codebase? Start here:

1. Read [Core Concepts](./core-concepts.md) to understand SWR, Privy, and other key libraries
2. Review [Architecture](./architecture.md) to understand the overall structure
3. Keep [Quick Reference](./quick-reference.md) handy for common patterns
4. Check [File Reference](./file-reference.md) when you encounter unfamiliar files

### Example: Understanding `swrConfig.tsx`

> "What is `swrConfig.tsx` and why do we need it?"

**Quick Answer**: It configures SWR (Stale-While-Revalidate), our data fetching library. It sets how often data refreshes (10 seconds), disables refresh when you're not looking at the tab, and provides an in-memory cache.

**Learn More**:

-   See [File Reference - swrConfig.tsx](./file-reference.md#srcappswrconfigtsx) for detailed explanation
-   See [Core Concepts - SWR](./core-concepts.md#-swr-stale-while-revalidate) for how and when to use it
-   See [Quick Reference - Fetching Data](./quick-reference.md#fetching-data-with-swr) for code examples

## 🏗️ Project Structure (Current)

```
src/
├── App/              # App initialization & routing
├── components/       # Shared UI components
├── config/          # Configuration files
├── context/         # React Context providers
├── lib/             # Utility functions & services
├── pages/           # Page components
├── styles/          # Global styles
└── index.tsx        # Entry point
```

See [Refactoring Guide](./refactoring-guide.md) for the planned improved structure.

## 📝 Contributing

When adding new files or making significant changes:

1. Update the relevant documentation file
2. Add examples if introducing new patterns
3. Keep file references up to date
