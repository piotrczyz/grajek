# Spike "Zagraj i sprawdź" — Implementation Plan

## Overview
A throwaway spike that answers one question on a real iPhone with a real B♭ clarinet: is
monophonic pitch and rhythm recognition to a metronome good enough to build a full
"play and check" feature? It adds a hidden, lazily loaded screen at `?spike=nuty` that
plays a metronome with a one-bar count-in, records the microphone on the device, detects
the played notes, and shows the reference and the played notes on a staff coloured
green / yellow / red with a percentage score and a diagnostics panel. Increment 1 is the
pure music logic with unit tests; increment 2, stacked on it, is the screen with audio.

## Current State Analysis
- The app is a React 19 SPA mounted in `src/main.tsx:29-33` (`<App practiceStore=…/>`);
  there is no router and no query-string handling anywhere in `src/` (grep for
  `URLSearchParams`/`location.search` finds nothing besides `src/pwa/updates.ts:48`).
  A hidden screen therefore needs its own branch at the entry point.
- `src/App.tsx` (114 lines) owns the profile flow; nothing in it needs to change.
- Feature code lives in one folder per feature with an `index.ts` barrel and
  co-located `*.test.ts(x)` (e.g. `src/practice/`, `src/instruments/`); copy lives in
  `copy.ts` (`src/practice/copy.ts`). The spike follows the same shape in
  `src/spike-nuty/`.
- Vitest runs `src/**/*.test.{ts,tsx}` in jsdom with `src/test/setup.ts`
  (`vite.config.ts:86-91`); `tsconfig.app.json` is strict with `noUnusedLocals`,
  `verbatimModuleSyntax` and `allowImportingTsExtensions` (imports use `.ts` suffixes).
- Workbox precaches every built JS file (`vite.config.ts:47`, `globPatterns`). A lazy
  chunk is still precached; files over Workbox's 2 MiB default are skipped with a build
  warning, which only means the spike needs network on first open. The main entry chunk
  is unaffected either way.
- No `Permissions-Policy` or CSP header in `firebase.json:14-50` or `index.html`, so
  `getUserMedia` is allowed on the HTTPS preview channel (CI deploys a preview per PR,
  `.github/workflows/ci.yml`).
- No dependencies for audio or notation exist (`package.json`). `vexflow@5.0.0` ships an
  ESM `./bravura` entry with types; `pitchy@4.1.0` is MIT.

## Desired End State
- Opening `https://<preview>/?spike=nuty` shows the spike screen (Polish UI); opening the
  app without the parameter is byte-for-byte the same experience as today and the main
  entry chunk contains no spike or notation code.
- The child picks one of three melodies, the instrument (Klarnet B♭ default / Instrument
  w C), the tempo (60-100 BPM, default 60), "ignoruj oktawę" (default off) and
  "tylko wizualny metronom" (default off), taps Start, hears/sees a one-bar count-in,
  plays, and after the melody (plus one bar) the screen shows both staves coloured and
  the score in %.
- The diagnostics panel shows live Hz, note name, cents, level, and the raw list of
  detected events with start ms, length ms and octave/twelfth suspicion flags.
- A denied or unavailable microphone shows a clear Polish message instead of a crash.
- `src/spike-nuty/README.md` says what is being checked, how to test, and has a verdict
  placeholder.

### Key discoveries
- Entry point to branch on: `src/main.tsx:29` (`createRoot(root).render(...)`).
- Folder/barrel/copy conventions: `src/practice/index.ts`, `src/practice/copy.ts`.
- Test environment: `vite.config.ts:86-91`; jest-dom matchers via `src/test/setup.ts:1`.
- Precache of all JS: `vite.config.ts:47`.

## What we're NOT doing
- No link, menu entry or navigation to the spike anywhere in the app; no change to
  `src/App.tsx`, the profile/practice flows, storage, the service-worker config or
  `firebase.json`.
- No persistence of recordings, results or settings; no network calls; nothing leaves
  the device.
- No chords/polyphony, no instruments other than B♭ clarinet and C instruments, no
  melodies loaded from files, no editor, no time signatures other than 4/4.
