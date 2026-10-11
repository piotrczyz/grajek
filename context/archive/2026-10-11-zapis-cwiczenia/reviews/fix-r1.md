# Fix round 1: zapis-cwiczenia, increment 1

Report: `reviews/impl-review-inc-1.md` (Round 1). Findings with `Decision: FIX`: F0. All others (F1-F7) are ACCEPT/DISMISS and untouched.

## F0: save after midnight in a session left open
- Fix: `src/profile/ProfileScreen.tsx` `onSaved` now calls `setNow(new Date())`, so the week and "today" are recomputed at save time.
- Test: `src/App.test.tsx` › current-week view on the home screen › "highlights the new today when a save happens after midnight in a session left open". Fakes only `Date` (`vi.useFakeTimers({ toFake: ['Date'] })`), mounts on Sunday 2026-10-11 23:59, moves the clock to Monday 2026-10-12 00:01 without a `visibilitychange`, saves, and asserts the "(dziś)" item is the single Dzień z muzyką.

## Red-first proof (fix reverted)
`pnpm exec vitest run src/App.test.tsx`
```
 ❯ src/App.test.tsx:259:43
    259|       await waitFor(() => expect(today()).toHaveAccessibleName(/: Dzie…
 Test Files  1 failed (1)
      Tests  1 failed | 14 passed (15)
```

## Green (fix applied)
`pnpm exec vitest run src/App.test.tsx`
```
 Test Files  1 passed (1)
      Tests  15 passed (15)
```

## Full suite vs baseline
Baseline (review round 1): 72/72 tests in 9 files, 0 failed.
`pnpm test`
```
 Test Files  9 passed (9)
      Tests  73 passed (73)
```
New failures: none (+1 new test).

## Automated criteria of Phase 4 (the phase the fix touches)
| Criterion | Command | Result |
|---|---|---|
| 4.1 | `pnpm test` | PASS, 73/73 |
| 4.2 | `pnpm test:e2e` | PASS, `5 passed (6.5s)` |
| 4.3 | `pnpm build` | exit 0 (`dist/sw.js` generated) |
| 4.4 | `pnpm typecheck` (`tsc -b`) | exit 0 |
| 4.5 | `pnpm lint` (`eslint .`) | exit 0 |
