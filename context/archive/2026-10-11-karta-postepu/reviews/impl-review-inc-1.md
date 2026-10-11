<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Progress Card (Karta postępu)

**Plan**: context/changes/karta-postepu/plan.md   **Scope**: increment 1 (phases 1-3, full plan)   **Date**: 2026-10-11
**Round**: 1   **Verdict**: APPROVED   **Findings**: 2

Diff reviewed: `e4e6ed3..HEAD` (prerequisite slices F-01, S-01, S-07, S-02 are stacked unmerged below the base, so `origin/main...HEAD` would fold them in).

## Verdicts
| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## File classification
- In plan AND diff (all 13 code files): `src/progress-card/{copy,cardModel,renderCard,shareCard,index}.ts`, `ShareCardButton.tsx`, the four test files, `src/profile/ProfileScreen.tsx` (one import, one element after `WeekView`, `ProfileScreen.tsx:7`, `:107`), `e2e/progress-card.spec.ts`.
- In diff NOT plan: none (only `context/changes/karta-postepu/*`).
- In plan NOT diff: none.

## Plan adherence (inline pass; code diff is 13 files / ~700 lines, about half tests, read in full in this context, so no evidence subagents were spawned)
- Copy: every contract constant present (`copy.ts:4-11`), plural rule `copy.ts:14-16`; `SHARE_FAILED_MESSAGE` reuses `RETRY_MESSAGE`. MATCH.
- Card model: input type has no name field (`cardModel.ts:9-15`); counts only music days inside `days` (`cardModel.ts:36-40`). MATCH.
- Renderer: 1080 square, `#1e3a8a` background, amber music days, neutral empty days, system font + emoji font stack, nothing fetched (`renderCard.ts:4-14`, `:33-82`); `renderCardPng` rejects on null context and null blob (`renderCard.ts:94-101`). MATCH.
- Share service: feature detection order `share` + `canShare({files})`, `AbortError` silent, any other error downloads (`shareCard.ts:41-52`); download via object URL, hidden `<a download>`, revoke after a tick (`shareCard.ts:16-26`). MATCH.
- Button: hidden at 0 music days, render is the only await before `share`, disabled + `aria-busy` while busy, download/retry messages (`ShareCardButton.tsx:31-61`). MATCH.

## Requester constraints
- No IndexedDB migration / version bump: `git diff e4e6ed3 -- src/storage` empty. PASS.
- No `src/App.tsx` edit: diff empty. PASS.
- No new dependency: `package.json` and `pnpm-lock.yaml` diff empty; rendering is plain Canvas 2D. PASS.
- No name / pseudonym on the card: `CardInput` has no name; `cardModel.test.ts` passes an extra `name: 'Ola'` and asserts it does not leak; `drawCard` only writes model fields. PASS.
- No competitive numbers: the only number is the count of music days this week (the PRD's own example); no minutes, totals, streaks or comparisons (`cardModel.ts:22-31`, `renderCard.ts:43-81`). PASS.

## Success criteria
| # | Command | Result |
|---|---|---|
| 1.1, 1.2, 2.1, 2.2, 3.1 | `vitest run --reporter=json` (full suite) | PASS: 145/145 tests, 45 suites, 0 failed; cardModel 16, renderCard 5, shareCard 7, ShareCardButton 6 |
| 1.3, 2.3, 3.3 | `pnpm typecheck` | PASS (exit 0) |
| 1.3, 2.3, 3.3 | `pnpm lint` | PASS (exit 0) |
| 3.3 | `pnpm build` | PASS (exit 0, PWA precache 12 entries) |
| 3.2 | `CI=1 pnpm test:e2e e2e/progress-card.spec.ts` | PASS: 2/2 on mobile-chromium (shared File is image/png, `karta-postepu.png`, decoded 1080x1080, offline; download fallback named `karta-postepu.png` shows "Obrazek zapisany.") |
| 3.4 | `git diff e4e6ed3 -- src/App.tsx src/storage package.json pnpm-lock.yaml` | PASS (empty) |
| 3.5, 3.6 | Manual | Pending (`[ ]`): real share sheets on Android/iPhone and legibility for a child; for the human on the preview |

Architecture boundary gate: not run, `context/architecture/model.c4` does not exist.

## Findings
### F1 — Share call depends on the tap's user activation surviving the PNG encode
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/progress-card/ShareCardButton.tsx:37-38
- **Detail**: `await render(...)` (canvas `toBlob`) runs between the tap and `navigator.share`. Chromium keeps transient activation for ~5 s, so it is fine there (proven by e2e); iOS Safari is stricter. If activation has expired, `share` rejects with `NotAllowedError` and the code falls back to a download, so the child still gets the image. The plan keeps `toBlob` as the only await, exactly as designed.
- **Fix**: none in code; confirm on a real iPhone (Manual 3.5).
- **Decision**: ACCEPT — recorded risk in plan-brief "Open risks & assumptions" (iOS Safari user activation) and plan "Critical Implementation Details".

### F2 — Renderer's "never writes a profile name" test is tautological
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Success Criteria
- **Location**: src/progress-card/renderCard.test.ts:64-68
- **Detail**: The model fed to `drawCard` was built without any name, so the assertion cannot fail. The real guarantee is structural (`CardInput` has no name, `drawCard` only writes model fields) and is tested meaningfully in `cardModel.test.ts` (extra `name` passed and asserted absent).
- **Fix**: none needed.
- **Decision**: ACCEPT — the privacy property is enforced by construction and covered by the model test.