- No E2E test for the spike (existing E2E must keep passing).
- No production hardening: the spike is meant to be deleted or rewritten after the verdict.

## Implementation Approach
Pure logic first (increment 1), framework-free and deterministic, so the hard parts —
note naming, transposition, segmentation, quantization, alignment and scoring — are
proved on synthetic frames before any microphone is involved. Increment 2 wires it to
Web Audio and renders it.

- **Single clock.** Metronome scheduling and pitch frames both use
  `AudioContext.currentTime`, so onsets, the count-in and the grid share one timeline;
  the logic takes milliseconds relative to the first downbeat after the count-in.
- **Pitch detection:** `pitchy` (McLeod Pitch Method) over an `AnalyserNode`
  (`fftSize` 2048) polled about every 20 ms. Chosen over a hand-written YIN: proven,
  tiny, MIT, gives a clarity value used as the voicing gate. The lowest written note E3
  sounds D3 (~147 Hz), well inside a 2048-sample window.
- **Microphone:** `getUserMedia({audio:{echoCancellation:false, noiseSuppression:false,
  autoGainControl:false}})` — voice processing distorts sustained tones and level.
- **Click suppression:** two layers, both kept for the spike evaluation: the click is a
  short (~15 ms) filtered noise burst (no stable pitch, so clarity stays low), and every
  scheduled click time opens an ignore window (default 80 ms) that the segmenter skips.
  "Tylko wizualny metronom" silences the clicks during recording (the count-in stays
  audible) for comparison.
- **Segmentation → quantization → alignment.** Frames become note events (onset on
  unvoiced→voiced, on a stable pitch change of ≥1 semitone, or on a level re-attack of
  the same pitch); events are quantized to an eighth-note grid; played events are
  aligned to the reference by dynamic programming (edit distance on pitch with a small
  onset-distance tie-breaker), which survives an extra or missing note better than a
  pure time-window match. Pitch comparison uses written pitch with octave; ignore-octave
  compares pitch class.
- **Staff:** VexFlow 5 (`vexflow/bravura` entry, one font) over abcjs: per-note
  colouring is a first-class `setStyle` call on each note, and the package ships its own
  TypeScript types; abcjs would need colouring through generated CSS classes.
- **Lazy loading:** `src/main.tsx` checks the query string with a pure helper and, for
  `?spike=nuty`, renders a `React.lazy` screen imported with `import()`; `pitchy` and
  `vexflow` are imported only inside `src/spike-nuty/`, so Rollup puts them in the lazy
  chunk.

## Increments
| # | Name | Phases | Depends on | User-visible | Status | PR |
|---|---|---|---|---|---|---|
| 1 | Spike music logic (pure, unit-tested) | 1-2 | — | no | done | — |
| 2 | Spike screen with recording at ?spike=nuty | 3-5 | 1 | yes | in-progress | — |

## Critical Implementation Details

### Pitch and naming conventions
- MIDI from Hz: `69 + 12·log2(f/440)`, A4 = 440 Hz; nearest integer is the note, the
  remainder ×100 the cents (−50..+50). Scientific pitch names with sharps (`C4`, `F#3`,
  `A#3`), international letters (B, not the Polish H) — diagnostics are for the team.
- Written = sounding + transposition; transposition is `+2` for "Klarnet B♭" and `0`
  for "Instrument w C". All reference melodies are stored in **written** pitch; the
  comparison and both staves work in written pitch.

### Reference melodies (written pitch, 4/4, q = quarter, h = half)
1. **Wlazł kotek na płotek** (C major, C4–G4):
   `G4q E4q E4q F4q | D4q D4q C4q E4q | G4q E4q E4q F4q | D4q D4q C4h`
2. **Panie Janie** (C major, C4–G4):
   `C4q D4q E4q C4q | C4q D4q E4q C4q | E4q F4q G4h | E4q F4q G4h`
3. **Ćwiczenie E-F-G (niski rejestr)** (chalumeau, E3–A3):
   `E3q F3q G3h | G3q F3q E3h | E3q F3q G3q A3q | G3q F3q E3h`
Invariants (tested): every bar sums to 4 quarters; every pitch is within E3–G4 written;
no pitch at or above A#4 (the register break).

