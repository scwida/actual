# Design System Reference

## Rule #1

All visual styling must use values from `src/theme/tokens.ts` only.
Do NOT pull from any existing markdown theme files, legacy CSS variables,
or Actual Budget's default theme system.

## Layout

- Three-column grid: 238px sidebar | flex center | 304px right panel
- All three columns start at the same vertical position (62px from top)
- Top 62px is reserved for window controls only — no content

## Cards

- Every panel, table, and summary box uses the glass card style from tokens.glass
- Border radius: 18px on all cards — no exceptions
- No flat white or solid-color backgrounds on any card surface

## Sidebar

- Budget name is FIRST element, top of sidebar, below 62px clearance
- Nav items below budget name
- Account groups below nav items
- Glass background — NOT solid

## Top Header Card

- Month navigator: LEFT justified
- To be budgeted + amount: RIGHT justified
- Nothing else in this card (no expected income, no targets)

## Available Column

- Always rendered as a pill badge — never plain text
- Color is determined by value: positive=green, partial=yellow, zero=gray
- See tokens.colors.pill for exact values

## Typography

- Font: Inter only
- All sizes and weights from tokens.typography
- Primary text: #1c1c1e — Muted text: #6e6e73

## What to IGNORE

- Any existing Actual Budget theme files (themes/light.json, themes/dark.json, etc.)
- Any CSS variables prefixed with --color-budget or --color-sidebar from the original codebase
- Any design decisions not reflected in tokens.ts
