<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Telemetry and accuracy feedback for "Zagraj i sprawdź" (client feedback 1)

**Plan**: context/changes/telemetria-zagraj-i-sprawdz/plan.md   **Scope**: increment 2 (phases 4-6), feedback cycle 1 (`reviews/feedback-inc-2-1.md`)   **Date**: 2026-11-15
**Round**: 2   **Verdict**: APPROVED   **Findings**: 5

Base: `feat/telemetria-zagraj-i-sprawdz/1` (stacked; merged into this branch at ff3c67d). Diff `git diff feat/telemetria-zagraj-i-sprawdz/1...HEAD`: 26 files, +1425/-22, the same code as the approved round 1 of this increment; nothing has been changed yet for the owner's redirect (the only commit after the merge is `7205db3`, the feedback file). The owner explicitly authorised the redirect, so every point for the app is in scope and every gap below is `FIX`.

## Verdicts
| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Plan Adherence is judged against the owner's redirect (feedback points 1-3), which supersedes plan phases 5-6 on the manual-feedback path. Architecture: no `context/architecture/model.c4`; gate not applicable.

## Success criteria (current branch state)
| Check | Command | Result |
|---|---|---|
| Unit tests | `pnpm exec vitest run --reporter=json` | PASS — 593/593 |
| Typecheck | `pnpm typecheck` | PASS (exit 0) |
| Lint | `pnpm lint` | PASS (exit 0) |
| Build | `pnpm build` | PASS (exit 0) |
| E2E | `pnpm test:e2e` | PASS — 17 passed; no spec covers `?spike=nuty` |

Green checks only prove the old behaviour still builds; none of the feedback points is implemented.

## Findings
### F1 — Manual feedback UI and client feedback send/queue path still present, and now talk to a removed endpoint
- **Severity**: CRITICAL
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: src/spike-nuty/SpikeScreen.tsx:62-70, 107-121, 140, 165-175, 202-203, 265, 327-330, 383-414, 460-515; src/spike-nuty/copy.ts:127-140; src/spike-nuty/telemetry/api.ts:23-25; src/spike-nuty/telemetry/queue.ts:8-11, 24, 30, 93; src/spike-nuty/README.md:78; tests in SpikeScreen.test.tsx, queue.test.ts, copy.test.ts
- **Detail**: Owner: "Nie trzeba się pytać i poprawiać. To ma dziać się automatycznie." Point 1 asks to remove "Czy ocena się zgadza? Tak/Nie", marking misjudged notes and the comment. All of it is still rendered (`showFeedback`, `sendFeedback`, `misjudging` column). Increment 1 removed the backend feedback route, so today a Tak/Nie answer is queued as `kind: 'feedback'`, answered 404 and dropped after 5 tries: a visible control that does nothing.
- **Fix**: Delete the feedback UI (heading, Tak/Nie, misjudged checkbox column and its `Misjudging` prop, comment field, `FeedbackStep` state, `sent` bookkeeping only used by feedback), `putFeedback`, the `'feedback'` queue kind and its 404 retry rule, and the feedback copy; keep automatic attempt sending, the anonymous-data notice and the opt-out switch. The queue loader must silently discard legacy `kind: 'feedback'` items already stored in localStorage without resetting the attempts queued beside them. Tests: SpikeScreen shows no "Czy ocena się zgadza?" / Tak / Nie / checkbox after a finished attempt while the notice and switch remain; queue drops a stored legacy feedback item and still sends the attempts. Update `src/spike-nuty/README.md` (line 78 section) to describe the automatic estimate instead.
- **Decision**: FIXED (288e2d9) — verified r2. Owner-authorised redirect, point 1.