### Timing
- Count-in: one bar of 4 clicks, accent (higher, louder) on beat 1; recording time 0 =
  the downbeat after the count-in. The recording auto-stops one bar after the melody
  ends; a Stop button ends it early.
- Grid: eighth note = `30000 / bpm` ms. Quantized onset = nearest eighth index;
  quantized duration = nearest eighths, minimum 1.

### Scoring
- Per reference note: **green** = aligned played note with matching pitch and correct
  rhythm; **yellow** = matching pitch, wrong rhythm; **red** = wrong pitch or missing.
  Unaligned played notes are **extra** (red on the played staff, not counted against the
  reference total).
- Rhythm correct (defaults, configurable in the comparison options): quantized onset
  equals the reference onset (0 eighths tolerance) and quantized duration is within
  ±1 eighth of the reference duration.
- Score % = round(100 · (green + 0.5·yellow) / referenceCount). The result also exposes
  pitch-only accuracy % (green + yellow) for the diagnostics panel.

### iOS Safari standalone
- `AudioContext` is created (or resumed) and `getUserMedia` is called inside the Start
  tap handler. `NotAllowedError` / `SecurityError` → permission message;
  missing `navigator.mediaDevices` or `NotFoundError` → "no microphone" message; both in
  Polish, with a retry button. Tracks are stopped and the context suspended on stop and
  on unmount.

## Phase 1: Notes, transposition and melodies
### Overview
The vocabulary every other part uses: pitch maths, note names, transposition and the
three hard-coded melodies, with unit tests.

### Required changes
#### 1. Pitch maths and naming
- **File**: `src/spike-nuty/logic/pitch.ts`, `src/spike-nuty/logic/pitch.test.ts`
- **Goal**: convert a frequency to MIDI note, cents and name; convert MIDI to name and
  to frequency; pitch class; transposition between sounding and written pitch.
- **Contract**: `hzToMidiFloat(hz)`, `hzToNote(hz) → {midi, name, cents}` (null for
  non-positive/non-finite input), `midiToName(midi)` (`'C4'`, `'F#3'`), `midiToHz(midi)`,
  `pitchClass(midi)`; `type Instrument = 'clarinet-bb' | 'c'`,
  `TRANSPOSITION: Record<Instrument, number>` (`{'clarinet-bb': 2, c: 0}`),
  `soundingToWritten(midi, instrument)`, `writtenToSounding(midi, instrument)`.

#### 2. Reference melodies
- **File**: `src/spike-nuty/logic/melodies.ts`, `src/spike-nuty/logic/melodies.test.ts`
- **Goal**: the three melodies above, in written pitch, with derived onsets in eighths.
- **Contract**: `interface RefNote {midi: number; startEighth: number;
  durationEighths: number}`, `interface Melody {id: string; title: string (Polish);
  beatsPerBar: 4; notes: RefNote[]}`, `MELODIES: Melody[]` (ids `wlazl-kotek`,
  `panie-janie`, `cwiczenie-efg`), `melodyLengthEighths(melody)`.

#### 3. Barrel
- **File**: `src/spike-nuty/logic/index.ts`
- **Goal**: one public surface for increment 2.
- **Contract**: re-exports of the modules of phases 1-2.

### Success criteria
#### Automated
- `pnpm test src/spike-nuty/logic` passes, covering: 440 Hz → A4 0 cents; 261.63 Hz →
  C4; 452 Hz → A4 about +46 cents; 147 Hz sounding → D3 → written E3 on clarinet;
  instrument `c` leaves pitch unchanged; invalid Hz → null
- Melody tests pass: every bar sums to 8 eighths, every pitch in E3–G4 written, none at
  or above A#4, three melodies with distinct ids
- `pnpm lint` and `pnpm typecheck` pass
#### Manual
- None

## Phase 2: Segmentation, quantization and comparison
### Overview
Turn a stream of pitch frames into note events, place them on the metronome grid and
grade them against a melody, with tests on synthetic frames.

### Required changes
#### 1. Segmentation
- **File**: `src/spike-nuty/logic/segment.ts`, `src/spike-nuty/logic/segment.test.ts`
- **Goal**: frames → note events, robust to brief dropouts, click windows and
  octave/twelfth glitches.
