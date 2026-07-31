// Ambient declarations for the global test helpers registered by
// src/mocks/setup.ts (Vitest global setup). Declared here (rather than
// suppressed per-test-file) so test files can use them under strict
// type-checking without an ignore comment.

declare global {
  var emptyDatabase: (avoidUpdate?: boolean) => () => Promise<void>;
  // Typed as `undefined` (not `void`) on purpose: some existing tests
  // (e.g. sync.test.ts) rely on `global.stepForwardInTime() || {...}` as
  // an always-falsy idiom, and TS disallows testing an expression of
  // type `void` for truthiness.
  var stepForwardInTime: (time?: number) => undefined;
}

export {};
