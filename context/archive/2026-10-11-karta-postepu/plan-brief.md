# Progress Card (Karta postępu) — Plan Brief
Full plan: `context/changes/karta-postepu/plan.md` · request text: `change.md` · roadmap slice S-06 in `context/foundation/roadmap.md` · PRD FR-008

## What & why
The student can share a picture of their own week of practice (e.g. "4 dni z muzyką w tym tygodniu", the instrument) with the family through the phone's share sheet. It rewards effort without names or numbers that invite competition (PRD FR-008 challenge).

## Starting point
The home screen (`src/profile/ProfileScreen.tsx`) already loads this week's music days (`:21`, `:35`) and knows the instrument (`:68-70`). The `practices` store (migration v4) is enough; nothing about the card exists yet, and no canvas library is installed.

## Desired end state
A "Pokaż rodzinie" button below the week view (shown once the week has a music day) generates a 1080x1080 PNG on the device, offline, and opens the system share sheet; without file sharing the image downloads as `karta-postepu.png`.

## Complexity
LOW — one feature module plus a one-element insertion into an existing screen; no data model, migration or dependency change. Three phases because rendering and sharing need separate injectable seams for jsdom tests.

Skipped: rs-research (data and placement are clear from a quick read of `ProfileScreen.tsx` and `practiceStore.ts`) and rs-frame (the request states an observable outcome, not a cause); Jev was asked but answered `unavailable` (dry mode, p=0.30 / 0.13).

## Key decisions made
| Decision | Choice | Why | Source |
|---|---|---|---|
| Areas | One area A1 karta-postepu, one increment | Orchestrator split; feature fits one deployable slice | Orchestrator |
| Name / pseudonym on the card | Not shown; model input has no name field | PRD FR-001 challenge: "na karcie do udostępnienia nie ma danych osobowych" (`prd.md:67`); NFR Prywatność | Issue |
| Numbers on the card | Only "N dzień/dni z muzyką w tym tygodniu"; no minutes, totals or streaks | FR-008 challenge names this exact example and forbids competitive numbers (`prd.md:90`) | Issue |
| Weekly goal on the card | Not shown | S-03 is unmerged and built in parallel; avoids coupling | Auto |
| Data source | Reuse `musicDays` / `now` already in `ProfileScreen`; no extra store read | `ProfileScreen.tsx:21`, `:35`, `:105`; keeps share inside user activation | Auto |
| IndexedDB schema | No migration, no version bump; read-only | Requester constraint; `practices` store + `byDay` index suffice (`migrations.ts:38-43`) | Orchestrator |
| Button placement | Inside `ProfileScreen`, below `WeekView`; `App.tsx` untouched | Requester constraint; component already holds the data | Orchestrator |
| Rendering technology | Canvas 2D (`HTMLCanvasElement.toBlob`), no new dependency | Requester preference; html2canvas adds a dependency and is unreliable with emoji/offline fonts; SVG needs decode + font embedding | Auto |
| Share mechanism | `navigator.canShare({files})` then `navigator.share`; else download via object URL + `<a download>` | FR-008 acceptance + requested fallback | Issue |
| Cancel vs failure | `AbortError` silent; other share errors fall back to download | User cancel is not an error; any failure still gives the child the image | Auto |
| Button when the week is empty | Hidden at 0 music days | A card saying "0 dni" is discouraging and has nothing to show | Auto |
| Button label | "Pokaż rodzinie" | Child-readable, names the intended audience (family) | Auto |
| Card format | 1080x1080 PNG, app colours, system font, instrument emoji | Square fits messengers; system font works offline | Auto |
| Testability | Injectable canvas/context and navigator/download; real PNG proven in Playwright | jsdom has no canvas (`vite.config.ts` test env) | Auto |

## Scope
In: copy, card model, Canvas renderer, share/download service, button component, one insertion in `ProfileScreen.tsx`, unit tests, one e2e spec.
Out: goal, month, totals, badges, multi-instrument, any server or link, `App.tsx`, storage, dependencies.

## Architecture / Approach
New module `src/progress-card/` (copy, cardModel, renderCard, shareCard, ShareCardButton, index). Data flows from `ProfileScreen` props/state into the button; nothing new is stored.

## Increments at a glance
| # | Delivers | Depends on | User-visible | Key risk |
|---|---|---|---|---|
| 1 | Share button + on-device Progress Card | — | yes | share sheet behaviour differs across phones |

## Phases at a glance
| Phase | Increment | Delivers | Key risk |
|---|---|---|---|
| 1 | 1 | Card model + Polish copy | plural/wording |
| 2 | 1 | Canvas renderer + share/download service | user activation lost before `share` |
| 3 | 1 | Button in `ProfileScreen` + e2e | merge conflict in `ProfileScreen.tsx` |

Prerequisites: F-01, S-01, S-07, S-02 stacked under this branch (base `e4e6ed3`), unmerged.

## Open risks & assumptions
- **Merge conflicts:** `App.tsx` is not edited (zero conflict risk there). `src/profile/ProfileScreen.tsx` gets one import and one element after `WeekView`; S-03 (goal) and S-04 (month) may also edit this file, so a small textual conflict at the end of the JSX is possible and trivial to resolve.
- iOS Safari requires the share call within the tap's user activation; the plan keeps only `toBlob` between tap and `share`.
- Emoji rendering on the card depends on the phone's emoji font (acceptable; same as the home screen).
- Real share sheets can only be verified by a human on devices (Manual 3.5).

## Success criteria (summary)
Unit tests for model, renderer, share service and button; e2e offline for share (stubbed) and download fallback with a real 1080x1080 PNG; build/typecheck/lint green; no diff in `App.tsx`, `src/storage`, `package.json`, lockfile.