- **Contract**: `interface PitchFrame {timeMs: number; hz: number | null; clarity:
  number; levelDb: number}`; `interface SegmentOptions {minClarity (0.9),
  minLevelDb (−50), minNoteMs (80), stableMs (60), reattackDb (6),
  ignoreWindows: Array<[startMs, endMs]>}` with the defaults in parentheses exported as
  `DEFAULT_SEGMENT_OPTIONS`; `interface NoteEvent {midi (sounding, median of the
  event's frames), startMs, durationMs, meanCents, frames, suspectOctave: number,
  suspectTwelfth: number}`; `segment(frames, options?) → NoteEvent[]`. Onset rules as in
  Implementation Approach; frames inside an ignore window are treated as unvoiced but do
  not end a note already sounding. `suspectOctave` / `suspectTwelfth` count the event's
  frames whose nearest MIDI differs from the event's median by ±12 / ±19.

#### 2. Quantization
- **File**: `src/spike-nuty/logic/quantize.ts`, `src/spike-nuty/logic/quantize.test.ts`
- **Goal**: snap events to the eighth-note grid of the chosen tempo.
- **Contract**: `eighthMs(bpm)`; `quantize(events, bpm) → QuantizedNote[]` where
  `QuantizedNote = NoteEvent & {startEighth, durationEighths}` (duration ≥ 1); events
  starting before −½ eighth are dropped (played during the count-in).

#### 3. Comparison and score
- **File**: `src/spike-nuty/logic/compare.ts`, `src/spike-nuty/logic/compare.test.ts`
- **Goal**: align played (written-pitch) notes to the melody and grade each note.
- **Contract**: `interface CompareOptions {ignoreOctave (false), onsetToleranceEighths
  (0), durationToleranceEighths (1)}`; `type NoteGrade = 'green' | 'yellow' | 'red'`;
  `compare(melody, played: QuantizedNote[] in written pitch, options?) →
  {reference: Array<{note: RefNote, grade: NoteGrade, playedIndex: number | null}>,
  played: Array<{note: QuantizedNote, grade: NoteGrade | 'extra'}>, scorePercent,
  pitchPercent}`. Alignment and grading per *Critical Implementation Details*.

### Success criteria
#### Automated
- `pnpm test src/spike-nuty/logic` passes, covering at least: a clean synthetic
  sequence of steady tones segments into the right number of events with correct
  starts (±1 frame); a repeated same pitch separated by a level dip gives two events;
  frames inside an ignore window do not create an event; a 2-frame octave jump inside a
  note does not split it and is counted in `suspectOctave`; events shorter than
  `minNoteMs` are dropped
- Quantization tests pass: onsets at 60 and 100 BPM snap to the nearest eighth,
  durations round with a minimum of 1, count-in events are dropped
- Comparison tests pass: a perfect performance scores 100 with all green; a note one
  eighth late is yellow; a wrong pitch is red; a missing note is red with
  `playedIndex` null; an extra note is `extra` and does not lower the score; a note an
  octave off is red by default and green with `ignoreOctave`
- `pnpm lint` and `pnpm typecheck` pass
#### Manual
- None

## Phase 3: Hidden route, lazy screen shell and README
### Overview
The spike becomes reachable at `?spike=nuty` without touching the rest of the app,
with the settings form and the README; no audio yet.

### Required changes
#### 1. Dependencies
- **File**: `package.json`, `pnpm-lock.yaml`
- **Goal**: add `pitchy` and `vexflow` as runtime dependencies (owner-authorised; only
  imported from `src/spike-nuty/`).
- **Contract**: `pnpm add pitchy vexflow`; lockfile committed.

#### 2. Route check and lazy entry
- **File**: `src/spike-nuty/route.ts`, `src/spike-nuty/route.test.ts`, `src/main.tsx`
- **Goal**: render the spike screen instead of `<App>` only when the query string has
  `spike=nuty`; load it with `React.lazy(() => import('./spike-nuty/SpikeScreen.tsx'))`
  inside `Suspense`. `route.ts` must not import anything heavy (it is in the main chunk).
  The existing side effects in `main.tsx` stay as they are.
