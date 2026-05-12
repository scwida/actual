# CLAUDE.md — Project Brief

> Read this file at the start of every session. This is the source of truth for what we're building, how it should look, and how we work together.

---

## 1. What We're Building

This is a **personal family budgeting app** built on a forked version of [Actual Budget](https://actualbudget.org). The app extends Actual Budget with a new **Paycheck Planner** feature and a redesigned UI. The goal is a clean, modern, family-friendly budgeting tool that two spouses can use together to allocate every dollar before it's spent.

The app name has not been decided yet. Use `BudgetApp` as a placeholder throughout the codebase and UI until a name is chosen. When a name is decided, do a full find-and-replace across the project.

**Target users:** A family/couple (currently modeled on Scott and Katie) who receive multiple paychecks per month and want to plan each one in advance — zero-based budgeting style.

---

## 2. How We Work Together

- **I am the CEO / product owner.** I describe features, changes, and design decisions in plain English.
- **You are the builder.** You write all the code, make all edits, run commands, and handle the terminal. I do not write code myself.
- **Always show me a plan first** before making large changes. For small changes (wording, color, minor layout), just do it.
- **Ask me one clarifying question** if something is genuinely ambiguous. Don't ask multiple questions at once.
- **Never leave the app broken.** If a change could break something, warn me first and suggest a safe approach.
- **Preserve existing Actual Budget functionality** unless I specifically ask you to change it. We're adding on top, not tearing down.

---

## 3. Tech Stack & Codebase Structure

This project is a fork of Actual Budget. Before making any changes, understand this structure.

**Primary language:** TypeScript with React
**Build system:** Yarn 4 workspaces (monorepo) — **always run yarn commands from the root directory, never from child workspaces**
**Node.js required:** >=22
**Yarn required:** ^4.9.1

### Key Packages

| Package             | Path                          | Purpose                                                   |
| ------------------- | ----------------------------- | --------------------------------------------------------- |
| `loot-core`         | `packages/loot-core/`         | Core business logic, DB, calculations — platform-agnostic |
| `desktop-client`    | `packages/desktop-client/`    | React UI for web and desktop (alias: `@actual-app/web`)   |
| `desktop-electron`  | `packages/desktop-electron/`  | Electron wrapper for desktop app                          |
| `component-library` | `packages/component-library/` | Shared reusable React components, icons, design tokens    |
| `sync-server`       | `packages/sync-server/`       | Express sync server for multi-device                      |
| `api`               | `packages/api/`               | Public programmatic API (alias: `@actual-app/api`)        |

### Where New Code Goes

- **New UI components** → `packages/desktop-client/src/components/`
- **New React hooks** → `packages/desktop-client/src/hooks/`
- **New shared UI components** → `packages/component-library/src/`
- **New business logic** → `packages/loot-core/src/`
- **New type definitions** → `packages/loot-core/src/types/`
- **Do NOT touch** → `packages/*/lib-dist/`, `packages/*/dist/`, `packages/*/build/` (generated artifacts)
- **Do NOT manually edit** → `packages/component-library/src/icons/` (auto-generated)

### Essential Commands

```bash
# Start the app (browser dev server on port 3001)
yarn start

# Start with sync server (port 5006) — needed for multi-device sync features
yarn start:server-dev

# Type checking — ALWAYS run before finishing any task
yarn typecheck

# Linting with auto-fix
yarn lint:fix

# Run all tests (uses lage for parallel execution across workspaces)
yarn test

# Run tests without cache (use when tests behave unexpectedly)
yarn test:debug

# Clear lage cache if tests behave unexpectedly
rm -rf .lage
```

> **Testing the app manually:** On the setup screen, choose "Don't use a server" then click **"View demo"**. This loads a pre-populated budget with realistic sample data — much more useful than an empty budget for testing new features.

---

## 4. Coding Standards

These rules come from `AGENTS.md` and `CODE_REVIEW_GUIDELINES.md` in this project. Follow them on every change without exception.

### TypeScript

- Run `yarn typecheck` after every significant change — fix all errors before finishing
- **No `@ts-strict-ignore` comments** — fix the underlying type issue instead
- **Prefer `satisfies` over `as`** for type coercions (provides better type safety and inference)
- **Avoid `any` and `unknown`** unless absolutely necessary; if used, add a comment explaining why
- **Prefer `type` over `interface`**
- Look for existing type definitions in `packages/loot-core/src/types/` before creating new ones

### Linting

- Run `yarn lint:fix` after every change
- **No `eslint-disable` or `oxlint-disable` comments** — fix the underlying issue instead
- Use absolute imports in `desktop-client` (ESLint enforces this)

### React & JavaScript Patterns

- **Named exports only** — no default exports
- **Functional components** — no class components
- **Named imports from React** — use `import { useState } from 'react'`, not `React.useState`
- Imports must be properly ordered (ESLint enforces this automatically with lint:fix)

### Internationalization (i18n)

- **All user-facing strings must be wrapped for translation** — no raw hardcoded strings in UI
- Prefer `Trans` component over `t()` function where possible
- ESLint rule `actual/no-untranslated-strings` will catch violations at lint time
- This applies to all new text in the Paycheck Planner and any other new features

### Financial Numbers

- Standalone financial numbers must use tabular number styles
- Wrap with `FinancialText` component, or apply `styles.tnum` directly if wrapping isn't possible

### Settings Philosophy

- **Do not add new settings for every UI tweak**
- Prefer theme/design tokens or hardcoded values over adding user-facing settings
- Any new setting must provide meaningful value and align with the app's simplicity goals

### Testing

- Minimize mocked dependencies — prefer real implementations over mocks
- Unit tests go alongside source files or in `__tests__/` directories
- Use `.test.ts` / `.test.tsx` / `.spec.js` file extensions
- Vitest globals available: `describe`, `it`, `expect`, `beforeEach`, etc.

### Commits

- **ALL commit messages and PR titles must be prefixed with `[AI]`** — no exceptions
- See `.github/agents/pr-and-commit-rules.md` for the full specification

### Pre-commit Checklist

Before finishing any task, confirm all of these:

- [ ] `yarn typecheck` passes with no errors
- [ ] `yarn lint:fix` has been run
- [ ] Relevant tests still pass
- [ ] All user-facing strings are wrapped for translation
- [ ] No `@ts-strict-ignore`, `eslint-disable`, or bare `any` added without documented justification
- [ ] No default exports introduced
- [ ] Commit message prefixed with `[AI]`

---

## 5. Design System

This design system is derived from the Paycheck Planner mockup. Apply it consistently across all new UI. Always check `packages/component-library/src/` for existing tokens and components before building new ones.

### Typography

- **Font:** Inter (Google Fonts) — weights 300–700
- **Scale:** `text-xs` 0.75rem / `text-sm` 0.875rem (default) / `text-base` 1rem / `text-lg` 1.125rem / `text-xl` 1.5rem

### Color Tokens

**Light Mode:**

```
--color-bg: #f5f7fa
--color-surface: #ffffff
--color-surface-2: #f9fafb
--color-surface-offset: #f0f2f5
--color-divider: #e4e7ec
--color-border: #d0d5dd
--color-text: #101828
--color-text-muted: #475467
--color-text-faint: #98a2b3
--color-primary: #0d7e82
--color-primary-hover: #095f63
--color-primary-light: #e6f4f5
--color-success: #027a48
--color-warning: #b54708
--color-error: #b42318
--color-snowball: #6941c6
--color-snowball-bg: #f4f3ff
```

**Dark Mode** (`data-theme="dark"` on `<html>`):

```
--color-bg: #101828
--color-surface: #1d2939
--color-surface-2: #253347
--color-primary: #4db8bc
--color-success: #12b76a
--color-warning: #f79009
--color-error: #f97066
--color-snowball: #9b8afb
--color-snowball-bg: #1f1148
```

**Sidebar (always dark, regardless of theme):**

```
--sidebar-bg: #1d2939
--sidebar-text: #d0d5dd
--sidebar-muted: #667085
--sidebar-accent: #4db8bc
```

### Spacing, Radius & Shadows

```
Spacing: --space-1: 0.25rem | --space-2: 0.5rem | --space-3: 0.75rem
         --space-4: 1rem    | --space-5: 1.25rem | --space-6: 1.5rem | --space-8: 2rem

Radius:  --radius-sm: 0.375rem | --radius-md: 0.5rem | --radius-lg: 0.75rem
         --radius-xl: 1rem     | --radius-full: 9999px

Shadows: --shadow-sm: 0 1px 2px rgba(16,24,40,0.05)
         --shadow-md: 0 4px 8px -2px rgba(16,24,40,0.1), 0 2px 4px -2px rgba(16,24,40,0.06)

Motion:  --transition: 150ms cubic-bezier(0.16, 1, 0.3, 1)
```

---

## 6. Layout Structure

```
body (flex, horizontal)
├── #sidebar (240px, fixed dark, full height)
│   ├── Logo + App name + Budget name
│   ├── Nav sections with labels
│   ├── Nav items (active = left accent bar + slightly brighter)
│   └── Dark/Light mode toggle (pinned to bottom)
└── #main-content (flex-1)
    ├── #topbar (56px height, title + subtitle + action buttons right-aligned)
    └── #page-content (scrollable, padded)
```

**Mobile (≤768px):** Sidebar becomes an off-screen drawer. Page layout collapses to single column.

---

## 7. Navigation Structure

**Budget section:**

- Overview
- Paycheck Planner ← flagship new feature
- Categories
- Accounts

**Reports section:**

- Spending
- Debt Snowball

---

## 8. Flagship Feature: Paycheck Planner

This is the most important new feature. It does not exist in stock Actual Budget.

### Concept

A zero-based paycheck allocation tool. For each paycheck, the user assigns every dollar to a budget category before spending it. The goal: every paycheck reaches $0 remaining ("balanced").

### Key Components

#### Income Strip (dark bar at top of planner page)

Displays for the active paycheck:

- Paycheck Date
- Scott's income | Katie's income | Total Income (teal highlight)
- Budgeted so far | Left to Budget (color shifts: teal → yellow → red)
- Paycheck chips for navigation within the month (prev/next arrows)
- Status pills: "Paycheck balanced" / "Underallocated" / "Overallocated"
- Month status: "Month: Zero-based" or "Month: $X underfunded"
- Suggestions toggle (On / Off)
- Edit Paycheck button → opens modal

#### Paycheck Navigation Panel (sticky left panel)

- Lists all paychecks for the year
- Each entry: date, total amount, unallocated remainder, status dot (complete / partial / pending)
- Hidden on mobile

#### Allocation Table (main content)

Categories grouped into collapsible accordion sections:

- 💰 Savings & Giving
- 🛒 Weekly Needs
- 🎉 Weekly Wants
- 📋 Monthly Bills
- 📆 Monthly Expenses
- 🗓 Annual Expenses

**Each category row:**
| Column | Description |
|---|---|
| Category | Name + detail note (e.g. "Autopay", "Debt Snowball") |
| Monthly Budget | Monthly target amount |
| Budgeted Previously | Sum from all earlier paychecks this month |
| This Paycheck | Editable input — **Enter moves focus to next row** |
| Remaining | Red if underfunded, faint gray if zero |
| Progress | % bar showing total funded vs monthly target |
| Status | Not started / Funded / $X remaining / $X over goal |

Smart suggestion appears below the input when active (clickable to apply).

#### Smart Suggestions Engine

When suggestions are enabled, each category shows a recommended amount for this paycheck:

1. Monthly target minus what was already allocated in prior paychecks this month = remaining needed
2. Split that remainder across all remaining paychecks in the month, weighted by each paycheck's total income
3. If a bill's due date is on or before this paycheck's date, allocate the full remaining amount now
4. Only display the suggestion if the current input is less than the suggested amount

#### Debt Snowball Integration

Debt categories use purple styling (`--color-snowball` text, `--color-snowball-bg` row background). Link to the Debt Snowball report page.

---

## 9. Data Models

### Category

```ts
type Category = {
  group:
    | 'SAVINGS'
    | 'WEEKLY NEEDS'
    | 'WEEKLY WANTS'
    | 'MONTHLY BILLS'
    | 'MONTHLY'
    | 'ANNUAL';
  name: string;
  budget: number; // monthly dollar target
  due: number; // day of month due (use 31 for end of month)
  detail: string; // shown under name (e.g. "1st // Autopay")
  snowball?: boolean; // true = debt snowball category (purple styling)
};
```

### Paycheck

```ts
type Paycheck = {
  id: string; // unique ID e.g. 'p19'
  date: string; // 'YYYY-MM-DD'
  scott: number; // Scott's net pay
  katie: number; // Katie's net pay
  other: number; // any other income
  allocations: Record<string, number>; // categoryName → dollar amount allocated
};
```

---

## 10. UI Behavior Rules

- **Dark/light mode:** Toggled by `data-theme` attribute on `<html>`. Respects `prefers-color-scheme` on first load.
- **Collapsible sections:** Clicking a section header toggles it. Collapsed sections hide the table but show the running total.
- **Input keyboard:** `Enter` key moves focus to the next amount input in the table.
- **Color logic for "Left to Budget":** > $50 → teal | < $50 → yellow (`#fbbf24`) | < $0 → red
- **Color logic for "Remaining":** > $0 → red | = $0 → faint gray
- **Modals:** Dark overlay, centered card, Esc or Cancel closes without saving.
- **Buttons:** `.btn-primary` (teal bg, white text) | `.btn-secondary` (white bg, border, dark text) | `.btn-sm` modifier for smaller size

---

## 11. Features on the Roadmap

Build these only when I ask:

1. **Named app / branding** — replace BudgetApp placeholder once name is chosen
2. **Overview dashboard** — spending summary, monthly progress, net worth snapshot
3. **Spending reports** — trend charts by category over time
4. **Shared family view** — cloud sync so both Scott and Katie see the same budget
5. **Mobile-optimized experience** — full responsive layout with touch-friendly inputs
6. **Simpler onboarding** — guided setup wizard for income and categories
7. **Bank import improvements** — friendlier than stock Actual Budget
8. **Bill reminders / alerts**

---

## 12. What NOT to Change Without Asking

- Core Actual Budget data layer, sync engine, or database schema
- Any existing Actual Budget feature that is currently working
- `packages/component-library/src/icons/` — auto-generated, do not touch
- `packages/*/lib-dist/`, `packages/*/dist/`, `packages/*/build/` — build artifacts
- Root config files: `eslint.config.mjs`, `tsconfig.json`, `yarn.lock`, `lage.config.js`

---

## 13. Key Reference Files in This Project

Read these when relevant — they contain rules that apply to this codebase:

| File                                    | What it covers                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `AGENTS.md`                             | Full AI agent development guide — commands, architecture, patterns, gotchas   |
| `CODE_REVIEW_GUIDELINES.md`             | Code quality rules — TypeScript, linting, i18n, testing, financial typography |
| `CONTRIBUTING.md`                       | Points to community contribution docs                                         |
| `.github/agents/pr-and-commit-rules.md` | Commit message and PR rules (`[AI]` prefix required)                          |
