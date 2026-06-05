# Agent docs

Canonical docs for **humans, co-founders, and Cursor agents** on **prinx-interface** (and related `predictions-api` endpoints).

Use **descriptive lowercase filenames** (`guide.md`, `architecture.md`, `standards.md`) — not scattered `README.md` files in this tree.

## Start here

| Doc                                                              | Purpose                                                                            |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [architecture.md](./architecture.md)                             | **Primary reference** — provider tree, data flow, SOR/trade paths (Mermaid)        |
| [diagrams/master-data-flow.mmd](./diagrams/master-data-flow.mmd) | **Master data-flow graph** — edit here first; sync to `architecture.md` §11        |
| [updates/](./updates/)                                           | Per-commit changelog — one dirty `YYYY-MM-DD-HH-MM-updates.md` (UTC) while working |
| [positions-share-sources.md](./positions-share-sources.md)       | Product decision: Positions `shares` source per venue                              |

---

## Mermaid setup (required before reading diagrams)

**Cursor and VS Code do not render Mermaid by default.** Without the extensions below, `architecture.md` §11 and other diagrams look like plain text code blocks.

### Install (one-time)

1. Open the **prinx-interface** repo in Cursor (or VS Code).
2. When prompted, click **Install recommended extensions** — they are listed in [`.vscode/extensions.json`](../.vscode/extensions.json).
3. If you are not prompted: open the **Extensions** panel (`Cmd+Shift+X` / `Ctrl+Shift+X`) and install **both**:

| Extension                        | ID                               | Use for                                                                                      |
| -------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------- |
| Markdown Preview Mermaid Support | `bierner.markdown-mermaid`       | `architecture.md` — Markdown preview (`Cmd+Shift+V` / `Ctrl+Shift+V`) renders fenced Mermaid |
| Mermaid Preview                  | `vstirbu.vscode-mermaid-preview` | `diagrams/master-data-flow.mmd` — Command Palette → **Mermaid Preview: Open Preview**        |

**CLI install (optional):**

```bash
cursor --install-extension bierner.markdown-mermaid
cursor --install-extension vstirbu.vscode-mermaid-preview
```

Use `code` instead of `cursor` if you work in VS Code.

### Verify it works

1. Open [architecture.md](./architecture.md), place the cursor in §11, run **Markdown: Open Preview** — you should see a rendered flowchart, not a ` ```mermaid ` code block.
2. Open [diagrams/master-data-flow.mmd](./diagrams/master-data-flow.mmd), run **Mermaid Preview: Open Preview** — you should see the same master graph.

If preview still shows raw text, reload the window (`Cmd+Shift+P` → **Developer: Reload Window**) after installing.

### Editing the master diagram

1. Edit [diagrams/master-data-flow.mmd](./diagrams/master-data-flow.mmd) first (source of truth).
2. Paste the same body into [architecture.md](./architecture.md) §11 inside the ` ```mermaid ` … ` ``` ` fence.
3. Keep `.mmd` and §11 in sync in one pass (see `.cursor/rules/agent-docs-architecture.mdc`).

### For Cursor agents

When a user opens `architecture.md`, `master-data-flow.mmd`, or asks about data-flow diagrams:

1. **Assume Mermaid extensions may be missing** until the user confirms preview works.
2. **First response** should include the install steps above (both extensions, not just one).
3. Do not tell the user to open `architecture-diagram.html` — that file was removed; preview is extension-based only.
4. After architecture edits that touch the master graph, remind the user to preview §11 and the `.mmd` file to confirm the diagram renders.

---

## Update logs (`updates/`)

- One `*-updates.md` per commit while work is in progress.
- Filename: `{YYYY}-{MM}-{DD}-{HH}-{MM}-updates.md` (UTC) — generate with `date -u +"%Y-%m-%d-%H-%M"`.
- No dirty file → create; one dirty file → append and rename to current UTC.
- Full rules: `.cursor/rules/agent-docs-commit-updates.mdc` at workspace root.

## Architecture doc (`architecture.md`)

- Update when provider order, data ownership, SOR, or major module boundaries change.
- After a passing build, check whether the diff is architecture-relevant (see `.cursor/rules/agent-docs-architecture.mdc`).

## Related (outside this folder)

| Doc                                                                                                                                  | Purpose                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| [../coding-standards/standards.md](../coding-standards/standards.md)                                                                 | Shared `tsconfig` profiles + ESLint policy (versioned in this repo)  |
| [../../refactor-2-handoff.md](../../refactor-2-handoff.md)                                                                           | Refactor-2 snapshot + multi-session project context (workspace root) |
| [../../predictions-api/agent-docs/architecture.md](../../predictions-api/agent-docs/architecture.md)                                 | Server-side architecture (SOR, private API, MongoDB)                 |
| [../../predictions-api/agent-docs/diagrams/master-server-flow.mmd](../../predictions-api/agent-docs/diagrams/master-server-flow.mmd) | Server master flow diagram (counterpart to client master data-flow)  |

## Conventions

- **Multi-session / planned work** → update log entry when status changes, or workspace handoff (e.g. `refactor-2-handoff.md`). Historical snapshots live under [`updates/`](./updates/).
- **Durable policy** → dedicated `agent-docs/<topic>.md` (decision, table, caveats, “ask before changing”).
- **This commit’s work** → append to the dirty file in `updates/` after a passing build (see workspace rule `agent-docs-commit-updates`).
- Prefer `architecture.md` and code paths over duplicate prose elsewhere.

## Workspace rules

Follow [`.cursor/rules/`](../../.cursor/rules/) at the Development workspace root (ask before coding, no fallbacks, `railway up`, commit update logs, architecture maintenance, etc.).