- **Contract**: `isSpikeRoute(search: string): boolean` (`'?spike=nuty'` → true;
  `''`, `'?spike=x'`, `'?other=nuty'` → false).

#### 3. Screen shell and copy
- **File**: `src/spike-nuty/SpikeScreen.tsx`, `src/spike-nuty/copy.ts`,
  `src/spike-nuty/SpikeScreen.test.tsx`
- **Goal**: the screen layout with title "Zagraj i sprawdź (spike)", melody picker,
  instrument select (Klarnet B♭ default, Instrument w C), tempo slider 60-100 default 60,
  "Ignoruj oktawę" (off), "Tylko wizualny metronom" (off), Start/Stop button, and empty
  placeholders for the staff, score and diagnostics. All UI strings in `copy.ts`, Polish.
  Default export for `React.lazy`.
- **Contract**: `export default function SpikeScreen()`.

#### 4. README
- **File**: `src/spike-nuty/README.md`
- **Goal**: what the spike checks, how to test on an iPhone (open the preview with
  `?spike=nuty`, add to home screen, allow the mic, play each melody at 60 and 90 BPM,
  with and without visual-only metronome, read the diagnostics), and a `## Werdykt`
  section left to be filled in.

### Success criteria
#### Automated
- `pnpm test` passes, including `isSpikeRoute` cases and a SpikeScreen render test
  showing the Polish defaults (Klarnet B♭, 60 BPM, both toggles off)
- `pnpm lint`, `pnpm typecheck` and `pnpm build` pass
- After `pnpm build`, the entry script referenced by `dist/index.html` does not contain
  the string `Zagraj i sprawdź`, and another file in `dist/assets/` does
#### Manual
- Opening the app without the parameter looks and behaves exactly as before

## Phase 4: Metronome, microphone and live pitch
### Overview
Count-in, metronome and recording with live pitch frames feeding the diagnostics panel;
after stopping, the raw events are listed.

### Required changes
#### 1. Metronome
- **File**: `src/spike-nuty/audio/metronome.ts`
- **Goal**: schedule clicks on the `AudioContext` clock with look-ahead scheduling;
  accented beat 1; one-bar count-in; optional silent clicks during recording; expose the
  click times (for ignore windows) and the current beat (for the visual marker).
- **Contract**: `createMetronome(ctx, {bpm, beatsPerBar: 4, silentAfterCountIn}) →
  {start(): number /* downbeat time in ctx seconds */, stop(), clickTimesMs(),
  onBeat(cb: (bar, beat, isCountIn) => void)}`.

#### 2. Microphone and pitch tracker
- **File**: `src/spike-nuty/audio/mic.ts`, `src/spike-nuty/audio/pitchTracker.ts`,
  `src/spike-nuty/audio/mic.test.ts`
- **Goal**: open the microphone with voice processing off and map failures to typed
  errors; poll an `AnalyserNode` with `pitchy` every ~20 ms producing `PitchFrame`s
  (time relative to the downbeat, Hz, clarity, level in dBFS from RMS).
- **Contract**: `openMic(ctx) → Promise<{source, stop()}>`, rejecting with
  `MicError {kind: 'denied' | 'unavailable' | 'other'}`;
  `createPitchTracker(ctx, source, downbeatSec) → {frames(): PitchFrame[],
  latest(): PitchFrame | null, stop()}`.

#### 3. Recording flow and diagnostics
- **File**: `src/spike-nuty/SpikeScreen.tsx`, `src/spike-nuty/DiagnosticsPanel.tsx`,
  `src/spike-nuty/copy.ts`, `src/spike-nuty/SpikeScreen.test.tsx`
- **Goal**: Start creates/resumes the `AudioContext` and opens the mic inside the tap;
  shows the count-in and a visual beat marker (bar/beat, highlighted on beat 1); stops
  automatically one bar after the melody or on Stop; then segments the frames with the
  click ignore windows and lists the events. Diagnostics show live Hz, note name
  (sounding and written), cents, level, and per event: written note, start ms, length
  ms, octave/twelfth suspicion counts. Permission and no-mic errors show Polish
  messages with a retry.

