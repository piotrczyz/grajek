# Fix round 4: telemetria-zagraj-i-sprawdz, increment 2 (client feedback 2)

Report: `reviews/impl-review-inc-2-feedback-2.md` (its `**Round**: 1`). Named `fix-r4`
because `fix-r1.md`..`fix-r3.md` are taken; the commit carries `(r4)`. FIX findings: F1, F2.
F3 is ACCEPT (push and CI check are the caller's step) and was left untouched.

## F1: "Nuta po nucie" fits 360 px with a wide font

- `src/spike-nuty/results.ts`: late/early timing is the signed offset only
  (`copy.signedMs(offsetMs)`, e.g. `+600 ms`); the status word stays in the Ocena column.
  The now identical late/early branch merged into the default `signedMs` branch.
- `src/spike-nuty/results.test.ts:87-88`: expectations `'+600 ms'` and `'−400 ms'`.
  No SpikeScreen test read the old text.
- `src/spike-nuty/SpikeScreen.tsx` `NotesTable`: cell padding `px-1` -> `px-0.5` on `th`
  and `td`. Layout stays `table-auto`, no mid-word breaks: "−1180 ms" and "za krótko" wrap at
  the space, every word stays whole.

## F2: the 360 px spec measures with the CI font too

`e2e/spike-nuty-narrow.spec.ts`: the real-rows assertions are unchanged. The worst-case
block is a helper run twice: with the device font, then with the table forced to
`font-family: "DejaVu Sans", Verdana, sans-serif; font-size: 14px`. Both runs assert
`clipped == []` and `table.scrollWidth <= section.clientWidth`; no tolerance added. Worst-case
texts are the longest the code can render after F1: `15`, `Fis4`, `Gis5`, `−1200`; Czas
alternates `−1180 ms`, `+1180 ms`, `za krótko`, `za długo`; Ocena alternates `za wcześnie`,
`dodatkowa`, `zła nuta`.

## Measurements (Windows, Chromium, Pixel 7 project at 360x800, worst-case rows)

Measured with a temporary `console.log` in the spec (removed before commit). `min-content`
= the table's intrinsic minimum width (`style.width = 'min-content'`), i.e. the headroom.

| Table state | Font | scrollWidth / section | min-content | Clipped | Th widths (#, Wzór, Gra, Cent, Czas, Ocena) |
|---|---|---|---|---|---|
| before fix (old code, new texts) | DejaVu Sans/Verdana 14 px | **325** / 324 (red) | — | none | — |
| after fix | device default (Segoe UI) 12 px | 324 / 324 | 246 | none | 22, 44, 34, 49, 73, 102 |
| after fix | DejaVu Sans/Verdana 14 px | 324 / 324 | **298** | none | 22, 45, 35, 52, 66, 103 |
| after fix (probe only, not asserted) | DejaVu Sans/Verdana 16 px | 336 / 324 | 336 | none | 25, 51, 40, 58, 58, 104 |

`scrollWidth` 324 = the `w-full` table filling the section. With the wide font at 14 px (17%
larger than the real 12 px) the table needs 298 px, 26 px below the 324 px section. The
review measured CI's case (Verdana 12 px, old code) at 330. At 16 px the wide font no longer
fits (probe only; not part of the owner's acceptance bar).

## Red-first proof

With `SpikeScreen.tsx` and `results.ts` reverted (`git stash push -- <paths>`) and the new spec:

```
PLAYWRIGHT_BROWSERS_PATH=...\ms-playwright pnpm test:e2e spike-nuty-narrow
    Expected: <= 324
    Received:    325
        at e2e\spike-nuty-narrow.spec.ts:82:31   (the wide-font tableWidth assertion)
  1 failed
```

With `results.ts` reverted:

```
pnpm exec vitest run src/spike-nuty/results.test.ts
 FAIL  src/spike-nuty/results.test.ts > noteRows > describes every reference note and every extra in time order
      Tests  1 failed | 6 passed (7)
```

Both pass with the fix restored (`1 passed`, `Tests 7 passed (7)`).

## Full set (after the fix)

```
pnpm test           Test Files  61 passed (61) / Tests  609 passed (609)   exit 0
pnpm lint           eslint .                                               exit 0
pnpm typecheck      tsc -b                                                 exit 0
pnpm build          vite build, dist/sw.js generated                       exit 0
pnpm test:e2e       18 passed (12.8s)                                      exit 0
```

Baseline comparison: the approved feedback-1 round recorded 609 unit and 18 e2e green; same
counts now, no new failures.
