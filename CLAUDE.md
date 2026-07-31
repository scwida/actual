# CLAUDE.md — Project Brief

> Read this file at the start of every session. This is the source of truth for what we're building, how it should look, and how we work together.

---

## 1. What We're Building

This is a **personal family budgeting app** built on a forked version of [Actual Budget](https://actualbudget.org). The app extends Actual Budget with a new **Paycheck Planner** feature and a redesigned UI. The goal is a clean, modern, family-friendly budgeting tool that two spouses can use together to allocate every dollar before it's spent.

The app is named **myEnvelopes**. Domain: myenvelopes.app (planned purchase). All UI, docs, and code should use this name — no more `BudgetApp` placeholder.

**Target users:** A family/couple (currently modeled on Scott and Katie) who receive multiple paychecks per month and want to plan each one in advance — zero-based budgeting style.

---

## ⭐ CURRENT DIRECTION — The Envelope System (read this before anything else)

**This section is the authoritative product philosophy as of 2026-07-29.** It supersedes any prior assumptions baked into Section 8 (Paycheck Planner) and Section 9 (Data Models) below, both of which are kept only as historical reference for what was built before this direction was set — not as a spec to build toward. Where anything elsewhere in this file conflicts with this section, this section wins. There is also a UI mockup in Claude Design (the frosted-glass myEnvelopes concept) whose **visuals** still apply (see Section 5) but whose **functional behavior reflects the old model** — don't treat its interactions as spec.

### The core idea

The app should behave like real physical envelopes, not like a spreadsheet. An envelope is a place you put actual dollars so they have a job. You can always see if an envelope has enough money to do the thing you want to do with it. The system should never let you believe you have money you don't actually have.

### Three tentpoles

1. **The Ledger** — bank/cash accounts. The one and only source of truth for real money, and the hard ceiling on the whole system. Supports manual transaction entry and bank import/reconciliation (match imported transactions against manually entered ones, clear/reconcile like traditional accounting).
2. **The Envelopes** — the current real state. Every envelope holds a real, stored dollar balance (not a computed "budgeted minus spent" formula). The sum of all envelope balances must never exceed the total across ledger accounts. This is the core invariant of the whole app.
3. **The Planner** — the forecast. Plan future income (e.g. next Friday's paycheck) and draft how you intend to allocate it across envelopes, entirely separate from real envelope balances until that income is actually verified and committed.

### How money moves (four movement types)

1. **Ledger → Envelope (funding).** Real inflow gets assigned to one or more envelopes. Includes committing a planned paycheck, and manually allocating any other deposit (refund, gift, cash sale, interest).
2. **Envelope → Ledger (spending).** Buying something debits an envelope regardless of payment method — debit, credit card, or cash, the envelope doesn't care how you paid, only whether the money was there. Credit card purchases debit the envelope immediately (Actual/YNAB convention); the card's outstanding balance is tracked as a separate liability funded by a reserved payment pool.
3. **Envelope → Envelope (transfer).** Frictionless, no confirmation walls — like moving cash between two physical envelopes. Updates goal progress on both envelopes immediately. This is a first-class feature, not a workaround: the system should make it trivially easy to reallocate as life happens, and over time this is how a family learns their real spending patterns (a report showing transfer frequency per envelope is a good later feature).
4. **Unallocated holding.** A generic "Unallocated" envelope catches deposits with no chosen destination yet (e.g. a manual deposit you haven't decided about). The app should gently nudge/remind the user to go allocate it — steering, not gating.

### Envelope rules

- **Account-agnostic.** An envelope is a pooled claim against total ledger balance, not pinned to one bank account. It doesn't care which account is actually funding it.
- **Negative balances are allowed but discouraged.** If an allocation or purchase would take an envelope negative, the app should recommend a specific cover transfer (from another envelope or unallocated cash) but let the user dismiss it and proceed anyway. Never hard-block — the goal is a gentle nudge, not strong-arming the budgeter out of the philosophy.
- **Goals with dates.** An envelope can have a target balance and target date; the app computes a suggested per-paycheck/weekly/monthly contribution to hit it (generalizes the old "Smart Suggestions" concept beyond just paychecks).
- **Envelopes are personal.** The app assists and suggests, it never prescribes. Two families' envelope setups can look completely different — the system should never assume there's one "correct" way to categorize or prioritize.

### The Planner, precisely

- A **planned paycheck** (or any planned income) is a forecast: expected date, expected amount, and draft allocations to envelopes. Creating or editing a plan touches **zero** real envelope balances.
- **Committing** a plan is the real event: verify the actual deposit against the ledger, then the draft allocations become real envelope deposits and balances actually move.
- **Live drift indicators.** While a plan is still in draft state, the planner shows each planned allocation next to the envelope's *current real balance*, live — not just at commit time. If other activity (an overspend/borrow, another paycheck committing) has changed that envelope since the allocation was drafted, the row reflects it immediately. The goal is to keep plans realistic, not aspirational — the user should never be "living in a dream world" relative to their real envelopes.
- Plans further in the future can have stale assumptions once an earlier plan commits differently than expected. Surface this lazily (a badge on the affected future plan), not as a running alert.

### Sync & audit trail

- **Real-time updates**, Google-Sheets style: refresh on sign-in and on field-blur (leave the cell), so two people acting concurrently (e.g. Scott and Katie) see each other's changes without manual refresh.
- **Historical lock-in.** A committed transaction and its allocations are the permanent record. Edits after the fact are allowed but must show up in a recent-activity/audit log (YNAB's "recent moves" model), not silently overwrite history.

### What this means for the engine

The current budget engine (`packages/loot-core/src/server/budget/`) computes category "budgeted / spent / leftover" live from formula cells — a classic YNAB-style decoupled model. That is structurally incompatible with "an envelope holds a real, stored balance" and needs a genuine rewrite, not a patch. The ledger, sync, accounts-as-source-of-truth, and much of the UI shell (including the existing transfer/action-handler pattern and the Paycheck Planner UI scaffold at `packages/desktop-client/src/paycheck-planner/`) are compatible or close, and should be preserved and re-plumbed once the new engine exists rather than rebuilt from scratch. This rewrite is accepted as necessary and will be scoped as its own project phase — do not attempt to bolt "real balances" onto the existing spreadsheet engine, as that would create two disagreeing sources of truth.

### Cutover vs. Import — do not conflate these

Two different situations both involve populating envelopes with starting data, and they follow **opposite** policies. Keep them distinct:

- **Cutover** (this codebase's old formula engine → the new real-balance engine, on an existing budget file already using this app). Policy: **fresh start at zero, no inherited history.** Keep only what's structurally necessary for the new engine to function — category/group identity, names, sort order. Discard everything derived from the old engine's leftover/carryover/budgeted-amount formulas outright, even as metadata or a comment field. Old "leftover" values are a product of a model now considered incorrect; carrying them forward in any form risks reintroducing the exact class of bug this rewrite exists to eliminate. Every envelope starts at a real $0 balance with no inherited financial history.
- **Import** (bringing in a file from another budgeting tool — stock Actual Budget, a YNAB export, etc.). Policy: **preserve intent where possible.** An import should attempt to carry over goals (target balance/date) and envelope structure from the source data, since that reflects real setup the user already did elsewhere. Import must **not** default to the cutover's zero-balance fresh-start policy — that policy is specific to this app's own old-model-to-new-model migration, not to bringing in outside data.

Import itself is out of scope for the current engine rewrite (not being implemented now) — this note exists so the distinction isn't lost or conflated when that work is eventually scoped.

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

# Alternative: start directly from packages/desktop-client (skips root orchestration)
# MUST use --mode=browser — without it, Vite uses electron-renderer conditions and
# browser-preload.js never runs, causing window.Actual to be undefined at boot.
# cd packages/desktop-client && npx cross-env PORT=3001 vite --mode=browser

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

**Source of truth:** `budget-page-v9.html` — the frosted glass mockup the user provided on 2026-05-13. All **visual** decisions (color, typography, spacing, glass treatment) derive from that file, and this also applies to the Claude Design mockup of the same UI. Note: the mockup's **functional behavior** (how the paycheck planner and budget table actually work) reflects the old pre-envelope model — see the "⭐ CURRENT DIRECTION" section above for the real functional spec. Reuse the look, not the interaction logic.

This design is an iOS 26-style frosted glass / glass morphism aesthetic. Apply it to ALL pages and components across the app. Check `packages/component-library/src/styles.ts` for the `glassCard` helper before writing custom glass styles.

### Page Background

Layered radial gradient applied to the `<body>` / page root:

```
radial-gradient(ellipse at 12% 88%, rgba(140,165,200,0.65) 0%, transparent 38%),
radial-gradient(ellipse at 88% 6%,  rgba(185,170,225,0.60) 0%, transparent 36%),
radial-gradient(ellipse at 50% 50%, rgba(210,205,215,0.30) 0%, transparent 60%),
linear-gradient(155deg, #eae6e3 0%, #ddd8d5 100%)
```

### Glass Card — `styles.glassCard`

Every surface (cards, panels, sidebar, dialogs) uses this treatment:

```
background:        rgba(255,255,255,0.25)
backdrop-filter:   blur(32px)
border:            1px solid rgba(255,255,255,0.50)
box-shadow:        0 8px 28px rgba(0,0,0,0.08),
                   0 2px 6px rgba(0,0,0,0.04),
                   inset 0 1px 0 rgba(255,255,255,0.65)
border-radius:     18px
```

Row-level glass (category rows, list items):

```
background:    rgba(255,255,255,0.22)
backdrop-filter: blur(8px)
border:        1px solid rgba(255,255,255,0.40)
```

### Typography

- **Font:** Inter — weights 400/500/600/700/800
- **Page text:** `#1c1c1e` (primary), `#6e6e73` (muted/secondary)
- **Budget name in sidebar:** 23px, weight 800, letter-spacing -0.04em
- **Month heading in top card:** 26px, weight 800, letter-spacing -0.04em
- **Section headers:** 11px, weight 700, uppercase, letter-spacing 0.05em

### Data Indicator Colors (pills, numbers)

```
Positive / funded:       bg rgba(52,199,89,0.18)   text #1a7a35   (green)
Partial / warning:       bg rgba(255,204,0,0.22)   text #7a5800   (yellow)
Zero / neutral:          bg rgba(120,120,130,0.12) text #5a5a65   (gray)
Negative / overbudget:   bg rgba(180,35,24,0.14)   text #b42318   (red)
Debt snowball:           bg (snowball-bg)          text #6941c6   (purple)
```

### Sidebar

The sidebar uses the **same** glass material as the content area — it is NOT dark. It is a light frosted panel.

```
background:  rgba(255,255,255,0.25)  +  backdrop-filter: blur(32px)
border-right: 1px solid rgba(255,255,255,0.22)
text:        #1c1c1e  (same as page text — light background)
muted text:  #6e6e73

Active nav item:
  background: rgba(255,255,255,0.30)
  box-shadow: 0 1px 4px rgba(0,0,0,0.06)
  font-weight: 600

Hover nav item:
  background: rgba(255,255,255,0.20)

Nav icon chips:
  width/height: 18px, border-radius: 5px
  border: 1px solid rgba(0,0,0,0.08)
  background: rgba(255,255,255,0.35)
```

### Spacing & Radius

```
Card radius:  18px (outer cards), 11px (row-level elements)
Row gap:      10–12px between card sections
Nav padding:  7px 10px per item, border-radius 9px
```

### Buttons

- Primary: teal background `#0d7e82`, white text, border-radius 8px
- Secondary: `rgba(255,255,255,0.30)` glass background, `#1c1c1e` text, glass border
- Bare/icon: transparent, `#6e6e73` color

---

## 6. Layout Structure

```
body (flex, horizontal, page background gradient)
├── #sidebar (240px resizable, LIGHT frosted glass, full height)
│   ├── Budget name (23px, 800 weight)
│   ├── Nav items (glass active state, icon chips)
│   └── Account list (group labels + rows with balances)
└── #main-content (flex-1, transparent)
    └── #page-content (scrollable, 16px padding)
        — Budget page: top glass card (month nav + TBB) + table glass card + right summary panel
        — Other pages: glass card(s) as appropriate
```

**Mobile (≤768px):** Sidebar becomes an off-screen drawer.

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

## 8. Flagship Feature: Paycheck Planner — ⚠️ HISTORICAL, SUPERSEDED

**This section describes the old model and is kept for reference only.** The real, current spec for the Planner lives in the "⭐ CURRENT DIRECTION" section near the top of this file (plan vs. commit, live drift indicators, envelopes hold real balances). Do not build against this section — it predates the envelope-real-balance philosophy and conflicts with it (e.g. it implies allocations write directly into budget categories with no plan/commit separation, and "Left to Budget" implies a decoupled YNAB-style total rather than a real ledger ceiling).

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

## 9. Data Models — ⚠️ HISTORICAL, SUPERSEDED

**These types describe the old model and are kept for reference only.** They predate the envelope-real-balance philosophy: `Category.budget` is a monthly target with no stored balance field, and `Paycheck.allocations` writes straight to categories with no plan/draft/commit separation. The real data model needs to be designed as part of the engine rewrite described in the "⭐ CURRENT DIRECTION" section — at minimum it will need a real stored balance per envelope, a draft-vs-committed distinction for planned income, and an audit/history record independent of current balance. Don't implement against the types below.

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

1. ~~**Named app / branding**~~ — Done. App is named **myEnvelopes** (domain: myenvelopes.app).
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

---

## 14. Subagent Roles

Four role-scoped subagents live in `.claude/agents/` for use within Claude Code
sessions. Invoke by name rather than doing cross-domain work in a single
generic session — each has explicit scope boundaries to prevent, e.g., a UI
task quietly touching the budget engine's data model.

| Agent | Domain | Use for |
|---|---|---|
| `engine-architect` | `packages/loot-core/` — data model, budget/envelope calculation engine, migrations | Designing or implementing the real-balance envelope engine rewrite, category/account schema, plan-vs-commit data model |
| `feature-builder` | `packages/desktop-client/`, `packages/component-library/` | Building/wiring UI features, the Paycheck Planner UI, applying the frosted-glass design system |
| `ux-designer` | Flow/interaction design only — no code, no styling | Deciding how a feature should behave before it's built; reviewing whether a flow matches the envelope philosophy; flagging where the Claude Design mockup's interactions conflict with the current direction |
| `qa-reviewer` | Verification — typecheck, lint, tests, CLAUDE.md checklist | Run after any non-trivial change from engine-architect or feature-builder, before considering it done |

Typical flow for a new feature: `ux-designer` defines the flow → `engine-architect`
builds any needed data-model support → `feature-builder` wires the UI →
`qa-reviewer` verifies before commit.