### Success criteria
#### Automated
- `pnpm test` passes, including: `openMic` maps `NotAllowedError` to `denied` and a
  missing `navigator.mediaDevices` to `unavailable`; SpikeScreen shows the Polish
  permission-denied message when the mic is denied (audio modules mocked)
- `pnpm lint`, `pnpm typecheck` and `pnpm build` pass
#### Manual
- On an iPhone (Safari, standalone PWA from the home screen) the count-in clicks are
  heard, the beat marker moves, the diagnostics show a steady note name and cents while
  a clarinet holds a note, and metronome clicks do not appear as events
- Denying the microphone shows the Polish message

## Phase 5: Staff, grading and score
### Overview
Grade the recording and show both staves coloured, with the score.

### Required changes
#### 1. Staff rendering
- **File**: `src/spike-nuty/Staff.tsx`, `src/spike-nuty/staffModel.ts`,
  `src/spike-nuty/staffModel.test.ts`
- **Goal**: render with `vexflow/bravura` (SVG backend) a treble-clef 4/4 staff of the
  reference melody and a second staff of the played notes, in written pitch, each note
  coloured by its grade (green `#16a34a`, yellow `#ca8a04`, red `#dc2626`, ungraded
  black). Played durations map to the nearest renderable value (8, q, qd, h, hd, w)
  without ties; the played staff uses a soft voice (no bar-sum check). Wraps to several
  systems to fit a phone width. `staffModel.ts` is the pure mapping (MIDI → VexFlow key
  such as `f#/3`, eighths → duration, grade → colour) and is unit-tested; `Staff.tsx`
  only draws.
- **Contract**: `<Staff reference={…} played={…} />` taking the `compare` result.

#### 2. Results on the screen
- **File**: `src/spike-nuty/SpikeScreen.tsx`, `src/spike-nuty/copy.ts`,
  `src/spike-nuty/SpikeScreen.test.tsx`
- **Goal**: after a recording: written-pitch played notes (sounding → written by the
  selected instrument), quantized at the chosen tempo, compared with the selected
  melody using the ignore-octave toggle; show the staves, the score in % and the
  pitch-only %, plus a legend of the three colours in Polish. The staff is mocked in the
  screen test.

### Success criteria
#### Automated
- `pnpm test` passes, including `staffModel` cases (keys for E3, F#3, G4; durations for
  1, 2, 3, 4, 6, 8 eighths; colours per grade) and a SpikeScreen test that feeds
  synthetic events and shows the score text
- `pnpm lint`, `pnpm typecheck` and `pnpm build` pass
- `pnpm test:e2e` passes (existing suite unchanged)
- After `pnpm build`, the entry script referenced by `dist/index.html` contains neither
  `Zagraj i sprawdź` nor `Bravura`
#### Manual
- On an iPhone, playing "Panie Janie" correctly at 60 BPM gives mostly green notes and a
  high score; a deliberately wrong note turns red, a late note yellow
- Diagnostics panel lets the team judge octave/twelfth errors on the low E3-A3 exercise

## Testing Strategy
- Unit (Vitest, jsdom): all pure logic in `src/spike-nuty/logic/` on synthetic frames;
  `isSpikeRoute`; `openMic` error mapping with a stubbed `navigator.mediaDevices`;
  `staffModel` mapping; SpikeScreen render tests with audio modules and `Staff` mocked
  (jsdom has no Web Audio and no SVG text measuring).
- E2E: none new; the existing Playwright suite must pass (run in phase 5).
- Manual: the product owner's test on an iPhone via the PR preview, guided by the README.

## Performance Notes
- Polling the analyser every ~20 ms with a 2048-sample window is light on a phone;
  frames are kept in memory only for one recording (a few thousand objects).
- The spike chunk (VexFlow with one font) may exceed Workbox's 2 MiB precache limit;
  the resulting build warning is acceptable (the spike then needs network on first
  open). The service-worker config is not changed.

## References
- Request: `context/changes/spike-zagraj-i-sprawdz/change.md`
- Entry point: `src/main.tsx:29`; conventions: `src/practice/`; test config:
  `vite.config.ts:86-91`; precache: `vite.config.ts:47`
