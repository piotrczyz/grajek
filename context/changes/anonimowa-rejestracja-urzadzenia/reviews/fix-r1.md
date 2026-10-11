# Fix round 1: anonimowa-rejestracja-urzadzenia, increment 1

Report: `reviews/impl-review-inc-1.md` (round 1). FIX findings: F1. All others ACCEPT, untouched.

## F1 — raw push error (with device endpoint) logged

- `functions/src/devices/push-sender.ts`: new `toLoggableError(error)` returns only
  `{ name, message, statusCode?, endpointHost? }`; every URL in the message is reduced to
  its origin; the full `endpoint`, `headers` and `body` are never copied.
- `functions/src/index.ts:47`: `onError` logs `toLoggableError(error)` instead of the raw error.
- `functions/test/push-sender.test.ts`: 3 tests (`describe('toLoggableError')`), including
  "the logged value contains no endpoint path".

Phase touched: 1 (criteria 1.1-1.4 re-run below).

## Red with the fix reverted

Function body replaced by `return error as LoggableError;` (the pre-fix behaviour: raw error passed to the logger), then restored.

```
$ pnpm --dir functions exec vitest run test/push-sender.test.ts
     × keeps only name, message, status and endpoint host of a push error
     × strips URL paths from the message of any error
     × handles values that are not errors
      Tests  3 failed | 6 passed (9)
```

Green with the fix:

```
$ pnpm --dir functions exec vitest run test/push-sender.test.ts
      Tests  9 passed (9)
```

## Full suite vs baseline

Baseline (before the fix, same worktree): `pnpm --dir functions test` → `Tests 45 passed (45)`, 3 files.

```
$ pnpm --dir functions test
 Test Files  3 passed (3)
      Tests  48 passed (48)
```

New failures: none (45 → 48, +3 new tests). Root suite untouched by this fix (no root files changed).

## Build, typecheck, lint

| Command | Exit |
|---|---|
| `pnpm --dir functions build` (1.1) | 0 |
| `pnpm --dir functions typecheck` (1.2) | 0 |
| `pnpm --dir functions test` (1.3) | 0 (48/48) |
| `pnpm lint` (1.4, lints `functions/src`) | 0 |
| `pnpm typecheck` (root, `tsc -b`) | 0 |
