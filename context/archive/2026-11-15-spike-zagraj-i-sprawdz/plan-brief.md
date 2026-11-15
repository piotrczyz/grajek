# Spike "Zagraj i sprawdź" — Plan Brief
Full plan: `context/changes/spike-zagraj-i-sprawdz/plan.md` · request text: `change.md`

Skipped: rs-research (Jev p=0.18; the entry point, conventions and test setup were read directly) and rs-frame (Jev p=0.16; the request is an explicit spike specification, not a stated cause).

## What & why
A throwaway prototype to find out, on a real iPhone with a real B♭ clarinet, whether
detecting single notes and rhythm to a metronome is reliable enough to build a full
"play and check" feature for children. The product owner tests it on the PR preview.

## Starting point
React 19 SPA mounted in `src/main.tsx:29` with no router; feature folders with barrels,
`copy.ts` and co-located Vitest tests; Workbox precaches all built JS
(`vite.config.ts:47`); no audio or notation libraries; no headers blocking the microphone.

## Desired end state
`?spike=nuty` opens a hidden, lazily loaded Polish screen: pick a melody, instrument,
tempo and toggles, one-bar count-in, record, then see the reference and played notes on
two staves coloured green/yellow/red, a % score, and a diagnostics panel (Hz, note,
cents, level, raw events with octave/twelfth flags). The rest of the app is unchanged.

## Complexity
MEDIUM — new Web Audio and notation code plus non-trivial signal logic (segmentation,
alignment), but isolated in one new folder with a one-line entry branch, no data, no
server and no contract changes.

## Key decisions made
| Decision | Choice | Why | Source |
|---|---|---|---|
| Discovery scale | Not an initiative; no roadmap phase | Jev said discovery_scale yes (p=0.91, confirm), but the request is an explicitly throwaway spike, a hidden screen inside the existing app in its own folder | Auto |
| Areas | A1 pure music logic; A2 spike screen with recording (audio and screen merged) | Jev multi_area yes (p=0.81); pure logic independent (Jev p=0.86); audio cannot be checked by the owner without the screen | Orchestrator — Jev (p=0.81) / Auto |
| Increments | 1 = A1 (phases 1-2), 2 = A2 (phases 3-5) stacked on 1 | One increment per area, linear chain; A2 consumes A1's barrel | Orchestrator |
| Research / framing | Both skipped | Jev needs_research p=0.18, needs_framing p=0.16 | Jev (p=0.18 / p=0.16) |
| Request mode | No issue; path full | Orchestrator input | Orchestrator |
| Hidden route | Branch in `src/main.tsx` on a pure `isSpikeRoute(search)`, `React.lazy` import of the screen; `App.tsx` untouched | No router exists (`src/main.tsx:29`); keeps the spike out of the main chunk | Auto |
| Pitch detector | `pitchy` (McLeod) on an `AnalyserNode`, 2048 samples, ~20 ms polling | Request suggests it; MIT, small, clarity value doubles as voicing gate; D3 (lowest sounding) fits the window | Issue + Auto |
| Staff renderer | VexFlow 5 via `vexflow/bravura` entry | Per-note `setStyle` colouring and bundled types; abcjs would colour through generated CSS classes | Auto |
| Dependencies | Add `pitchy`, `vexflow` as runtime deps, imported only from `src/spike-nuty/` | Owner authorised in the request; lazy chunk only | Issue |
| Precache | Leave Workbox config unchanged; a >2 MiB spike chunk warning is acceptable | "Rest of the app unchanged"; spike then needs network on first open | Auto |
| Clock | `AudioContext.currentTime` for metronome and frames; times relative to the first downbeat | One timeline for grid and onsets | Auto |
| Mic constraints | echoCancellation, noiseSuppression, autoGainControl off | Voice processing distorts sustained tones and level | Auto |
| Click suppression | Noise-burst click + 80 ms ignore window per click + "Tylko wizualny metronom" toggle (default off) | Request lists all three; keeping both layers lets the spike compare them | Issue + Auto |
| Pitch reference | Written pitch everywhere; clarinet +2, C instrument 0; default clarinet | Request | Issue |
| Note names in diagnostics | Scientific names with sharps, letter B (not Polish H) | Panel is for the team, not the child | Auto |
| Melodies | Wlazł kotek (C4-G4), Panie Janie in C (C4-G4), E-F-G exercise (E3-A3); 4/4, quarters and halves | Request's examples; all below the break (A#4) | Issue + Auto |
| Grid | Eighth notes; onset = nearest eighth, duration rounded, min 1 | Request: "min. ósemki" | Issue |
| Alignment | DP edit distance on pitch with onset tie-breaker | Survives extra/missing notes better than a time window | Auto |
| Rhythm correct | Onset exact on the eighth grid, duration ±1 eighth (configurable) | Quantization already absorbs ±½ eighth; wind articulation shortens notes | Auto |
| Score | (green + 0.5·yellow) / reference notes; extra notes not counted; pitch-only % in diagnostics | Simple, explainable; yellow is half right | Auto |
| Ignore octave | Toggle, default off | Request | Issue |
| Meter / count-in | 4/4 only, one bar of 4 clicks, accent on beat 1, auto-stop one bar after the melody | Request; all melodies are 4/4 | Issue + Auto |
| Tests | Unit for logic, route, mic error mapping, staff model; screen tests with audio and staff mocked; no new E2E | Request; jsdom has no Web Audio | Issue + Auto |

## Scope
In: everything in `src/spike-nuty/`, a branch in `src/main.tsx`, two dependencies, README.
Out: any link to the spike, persistence, network, other instruments, polyphony, new E2E.

## Increments at a glance
| # | Delivers | Depends on | User-visible | Key risk |
|---|---|---|---|---|
| 1 | Pure music logic with unit tests | — | no | Segmentation thresholds tuned on synthetic data only |
| 2 | Hidden screen with metronome, mic, staff, score, diagnostics | 1 | yes | iOS audio behaviour (gesture unlock, speaker click bleed) only checkable on device |

## Phases at a glance
| Phase | Increment | Delivers | Key risk |
|---|---|---|---|
| 1 | 1 | Pitch maths, transposition, melodies | — |
| 2 | 1 | Segmentation, quantization, comparison | Re-attack of repeated notes |
| 3 | 2 | Deps, hidden lazy route, screen shell, README | Spike code leaking into the main chunk (checked on build output) |
| 4 | 2 | Metronome, mic, live pitch, diagnostics | Click detection as notes |
| 5 | 2 | VexFlow staves, grading, score | VexFlow layout on phone width |

Prerequisites: none; the PR preview channel already exists in CI.

## Open risks & assumptions
- Segmentation defaults (clarity 0.9, −50 dB, 80 ms minimum, 6 dB re-attack) are first
  guesses; the diagnostics panel exists to tune them on the device.
- iPhone speaker-to-mic bleed of the clicks may survive the ignore window; the
  visual-only toggle is the fallback the test should compare.
- Manual criteria 3.4, 4.3, 4.4, 5.5, 5.6 need the owner's iPhone test on the preview.

## Success criteria (summary)
Logic unit tests pass on synthetic data; lint, typecheck, build and the existing E2E
pass; the main entry chunk carries no spike or VexFlow code; on an iPhone a correct
"Panie Janie" at 60 BPM scores mostly green.