- Stack: `context/foundation/tech-stack.md`

## Progress

### Phase 1: Notes, transposition and melodies
#### Automated
- [x] 1.1 `pnpm test src/spike-nuty/logic` passes, covering: 440 Hz → A4 0 cents; 261.63 Hz → C4; 452 Hz → A4 about +46 cents; 147 Hz sounding → D3 → written E3 on clarinet; instrument `c` leaves pitch unchanged; invalid Hz → null — f1a55b7
- [x] 1.2 Melody tests pass: every bar sums to 8 eighths, every pitch in E3–G4 written, none at or above A#4, three melodies with distinct ids — f1a55b7
- [x] 1.3 `pnpm lint` and `pnpm typecheck` pass — f1a55b7
#### Manual

### Phase 2: Segmentation, quantization and comparison
#### Automated
- [x] 2.1 `pnpm test src/spike-nuty/logic` passes, covering at least: a clean synthetic sequence of steady tones segments into the right number of events with correct starts (±1 frame); a repeated same pitch separated by a level dip gives two events; frames inside an ignore window do not create an event; a 2-frame octave jump inside a note does not split it and is counted in `suspectOctave`; events shorter than `minNoteMs` are dropped — e52757d
- [x] 2.2 Quantization tests pass: onsets at 60 and 100 BPM snap to the nearest eighth, durations round with a minimum of 1, count-in events are dropped — e52757d
- [x] 2.3 Comparison tests pass: a perfect performance scores 100 with all green; a note one eighth late is yellow; a wrong pitch is red; a missing note is red with `playedIndex` null; an extra note is `extra` and does not lower the score; a note an octave off is red by default and green with `ignoreOctave` — e52757d
- [x] 2.4 `pnpm lint` and `pnpm typecheck` pass — e52757d
#### Manual

### Phase 3: Hidden route, lazy screen shell and README
#### Automated
- [x] 3.1 `pnpm test` passes, including `isSpikeRoute` cases and a SpikeScreen render test showing the Polish defaults (Klarnet B♭, 60 BPM, both toggles off) — 24e606d
- [x] 3.2 `pnpm lint`, `pnpm typecheck` and `pnpm build` pass — 24e606d
- [x] 3.3 After `pnpm build`, the entry script referenced by `dist/index.html` does not contain the string `Zagraj i sprawdź`, and another file in `dist/assets/` does — 24e606d
#### Manual
- [ ] 3.4 Opening the app without the parameter looks and behaves exactly as before

### Phase 4: Metronome, microphone and live pitch
#### Automated
- [x] 4.1 `pnpm test` passes, including: `openMic` maps `NotAllowedError` to `denied` and a missing `navigator.mediaDevices` to `unavailable`; SpikeScreen shows the Polish permission-denied message when the mic is denied (audio modules mocked)
- [x] 4.2 `pnpm lint`, `pnpm typecheck` and `pnpm build` pass
#### Manual
- [ ] 4.3 On an iPhone (Safari, standalone PWA from the home screen) the count-in clicks are heard, the beat marker moves, the diagnostics show a steady note name and cents while a clarinet holds a note, and metronome clicks do not appear as events
- [ ] 4.4 Denying the microphone shows the Polish message

### Phase 5: Staff, grading and score
#### Automated
- [ ] 5.1 `pnpm test` passes, including `staffModel` cases (keys for E3, F#3, G4; durations for 1, 2, 3, 4, 6, 8 eighths; colours per grade) and a SpikeScreen test that feeds synthetic events and shows the score text
- [ ] 5.2 `pnpm lint`, `pnpm typecheck` and `pnpm build` pass
- [ ] 5.3 `pnpm test:e2e` passes (existing suite unchanged)
- [ ] 5.4 After `pnpm build`, the entry script referenced by `dist/index.html` contains neither `Zagraj i sprawdź` nor `Bravura`
#### Manual
- [ ] 5.5 On an iPhone, playing "Panie Janie" correctly at 60 BPM gives mostly green notes and a high score; a deliberately wrong note turns red, a late note yellow
- [ ] 5.6 Diagnostics panel lets the team judge octave/twelfth errors on the low E3-A3 exercise