### F2 — Raw signals and the recognition estimate are not filled in the record
- **Severity**: CRITICAL
- **Impact**: MEDIUM
- **Dimension**: Plan Adherence
- **Location**: src/spike-nuty/logic/segment.ts:39-60 (`NoteEvent`), src/spike-nuty/telemetry/record.ts:9, 148, 204 (no `pitchSpreadCents`, `windowLevelDb`, `signal`, `estimate`); contract: functions/src/spike-nuty/recognition-estimate.ts:24, 68-135, 188, functions/src/spike-nuty/validation.ts:159-201, 250-316, README.md "Record contract" (lines 200-240)
- **Detail**: Point 2 asks for the estimate computed on the client and stored in the record with the heuristic version. No `src/` file references the new optional fields or the shared module; `grep pitchSpread|windowLevel|voicedFrames|estimate src/` is empty.
- **Fix**: (a) detector/segmenter: per event `pitchSpreadCents` (spread of the frame pitches within the event, cents, 0..2400, as defined in the README contract); per note `windowLevelDb` (mean input dBFS over the note's window, null when no frames); per attempt `signal` = `{frames, voicedFrames, medianClarity}` over all analysed frames. (b) `record.ts`: import `estimateRecognition` and `HEURISTIC_VERSION` by relative path `../../../functions/src/spike-nuty/recognition-estimate.ts` (must pass the client `tsc -b`, eslint and Vite build; the module has zero imports), compute the estimate on the full recording **before** capping events at `MAX_EVENTS` (inc-1 feedback review F7; note-to-event link `events[playedIndex + events.length - notesWithPlayedIndex]`), and store `estimate` with `heuristicVersion`. (c) Tests: record.test asserts the new fields and an `estimate` with `heuristicVersion === HEURISTIC_VERSION`, that the server's real `parseAttempt` accepts the record, and that a recording over 200 events gets its estimate from the full event list; segment tests cover `pitchSpreadCents`.
- **Decision**: FIXED (288e2d9) — verified r2. Owner-authorised redirect, point 2.

### F3 — Diagnostics panel shows no heuristic; child view must stay free of it
- **Severity**: WARNING
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: src/spike-nuty/SpikeScreen.tsx (diagnostics section), src/spike-nuty/copy.ts
- **Detail**: Owner: "Dziecko NIE widzi tych heurystyk (to dla nas). Panel diagnostyczny może je pokazywać." The orchestrator's brief puts showing them in diagnostics in scope.
- **Fix**: In the existing diagnostics panel only, show in Polish the estimated recognition accuracy, the per-note verdict (błąd grającego / błąd rozpoznawania / niepewne / ok) with its reasons, and the attempt signals (odsetek ramek bez wysokości, mediana pewności, rozrzut opóźnienia, zdarzenia na nutę, przerwana). Test: the strings appear only with diagnostics open and never in the default result view.
- **Decision**: FIXED (288e2d9) — verified r2. Owner-authorised redirect, point 2.

### F4 — "Nuta po nucie" table truncates text at 360 px
- **Severity**: WARNING
- **Impact**: MEDIUM
- **Dimension**: Safety & Quality
- **Location**: src/spike-nuty/SpikeScreen.tsx:136-180 (`table-fixed text-xs`, fixed `w-6` / `w-[30%]` columns, plus the checkbox column); src/spike-nuty/copy.ts:59-68 (`NOTE_COLUMNS`, `STATUS`)
- **Detail**: Owner reports "dobrz" instead of "dobrze" at 360 px. Six fixed-layout columns plus the misjudged column (removed by F1) leave the status column too narrow; no e2e spec covers `?spike=nuty`.
- **Fix**: Make every cell readable at 360 px: wrapping (`break-words`, no fixed layout that clips) and shorter headers, status shown as icon + colour with the full word, or a card per note. Verify with a Playwright spec at a 360x800 viewport (Chromium fake media stream, `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`) asserting no table cell has `scrollWidth > clientWidth` and the full status word is visible; if a result cannot be produced in e2e, a unit test on the table markup plus a manual-pending criterion.
- **Decision**: FIXED (288e2d9, 03c4608) — verified r2. Owner-authorised redirect, point 3.

### F5 — Plan text still describes the manual feedback path
- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: context/changes/telemetria-zagraj-i-sprawdz/plan.md Phases 5-6, Progress 5.1, 6.5
- **Detail**: Criteria 5.1 ("feedback 404 dropped after 5 tries") and manual 6.5 ("a Nie with marked notes updates it") are superseded by the owner's redirect; the plan is `implementing` and only rs-plan's refine mode may edit it.
- **Fix**: none in code; read 6.5 as "a finished attempt appears in `spikeNutyAttempts` with an `estimate`".
- **Decision**: ACCEPT — the feedback file is the authoritative record of the redirect; recorded as an `adaptation` guard.

## Round 2

Re-review of fix commits `288e2d9`, `03c4608` (LF restore, worst-case 360 px check) and `e00e06f` (fix evidence), against `reviews/fix-r3.md`.

- F1: feedback section, Tak/Nie, misjudged column, comment, `putFeedback`, the `'feedback'` queue kind and its 404 rule are gone (`grep -i "feedback|Czy ocena|misjudg" src/spike-nuty` finds only comments and the legacy-item filter). `readQueue` keeps attempts and rewrites the queue without legacy feedback items; `queue.test.ts` covers it. Notice and opt-out switch stay.
- F2: `segment.ts` sets `pitchSpreadCents` (std. deviation, cents) and adds `frameSignal` / `windowLevelDb` / `analysedFrames`; `record.ts` `attemptDetails` computes `estimateRecognition` on the full note and event lists, then `buildAttemptRecord` caps lists and cuts `estimate.notes/events` to the same lengths. `record.test.ts` asserts `heuristicVersion === HEURISTIC_VERSION`, the server's real `parseAttempt` round-trip, and the 250-event estimate from the full list.
- F3: `RecognitionEstimatePanel` renders only inside the diagnostics panel, after a result and after its toggle (`aria-expanded`); SpikeScreen tests assert the texts are absent from the default view.
- F4: `NotesTable` is `table-auto`, wrapping cells, short headers, colour dot + full status word; new `e2e/spike-nuty-narrow.spec.ts` (360x800, fake media stream) measures real and worst-case rows (soft guard `out-of-plan-files`, requested by F4).
- Regression sweep: F5 (ACCEPT) untouched, `plan.md` not edited; fix commits stay inside `src/spike-nuty/` plus the one e2e spec. All files of the fix are LF (`git ls-files --eol`).

| Check | Command | Result |
|---|---|---|
| Unit tests (phases 4-6) | `pnpm exec vitest run src/spike-nuty` | PASS — 139/139 (16 files) |
| Typecheck | `pnpm typecheck` | PASS (exit 0) |
| Lint | `pnpm lint` | PASS (exit 0) |
| Build | `pnpm build` | PASS (exit 0) |
| E2E 360 px | `pnpm exec playwright test e2e/spike-nuty-narrow.spec.ts` | PASS — 1 passed |

Full suite not re-run: `fix-r3.md` records 609/609 vs the 593 baseline (0 new failures) and 18/18 e2e. No emulator needed: `functions/` unchanged by the fix. Manual 6.5 (read per F5) and 6.6 remain for the preview.
